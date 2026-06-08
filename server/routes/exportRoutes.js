const express = require('express');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const { param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { getClientIp, toIST } = require('../utils');

const router = express.Router();
router.use(requireAuth);

const getRequirement = db.prepare('SELECT * FROM requirements WHERE id = ?');

const getQuotations = db.prepare(`
  SELECT q.*, v.company_name, v.contact_person, v.email AS vendor_email,
         qo.outcome, qo.rejection_reason
  FROM quotations q
  JOIN vendors v ON v.id = q.vendor_id
  LEFT JOIN quotation_outcomes qo ON qo.quotation_id = q.id
  WHERE q.requirement_id = ? AND q.is_latest = 1
  ORDER BY q.per_unit_price ASC
`);

function loadExportData(requirementId) {
  const requirement = getRequirement.get(requirementId);
  if (!requirement) return null;
  const quotations = getQuotations.all(requirementId);
  return { requirement, quotations };
}

router.get('/:id/csv', [param('id').isInt().withMessage('Invalid requirement id')], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const data = loadExportData(req.params.id);
  if (!data) return res.status(404).json({ error: 'Requirement not found.' });

  const rows = data.quotations.map((q) => ({
    Vendor: q.company_name,
    'Contact Person': q.contact_person,
    Email: q.vendor_email,
    'Per Unit Price (₹)': q.per_unit_price,
    'Total Value (₹)': q.total_value,
    'Lead Time (days)': q.lead_time_days,
    'Validity Period': q.validity_period,
    'Payment Terms': q.payment_terms,
    Remarks: q.remarks || '',
    'Submitted At (IST)': toIST(q.submitted_at),
    Outcome: q.outcome === 'won' ? 'Won' : q.outcome === 'not_selected' ? 'Not Selected' : 'Pending Decision',
    'Rejection Reason': q.rejection_reason || '',
  }));

  const parser = new Parser({
    fields: ['Vendor', 'Contact Person', 'Email', 'Per Unit Price (₹)', 'Total Value (₹)', 'Lead Time (days)',
      'Validity Period', 'Payment Terms', 'Remarks', 'Submitted At (IST)', 'Outcome', 'Rejection Reason'],
  });
  const csv = rows.length > 0 ? parser.parse(rows) : 'No quotations submitted yet.';

  recordAudit({
    actionType: 'EXPORT_DOWNLOADED',
    performedBy: `manager:${req.manager.id}(${req.manager.email})`,
    targetType: 'requirement',
    targetId: req.params.id,
    details: { format: 'csv', requirement_title: data.requirement.title },
    ip: getClientIp(req),
  });

  const filename = `quotations-${data.requirement.title.replace(/[^a-z0-9]/gi, '_')}-${req.params.id}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

router.get('/:id/pdf', [param('id').isInt().withMessage('Invalid requirement id')], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const data = loadExportData(req.params.id);
  if (!data) return res.status(404).json({ error: 'Requirement not found.' });

  const { requirement, quotations } = data;
  const lowestPrice = quotations.length > 0 ? Math.min(...quotations.map((q) => q.per_unit_price)) : null;

  recordAudit({
    actionType: 'EXPORT_DOWNLOADED',
    performedBy: `manager:${req.manager.id}(${req.manager.email})`,
    targetType: 'requirement',
    targetId: req.params.id,
    details: { format: 'pdf', requirement_title: requirement.title },
    ip: getClientIp(req),
  });

  const filename = `quotations-${requirement.title.replace(/[^a-z0-9]/gi, '_')}-${req.params.id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(20).fillColor('#1C1C1E').text('Quotation Comparison Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#B8962E').text('Vendor Quotation & Procurement Portal', { align: 'center' });
  doc.moveDown(1.5);

  doc.fontSize(14).fillColor('#1C1C1E').text(requirement.title, { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#444');
  doc.text(`Description: ${requirement.description || '—'}`);
  doc.text(`Quantity: ${requirement.quantity} ${requirement.unit}`);
  doc.text(`Grade / Specification: ${requirement.grade || '—'}`);
  doc.text(`Deadline: ${toIST(requirement.deadline)}`);
  doc.text(`Status: ${requirement.status}`);
  doc.text(`Generated: ${toIST(new Date().toISOString())}`);
  doc.moveDown(1);

  doc.fontSize(13).fillColor('#1C1C1E').text(`Quotations Received (${quotations.length})`, { underline: true });
  doc.moveDown(0.5);

  if (quotations.length === 0) {
    doc.fontSize(10).fillColor('#666').text('No quotations have been submitted for this requirement yet.');
  } else {
    quotations.forEach((q, idx) => {
      const isLowest = q.per_unit_price === lowestPrice;
      doc.moveDown(0.4);
      doc.fontSize(11).fillColor(isLowest ? '#1f7a1f' : '#1C1C1E')
        .text(`${idx + 1}. ${q.company_name}${isLowest ? '  ★ LOWEST QUOTE' : ''}`);
      doc.fontSize(9).fillColor('#444');
      doc.text(`   Per Unit Price: ₹${q.per_unit_price}   |   Total Value: ₹${q.total_value}`);
      doc.text(`   Lead Time: ${q.lead_time_days} days   |   Validity: ${q.validity_period}`);
      doc.text(`   Payment Terms: ${q.payment_terms}`);
      if (q.remarks) doc.text(`   Remarks: ${q.remarks}`);
      doc.text(`   Submitted: ${toIST(q.submitted_at)}`);
      const outcomeLabel = q.outcome === 'won' ? 'WON' : q.outcome === 'not_selected' ? 'NOT SELECTED' : 'Pending Decision';
      doc.fillColor(q.outcome === 'won' ? '#1f7a1f' : q.outcome === 'not_selected' ? '#a33' : '#888');
      doc.text(`   Outcome: ${outcomeLabel}${q.rejection_reason ? ` — ${q.rejection_reason}` : ''}`);
      doc.fillColor('#444');
    });
  }

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor('#999').text(
    'This report is system-generated from permanently archived quotation records. All timestamps shown in IST.',
    { align: 'center' }
  );

  doc.end();
});

module.exports = router;
