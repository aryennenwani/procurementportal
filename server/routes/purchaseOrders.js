const express = require('express');
const { param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireProcurementManager } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { getClientIp, toIST } = require('../utils');
const { syncPoToSap, isSapConfigured } = require('../services/sap');
const { renderPoPdf } = require('../services/poPdf');

const router = express.Router();
router.use(requireAuth);

const PO_SELECT = `
  SELECT po.*, r.title AS requirement_title, r.quantity, r.unit, r.grade, r.plant_code,
         v.company_name AS vendor_name, v.contact_person AS vendor_contact,
         v.email AS vendor_email, v.phone AS vendor_phone, v.sap_supplier_code,
         q.per_unit_price, q.payment_terms, q.lead_time_days, q.validity_period,
         m.name AS created_by_name
  FROM purchase_orders po
  JOIN requirements r ON r.id = po.requirement_id
  JOIN vendors v ON v.id = po.vendor_id
  JOIN quotations q ON q.id = po.quotation_id
  JOIN managers m ON m.id = po.created_by
`;

function serialize(po) {
  return {
    ...po,
    payload_json: undefined,
    created_at_ist: toIST(po.created_at),
    synced_at_ist: po.synced_at ? toIST(po.synced_at) : null,
  };
}

router.get('/', (req, res) => {
  const orders = db.prepare(`${PO_SELECT} ORDER BY po.created_at DESC`).all().map(serialize);
  res.json({ purchase_orders: orders, sap_configured: isSapConfigured() });
});

router.get('/requirement/:requirementId', [param('requirementId').isInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

  const po = db.prepare(`${PO_SELECT} WHERE po.requirement_id = ?`).get(req.params.requirementId);
  if (!po) return res.status(404).json({ error: 'No purchase order exists for this requirement.' });
  res.json({ purchase_order: serialize(po), sap_configured: isSapConfigured() });
});

// Re-attempts the SAP sync for a failed (or local) PO — e.g. after fixing the vendor's
// SAP supplier code or restoring connectivity.
router.post('/:id/retry', requireProcurementManager, [param('id').isInt()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Purchase order not found.' });
  if (po.sap_status === 'synced') {
    return res.status(409).json({ error: `This purchase order is already in SAP as ${po.sap_po_number}.` });
  }

  recordAudit({
    actionType: 'SAP_PO_RETRY_REQUESTED',
    performedBy: `manager:${req.manager.id}(${req.manager.email})`,
    targetType: 'purchase_order',
    targetId: po.id,
    details: { po_number: po.po_number },
    ip: getClientIp(req),
  });

  await syncPoToSap(po.id);
  const updated = db.prepare(`${PO_SELECT} WHERE po.id = ?`).get(po.id);
  res.json({ purchase_order: serialize(updated) });
});

// Formal purchase-order document, generated from the archived winning quotation.
router.get('/:id/pdf', [param('id').isInt()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

  const po = db.prepare(`${PO_SELECT} WHERE po.id = ?`).get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Purchase order not found.' });

  recordAudit({
    actionType: 'PO_PDF_DOWNLOADED',
    performedBy: `manager:${req.manager.id}(${req.manager.email})`,
    targetType: 'purchase_order',
    targetId: po.id,
    details: { po_number: po.po_number },
    ip: getClientIp(req),
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${po.po_number}.pdf"`);
  renderPoPdf(po, res);
});

module.exports = router;
