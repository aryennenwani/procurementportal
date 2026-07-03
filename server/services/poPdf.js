// Purchase-order document rendering, shared by the download route and the
// automatic "PO to winning vendor" email.
const { PassThrough } = require('stream');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { toIST } = require('../utils');

// One PO row joined with everything the document (and email) needs.
function getFullPurchaseOrder(id) {
  return db.prepare(`
    SELECT po.*, r.title AS requirement_title, r.quantity, r.unit, r.grade,
           v.company_name AS vendor_name, v.contact_person AS vendor_contact,
           v.email AS vendor_email, v.phone AS vendor_phone, v.sap_supplier_code,
           q.per_unit_price, q.payment_terms, q.lead_time_days, q.validity_period,
           m.name AS created_by_name
    FROM purchase_orders po
    JOIN requirements r ON r.id = po.requirement_id
    JOIN vendors v ON v.id = po.vendor_id
    JOIN quotations q ON q.id = po.quotation_id
    JOIN managers m ON m.id = po.created_by
    WHERE po.id = ?
  `).get(id);
}

// Writes the branded PO document into any writable stream (HTTP response or buffer collector).
function renderPoPdf(po, stream) {
  const NAVY = '#0B2D71';
  const GRAY = '#5B6B8C';
  const money = (n) => `Rs. ${Number(n).toLocaleString('en-IN')}`;

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(stream);

  // Header band
  doc.rect(0, 0, doc.page.width, 96).fill(NAVY);
  doc.fillColor('#FFFFFF').fontSize(19).font('Helvetica-Bold').text('SHIVTEK SPECHEMI INDUSTRIES LTD', 50, 28);
  doc.fontSize(9).font('Helvetica').fillColor('#B9CBF2').text('Vendor Quotation & Procurement Portal', 50, 54);
  doc.fontSize(15).font('Helvetica-Bold').fillColor('#FFFFFF').text('PURCHASE ORDER', 50, 28, { align: 'right' });
  doc.fontSize(10).font('Helvetica').fillColor('#B9CBF2').text(po.po_number, 50, 50, { align: 'right' });
  if (po.sap_po_number) {
    doc.text(`SAP PO: ${po.sap_po_number}`, 50, 64, { align: 'right' });
  }

  let y = 120;

  // Vendor / order meta two-column block
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(GRAY).text('SUPPLIER', 50, y);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#111A2E').text(po.vendor_name, 50, y + 14);
  doc.fontSize(9).font('Helvetica').fillColor('#333F5C');
  doc.text(`Attn: ${po.vendor_contact}`, 50, y + 30);
  doc.text(po.vendor_email, 50, y + 43);
  doc.text(po.vendor_phone, 50, y + 56);
  if (po.sap_supplier_code) doc.text(`SAP Supplier Code: ${po.sap_supplier_code}`, 50, y + 69);

  const metaX = 330;
  const meta = [
    ['PO Date', toIST(po.created_at)],
    ['Raised By', po.created_by_name],
    ['ERP Status', po.sap_status === 'synced' ? `Synced to SAP (${po.sap_po_number})` : po.sap_status === 'failed' ? 'SAP sync failed — pending retry' : po.sap_status === 'pending' ? 'SAP sync in progress' : 'Portal record (SAP not connected)'],
    ['Currency', po.currency],
  ];
  meta.forEach(([label, value], i) => {
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(GRAY).text(label.toUpperCase(), metaX, y + i * 22);
    doc.fontSize(9).font('Helvetica').fillColor('#111A2E').text(String(value), metaX, y + i * 22 + 10, { width: 215 });
  });

  y += 100;

  // Item table
  doc.rect(50, y, doc.page.width - 100, 22).fill('#EEF3FE');
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(NAVY);
  doc.text('ITEM DESCRIPTION', 58, y + 7);
  doc.text('QTY', 300, y + 7, { width: 70, align: 'right' });
  doc.text('UNIT PRICE', 380, y + 7, { width: 75, align: 'right' });
  doc.text('AMOUNT', 465, y + 7, { width: 80, align: 'right' });
  y += 22;

  doc.rect(50, y, doc.page.width - 100, 34).strokeColor('#DCE4F5').stroke();
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#111A2E').text(po.requirement_title, 58, y + 7, { width: 230 });
  if (po.grade) doc.fontSize(8).font('Helvetica').fillColor(GRAY).text(`Grade: ${po.grade}`, 58, y + 21, { width: 230 });
  doc.fontSize(9.5).font('Helvetica').fillColor('#111A2E');
  doc.text(`${po.quantity} ${po.unit}`, 300, y + 11, { width: 70, align: 'right' });
  doc.text(money(po.per_unit_price), 380, y + 11, { width: 75, align: 'right' });
  doc.text(money(po.total_amount), 465, y + 11, { width: 80, align: 'right' });
  y += 46;

  // Total
  doc.fontSize(10).font('Helvetica-Bold').fillColor(NAVY).text('TOTAL', 380, y, { width: 75, align: 'right' });
  doc.fontSize(12).text(money(po.total_amount), 445, y - 1, { width: 100, align: 'right' });
  y += 34;

  // Terms
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(GRAY).text('TERMS & CONDITIONS', 50, y);
  y += 14;
  doc.fontSize(9).font('Helvetica').fillColor('#333F5C');
  doc.text(`Payment Terms: ${po.payment_terms}`, 50, y); y += 13;
  doc.text(`Delivery Lead Time: ${po.lead_time_days} days from PO date`, 50, y); y += 13;
  doc.text(`Quotation Validity: ${po.validity_period}`, 50, y); y += 13;
  doc.text('This purchase order is issued against the vendor’s winning quotation recorded in the procurement portal.', 50, y);
  y += 40;

  // Signature block
  doc.moveTo(50, y + 30).lineTo(200, y + 30).strokeColor('#9AA9C7').stroke();
  doc.fontSize(8.5).fillColor(GRAY).text('Authorised Signatory', 50, y + 36);
  doc.moveTo(395, y + 30).lineTo(545, y + 30).strokeColor('#9AA9C7').stroke();
  doc.text('Supplier Acknowledgement', 395, y + 36);

  doc.fontSize(7.5).fillColor('#9AA9C7').text(
    `System-generated from permanently archived quotation records • ${po.po_number} • Generated ${toIST(new Date().toISOString())}`,
    50, doc.page.height - 60, { align: 'center', width: doc.page.width - 100 },
  );

  doc.end();
}

// Renders the PO to an in-memory buffer (for email attachments).
function poPdfBuffer(po) {
  return new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    try {
      renderPoPdf(po, stream);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { getFullPurchaseOrder, renderPoPdf, poPdfBuffer };
