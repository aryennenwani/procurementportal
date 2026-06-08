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
    query('action_type').optional().trim(),
    query('performed_by').optional().trim(),
    query('from').optional().isISO8601().withMessage('Invalid "from" date'),
    query('to').optional().isISO8601().withMessage('Invalid "to" date'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { action_type, performed_by, from, to } = req.query;
    const limit = req.query.limit ? Number(req.query.limit) : 200;

    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];

    if (action_type) {
      sql += ' AND action_type LIKE ?';
      params.push(`%${action_type}%`);
    }
    if (performed_by) {
      sql += ' AND performed_by LIKE ?';
      params.push(`%${performed_by}%`);
    }
    if (from) {
      sql += ' AND timestamp >= ?';
      params.push(new Date(from).toISOString());
    }
    if (to) {
      sql += ' AND timestamp <= ?';
      params.push(new Date(to).toISOString());
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params).map((entry) => ({
      ...entry,
      timestamp_ist: toIST(entry.timestamp),
      details: entry.details_json ? JSON.parse(entry.details_json) : null,
    }));

    res.json({ count: rows.length, entries: rows });
  }
);

module.exports = router;
