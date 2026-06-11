const express = require('express');
const { query, validationResult } = require('express-validator');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toIST } = require('../utils');

const router = express.Router();
router.use(requireAuth);

const FILTER_VALIDATORS = [
  query('vendor_id').optional().isInt().withMessage('Invalid vendor id'),
  query('requirement_id').optional().isInt().withMessage('Invalid requirement id'),
  query('item').optional().trim(),
  query('status').optional().isIn(['won', 'not_selected', 'pending']).withMessage('Invalid status filter'),
  query('from').optional().isISO8601().withMessage('Invalid "from" date'),
  query('to').optional().isISO8601().withMessage('Invalid "to" date'),
];

// Shared filter logic for the archive list and its PDF export — keeps both views in sync.
function loadProposals(reqQuery) {
  const { vendor_id, requirement_id, item, status, from, to } = reqQuery;

  let sql = `
    SELECT q.*, v.company_name AS vendor_name, v.category AS vendor_category,
           r.title AS requirement_title, r.unit, r.status AS requirement_status, r.deadline AS requirement_deadline,
           qo.outcome, qo.rejection_reason, qo.decided_at,
           (SELECT COUNT(*) FROM quotations q2 WHERE q2.requirement_id = q.requirement_id AND q2.is_latest = 1) AS quote_count
    FROM quotations q
    JOIN vendors v ON v.id = q.vendor_id
    JOIN requirements r ON r.id = q.requirement_id
    LEFT JOIN quotation_outcomes qo ON qo.quotation_id = q.id
    WHERE q.is_latest = 1
  `;
  const params = [];

  if (vendor_id) {
    sql += ' AND q.vendor_id = ?';
    params.push(vendor_id);
  }
  if (requirement_id) {
    sql += ' AND q.requirement_id = ?';
    params.push(requirement_id);
  }
  if (item) {
    sql += ' AND r.title LIKE ?';
    params.push(`%${item}%`);
  }
  if (from) {
    sql += ' AND q.submitted_at >= ?';
    params.push(new Date(from).toISOString());
  }
  if (to) {
    sql += ' AND q.submitted_at <= ?';
    params.push(new Date(to).toISOString());
  }
  if (status === 'won') {
    sql += " AND qo.outcome = 'won'";
  } else if (status === 'not_selected') {
    sql += " AND qo.outcome = 'not_selected'";
  } else if (status === 'pending') {
    sql += ' AND qo.outcome IS NULL';
  }

  sql += ' ORDER BY q.submitted_at DESC';

  const rows = db.prepare(sql).all(...params);

  // Bid amounts are hidden until at least 2 quotations were received for that
  // requirement — keep that consistent in the archive view. Exception: a single bid
  // unhides once the deadline is within 6 hours (or has passed).
  return rows.map((q) => {
    const hoursToDeadline = (new Date(q.requirement_deadline).getTime() - Date.now()) / (1000 * 60 * 60);
    const singleBidUnhidden = q.quote_count === 1 && hoursToDeadline <= 6;
    const bidsHidden = q.quote_count < 2 && !singleBidUnhidden;
    return {
      ...q,
      per_unit_price: bidsHidden ? null : q.per_unit_price,
      total_value: bidsHidden ? null : q.total_value,
      bids_hidden: bidsHidden,
      submitted_at_ist: toIST(q.submitted_at),
      decided_at_ist: q.decided_at ? toIST(q.decided_at) : null,
      status: q.outcome === 'won' ? 'Won' : q.outcome === 'not_selected' ? 'Not Selected' : 'Pending Decision',
    };
  });
}

router.get('/', FILTER_VALIDATORS, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const proposals = loadProposals(req.query);
  res.json({ count: proposals.length, proposals });
});

router.get('/export/pdf', FILTER_VALIDATORS, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const proposals = loadProposals(req.query);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="proposal-archive.pdf"');

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  doc.pipe(res);

  doc.fontSize(18).fillColor('#1C1C1E').text('Proposal Archive', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor('#666').text(`Generated: ${toIST(new Date().toISOString())} • ${proposals.length} proposal${proposals.length !== 1 ? 's' : ''}`, { align: 'center' });
  doc.moveDown(1);

  if (proposals.length === 0) {
    doc.fontSize(11).fillColor('#666').text('No proposals match the selected filters.');
  } else {
    proposals.forEach((p, idx) => {
      if (idx > 0) doc.moveDown(0.4);
      const priceText = p.per_unit_price !== null ? `Rs ${p.per_unit_price.toLocaleString('en-IN')} / ${p.unit}` : 'Hidden';
      doc.fontSize(10).fillColor('#1C1C1E').text(
        `${p.requirement_title}  |  ${p.vendor_name} (${p.vendor_category})  |  ${priceText}  |  ${p.status}  |  Submitted ${p.submitted_at_ist}`
      );
      if (p.rejection_reason) {
        doc.fontSize(8).fillColor('#888').text(`   Reason: ${p.rejection_reason}`);
      }
    });
  }

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor('#999').text(
    'This is a read-only export of the procurement proposal archive. All timestamps shown in IST.',
    { align: 'center' }
  );

  doc.end();
});

module.exports = router;
