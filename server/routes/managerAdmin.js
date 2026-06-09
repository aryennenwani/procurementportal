const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { getClientIp } = require('../utils');

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

const listManagers = db.prepare('SELECT id, email, name, is_admin, created_at FROM managers ORDER BY created_at ASC');
const getManagerById = db.prepare('SELECT id, email, name, is_admin, created_at FROM managers WHERE id = ?');

router.get('/', (req, res) => {
  res.json({ managers: listManagers.all() });
});

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('A valid email address is required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const { name, email, password } = req.body;
    const existing = db.prepare('SELECT id FROM managers WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'A manager with this email already exists.' });

    const password_hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(
      'INSERT INTO managers (email, password_hash, name, is_admin) VALUES (?, ?, ?, 0)'
    ).run(email.toLowerCase().trim(), password_hash, name.trim());

    recordAudit({
      actionType: 'MANAGER_CREATED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'manager',
      targetId: info.lastInsertRowid,
      details: { name, email },
      ip: getClientIp(req),
    });

    res.status(201).json({ manager: getManagerById.get(info.lastInsertRowid) });
  }
);

router.delete(
  '/:id',
  [param('id').isInt().withMessage('Invalid manager id')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    if (Number(req.params.id) === req.manager.id) {
      return res.status(400).json({ error: 'You cannot remove your own account.' });
    }

    const target = db.prepare('SELECT * FROM managers WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Manager not found.' });
    if (target.is_admin) return res.status(400).json({ error: 'Cannot remove an admin account.' });

    db.prepare('DELETE FROM managers WHERE id = ?').run(req.params.id);

    recordAudit({
      actionType: 'MANAGER_DELETED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'manager',
      targetId: req.params.id,
      details: { name: target.name, email: target.email },
      ip: getClientIp(req),
    });

    res.json({ message: 'Manager removed.' });
  }
);

module.exports = router;
