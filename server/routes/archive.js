const express = require('express');
const { query, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toIST } = require('../utils');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  [
    query('vendor_id').optional().isInt().withMessage('Invalid vendor id'),
    query('requirement_id').optional().isInt().withMessage('Invalid requirement id'),
    query('item').optional().trim(),
    query('status').optional().isIn(['won', 'not_selected', 'pending']).withMessage('Invalid status filter'),
    query('from').optional().isISO8601().withMessage('Invalid "from" date'),
    query('to').optional().isISO8601().withMessage('Invalid "to" date'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { vendor_id, requirement_id, item, status, from, to } = req.query;

    let sql = `
      SELECT q.*, v.company_name AS vendor_name, v.category AS vendor_category,
             r.title AS requirement_title, r.unit, r.status AS requirement_status,
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
    // requirement — keep that consistent in the archive view.
    const proposals = rows.map((q) => {
      const bidsHidden = q.quote_count < 2;
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

    res.json({ count: proposals.length, proposals });
  }
);

module.exports = router;
