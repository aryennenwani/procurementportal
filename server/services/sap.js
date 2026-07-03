// SAP S/4HANA integration — creates purchase orders via the standard
// API_PURCHASEORDER_PROCESS_SRV OData V2 service when a winning bid is selected.
//
// Configuration (environment variables):
//   SAP_BASE_URL      e.g. https://myhost.s4hana.cloud.sap  (leave unset to run portal-only)
//   SAP_USERNAME      communication user for the API
//   SAP_PASSWORD      communication user password
//   SAP_CLIENT        optional sap-client number, e.g. 100
//   SAP_COMPANY_CODE  default company code   (default 1000)
//   SAP_PURCH_ORG     purchasing organization (default 1000)
//   SAP_PURCH_GROUP   purchasing group        (default 001)
//   SAP_PLANT         receiving plant         (default 1000)
//
// When SAP_BASE_URL is not set the portal still raises the PO internally
// (sap_status = 'local') so the business flow never blocks on ERP availability.

const db = require('../db');
const { recordAudit } = require('../middleware/audit');
const { getFullPurchaseOrder, poPdfBuffer } = require('./poPdf');
const { sendPurchaseOrderEmail } = require('./mailer');

const SAP_TIMEOUT_MS = 20000;

function sapConfig() {
  return {
    baseUrl: (process.env.SAP_BASE_URL || '').replace(/\/+$/, ''),
    username: process.env.SAP_USERNAME || '',
    password: process.env.SAP_PASSWORD || '',
    client: process.env.SAP_CLIENT || '',
    companyCode: process.env.SAP_COMPANY_CODE || '1000',
    purchOrg: process.env.SAP_PURCH_ORG || '1000',
    purchGroup: process.env.SAP_PURCH_GROUP || '001',
    plant: process.env.SAP_PLANT || '1000',
  };
}

function isSapConfigured() {
  const cfg = sapConfig();
  return Boolean(cfg.baseUrl && cfg.username && cfg.password);
}

// Payload for the standard S/4HANA purchase-order API (OData V2, NB standard PO).
function buildSapPayload({ requirement, quotation, vendor }) {
  const cfg = sapConfig();
  return {
    PurchaseOrderType: 'NB',
    CompanyCode: cfg.companyCode,
    PurchasingOrganization: cfg.purchOrg,
    PurchasingGroup: cfg.purchGroup,
    Supplier: vendor.sap_supplier_code,
    DocumentCurrency: 'INR',
    to_PurchaseOrderItem: [
      {
        PurchaseOrderItem: '10',
        Plant: cfg.plant,
        PurchaseOrderItemText: String(requirement.title).slice(0, 40),
        OrderQuantity: String(requirement.quantity),
        PurchaseOrderQuantityUnit: String(requirement.unit).slice(0, 3).toUpperCase(),
        NetPriceAmount: String(quotation.per_unit_price),
        NetPriceQuantity: '1',
        DocumentCurrency: 'INR',
      },
    ],
  };
}

function sapUrl(path) {
  const cfg = sapConfig();
  const clientSuffix = cfg.client ? `?sap-client=${cfg.client}` : '';
  return `${cfg.baseUrl}/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV${path}${clientSuffix}`;
}

