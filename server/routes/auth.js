const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { getClientIp } = require('../utils');

const router = express.Router();

const getManagerByEmail = db.prepare('SELECT * FROM managers WHERE email = ?');

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
      { id: manager.id, email: manager.email, name: manager.name },
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

    res.json({
      token,
      manager: { id: manager.id, email: manager.email, name: manager.name },
    });
  }
);

module.exports = router;
