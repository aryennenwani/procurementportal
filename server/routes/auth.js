const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { getClientIp } = require('../utils');

const router = express.Router();

const getManagerByEmail = db.prepare('SELECT * FROM managers WHERE email = ?');

function managerPublic(m) {
  return {
    id: m.id,
    email: m.email,
    name: m.name,
    is_admin: m.is_admin || 0,
    is_primary_admin: m.is_primary_admin || 0,
    permissions: JSON.parse(m.permissions || '[]'),
  };
}

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('A valid email address is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { email, password } = req.body;
    const manager = getManagerByEmail.get(email.toLowerCase().trim());

    if (!manager || !bcrypt.compareSync(password, manager.password_hash)) {
      recordAudit({
        actionType: 'LOGIN_FAILED',
        performedBy: `email:${email}`,
        targetType: 'manager',
        targetId: email,
        details: { reason: 'invalid credentials' },
        ip: getClientIp(req),
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: manager.id, email: manager.email, name: manager.name, is_admin: manager.is_admin || 0 },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    recordAudit({
      actionType: 'LOGIN_SUCCESS',
      performedBy: `manager:${manager.id}(${manager.email})`,
      targetType: 'manager',
      targetId: manager.id,
      details: null,
      ip: getClientIp(req),
    });

    res.json({ token, manager: managerPublic(manager) });
  }
);

// Returns fresh manager data — used by the client to re-sync after permission changes.
router.get('/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM managers WHERE id = ?').get(req.manager.id);
  if (!row) return res.status(404).json({ error: 'Manager not found.' });
  res.json({ manager: managerPublic(row) });
});

router.post(
  '/change-password',
  requireAuth,
  [
    body('current_password').isLength({ min: 1 }).withMessage('Current password is required'),
    body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const { current_password, new_password } = req.body;
    const row = db.prepare('SELECT * FROM managers WHERE id = ?').get(req.manager.id);

    if (!bcrypt.compareSync(current_password, row.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    db.prepare('UPDATE managers SET password_hash = ? WHERE id = ?').run(
      bcrypt.hashSync(new_password, 10),
      req.manager.id
    );

    recordAudit({
      actionType: 'PASSWORD_CHANGED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'manager',
      targetId: req.manager.id,
      details: null,
      ip: getClientIp(req),
    });

    res.json({ message: 'Password changed successfully.' });
  }
);

module.exports = router;