function authHeader() {
  const cfg = sapConfig();
  return `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SAP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// SAP OData requires fetching a CSRF token (with session cookie) before any POST.
async function fetchCsrfToken() {
  const res = await fetchWithTimeout(sapUrl('/A_PurchaseOrder'), {
    method: 'HEAD',
    headers: {
      Authorization: authHeader(),
      'x-csrf-token': 'Fetch',
      Accept: 'application/json',
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`SAP authentication failed (HTTP ${res.status}). Check SAP_USERNAME / SAP_PASSWORD.`);
  }
  const token = res.headers.get('x-csrf-token');
  if (!token) throw new Error('SAP did not return a CSRF token — check SAP_BASE_URL and service activation.');
  const cookies = (res.headers.getSetCookie ? res.headers.getSetCookie() : [])
    .map((c) => c.split(';')[0])
    .join('; ');
  return { token, cookies };
}

// Extracts a readable message from SAP's deeply nested OData error envelope.
function sapErrorMessage(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    return parsed?.error?.message?.value || bodyText.slice(0, 300);
  } catch {
    return bodyText.slice(0, 300) || 'Unknown SAP error';
  }
}

// Posts the PO to SAP and returns the SAP-assigned purchase order number.
async function createPurchaseOrderInSap(payload) {
  const { token, cookies } = await fetchCsrfToken();
  const res = await fetchWithTimeout(sapUrl('/A_PurchaseOrder'), {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'x-csrf-token': token,
      ...(cookies ? { Cookie: cookies } : {}),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (res.status !== 201) {
    throw new Error(`SAP rejected the purchase order (HTTP ${res.status}): ${sapErrorMessage(text)}`);
  }
  const created = JSON.parse(text);
  const sapPoNumber = created?.d?.PurchaseOrder;
  if (!sapPoNumber) throw new Error('SAP created the document but returned no PurchaseOrder number.');
  return sapPoNumber;
}

// ---------------------------------------------------------------------------

const getPoRow = db.prepare('SELECT * FROM purchase_orders WHERE id = ?');

function nextPoNumber() {
  const year = new Date().getFullYear();
  const row = db.prepare(
    "SELECT COUNT(*) AS cnt FROM purchase_orders WHERE po_number LIKE ?"
  ).get(`PO-${year}-%`);
  return `PO-${year}-${String(row.cnt + 1).padStart(5, '0')}`;
}

// Attempts the SAP sync for an existing PO row and records the result.
// Never throws — failures are stored on the row (sap_status = 'failed') for retry.
async function syncPoToSap(poId) {
  const po = getPoRow.get(poId);
  if (!po) return null;

  const requirement = db.prepare('SELECT * FROM requirements WHERE id = ?').get(po.requirement_id);
  const quotation = db.prepare('SELECT * FROM quotations WHERE id = ?').get(po.quotation_id);
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(po.vendor_id);

  const fail = (message) => {
    db.prepare(`
      UPDATE purchase_orders
      SET sap_status = 'failed', sap_error = ?, sap_attempts = sap_attempts + 1
      WHERE id = ?
    `).run(message, poId);
    recordAudit({
      actionType: 'SAP_PO_SYNC_FAILED',
      performedBy: 'system:sap-integration',
      targetType: 'purchase_order',
      targetId: poId,
      details: { po_number: po.po_number, error: message },
      ip: null,
    });
    console.error(`[sap] PO ${po.po_number} sync failed: ${message}`);
    return getPoRow.get(poId);
  };

  if (!isSapConfigured()) {
    return fail('SAP connection is not configured (SAP_BASE_URL / SAP_USERNAME / SAP_PASSWORD).');
  }
  if (!vendor.sap_supplier_code) {
    return fail(`Vendor "${vendor.company_name}" has no SAP supplier code. Add it on the Vendors page, then retry.`);
  }

  const payload = buildSapPayload({ requirement, quotation, vendor });
  db.prepare('UPDATE purchase_orders SET payload_json = ? WHERE id = ?').run(JSON.stringify(payload), poId);

  try {
    const sapPoNumber = await createPurchaseOrderInSap(payload);
    db.prepare(`
      UPDATE purchase_orders
      SET sap_status = 'synced', sap_po_number = ?, sap_error = NULL,
          sap_attempts = sap_attempts + 1, synced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).run(sapPoNumber, poId);
    recordAudit({
      actionType: 'SAP_PO_CREATED',
      performedBy: 'system:sap-integration',
      targetType: 'purchase_order',
      targetId: poId,
      details: { po_number: po.po_number, sap_po_number: sapPoNumber, supplier: vendor.sap_supplier_code },
      ip: null,
    });
    console.log(`[sap] PO ${po.po_number} synced to SAP as ${sapPoNumber}`);
    return getPoRow.get(poId);
  } catch (err) {
    return fail(err.message);
  }
}

// Raises the internal PO for a winning quotation, then kicks off the SAP sync in the
// background. The internal record is created synchronously so it can never be lost;
// the ERP call must not block or fail the award decision.
function raisePurchaseOrderForWin({ requirementId, quotationId, managerId, ip }) {
  const existing = db.prepare('SELECT * FROM purchase_orders WHERE requirement_id = ?').get(requirementId);
  if (existing) return existing;

  const quotation = db.prepare('SELECT * FROM quotations WHERE id = ?').get(quotationId);
  const poNumber = nextPoNumber();

  const info = db.prepare(`
    INSERT INTO purchase_orders
      (po_number, requirement_id, quotation_id, vendor_id, total_amount, currency, sap_status, created_by)
    VALUES (?, ?, ?, ?, ?, 'INR', ?, ?)
  `).run(
    poNumber, requirementId, quotationId, quotation.vendor_id, quotation.total_value,
    isSapConfigured() ? 'pending' : 'local', managerId,
  );

  recordAudit({
    actionType: 'PURCHASE_ORDER_RAISED',
    performedBy: `manager:${managerId}`,
    targetType: 'purchase_order',
    targetId: info.lastInsertRowid,
    details: { po_number: poNumber, requirement_id: requirementId, quotation_id: quotationId, total_amount: quotation.total_value },
    ip: ip || null,
  });

  if (isSapConfigured()) {
    syncPoToSap(info.lastInsertRowid).catch((err) => console.error('[sap] unexpected sync error:', err));
  }

  emailPoToVendor(info.lastInsertRowid).catch((err) => console.error('[po-email] failed to email PO:', err));

  return getPoRow.get(info.lastInsertRowid);
}

// Emails the winning vendor their PO with the PDF document attached. Runs in the
// background — a mail failure never affects the award or the PO record (sendMail
// already audits failures as email_failed).
async function emailPoToVendor(poId) {
  const po = getFullPurchaseOrder(poId);
  if (!po) return;
  const pdf = await poPdfBuffer(po);
  const sent = await sendPurchaseOrderEmail({ po, pdfBuffer: pdf });
  if (!sent) return; // sendMail already recorded the email_failed audit entry
  recordAudit({
    actionType: 'PO_EMAILED_TO_VENDOR',
    performedBy: 'system:po-email',
    targetType: 'purchase_order',
    targetId: poId,
    details: { po_number: po.po_number, to: po.vendor_email },
    ip: null,
  });
}

module.exports = { isSapConfigured, raisePurchaseOrderForWin, syncPoToSap, buildSapPayload };
