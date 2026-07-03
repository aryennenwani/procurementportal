const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireAdmin, requirePrimaryAdmin } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { getClientIp } = require('../utils');

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

const ALLOWED_PERMISSIONS = ['view_compliance', 'view_audit'];
const ALLOWED_ROLES = ['procurement_manager', 'factory_manager'];

const MANAGER_SELECT = `
  SELECT m.id, m.email, m.name, m.is_admin, m.is_primary_admin, m.permissions, m.role, m.created_at,
         m.plant_id, p.code AS plant_code, p.name AS plant_name
  FROM managers m LEFT JOIN plants p ON p.id = m.plant_id
`;
const listManagers = db.prepare(`${MANAGER_SELECT} ORDER BY m.created_at ASC`);
const getManagerById = db.prepare(`${MANAGER_SELECT} WHERE m.id = ?`);
const getPlantById = db.prepare('SELECT * FROM plants WHERE id = ?');

function managerPublic(m) {
  return { ...m, permissions: JSON.parse(m.permissions || '[]'), role: m.role || 'procurement_manager' };
}

router.get('/', (req, res) => {
  res.json({ managers: listManagers.all().map(managerPublic) });
});

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('A valid email address is required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').optional().isIn(ALLOWED_ROLES).withMessage('Invalid role'),
    body('plant_id').optional({ checkFalsy: true }).isInt().withMessage('Invalid plant'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const { name, email, password } = req.body;
    const role = req.body.role || 'procurement_manager';
    const existing = db.prepare('SELECT id FROM managers WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'A manager with this email already exists.' });

    let plantId = null;
    if (req.body.plant_id) {
      const plant = getPlantById.get(req.body.plant_id);
      if (!plant) {
        return res.status(400).json({ error: 'Validation failed', details: [{ path: 'plant_id', msg: 'Selected plant does not exist.' }] });
      }
      plantId = plant.id;
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(
      'INSERT INTO managers (email, password_hash, name, is_admin, role, plant_id) VALUES (?, ?, ?, 0, ?, ?)'
    ).run(email.toLowerCase().trim(), password_hash, name.trim(), role, plantId);

    recordAudit({
      actionType: 'MANAGER_CREATED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'manager',
      targetId: info.lastInsertRowid,
      details: { name, email, role, plant_id: plantId },
      ip: getClientIp(req),
    });

    res.status(201).json({ manager: managerPublic(getManagerById.get(info.lastInsertRowid)) });
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
    if (target.is_primary_admin) return res.status(400).json({ error: 'Cannot remove the primary admin account.' });
    if (target.is_admin && !req.manager.is_primary_admin) {
      return res.status(403).json({ error: 'Only the primary admin can remove other admins.' });
    }

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

// Update the permissions granted to a non-admin manager.
router.patch(
  '/:id/permissions',
  [
    param('id').isInt().withMessage('Invalid manager id'),
    body('permissions').isArray().withMessage('permissions must be an array'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const target = db.prepare('SELECT * FROM managers WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Manager not found.' });
    if (target.is_admin) return res.status(400).json({ error: 'Admins already have full access; permissions are not applicable.' });

    const cleaned = req.body.permissions.filter((p) => ALLOWED_PERMISSIONS.includes(p));
    db.prepare('UPDATE managers SET permissions = ? WHERE id = ?').run(JSON.stringify(cleaned), target.id);

    recordAudit({
      actionType: 'MANAGER_PERMISSIONS_UPDATED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'manager',
      targetId: target.id,
      details: { name: target.name, permissions: cleaned },
      ip: getClientIp(req),
    });

    res.json({ manager: managerPublic(getManagerById.get(target.id)) });
  }
);

// Switch a non-admin manager between Procurement Manager and Factory Manager.
router.patch(
  '/:id/role',
  [
    param('id').isInt().withMessage('Invalid manager id'),
    body('role').isIn(ALLOWED_ROLES).withMessage('Invalid role'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const target = db.prepare('SELECT * FROM managers WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Manager not found.' });
    if (target.is_admin) return res.status(400).json({ error: 'Admins are not assigned a manager role.' });

    db.prepare('UPDATE managers SET role = ? WHERE id = ?').run(req.body.role, target.id);

    recordAudit({
      actionType: 'MANAGER_ROLE_UPDATED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'manager',
      targetId: target.id,
      details: { name: target.name, role: req.body.role },
      ip: getClientIp(req),
    });

    res.json({ manager: managerPublic(getManagerById.get(target.id)) });
  }
);

// Assign (or clear) the plant a manager belongs to.
router.patch(
  '/:id/plant',
  [
    param('id').isInt().withMessage('Invalid manager id'),
    body('plant_id').optional({ nullable: true }).custom((v) => v === null || Number.isInteger(Number(v))).withMessage('Invalid plant'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const target = db.prepare('SELECT * FROM managers WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Manager not found.' });

    let plantId = null;
    if (req.body.plant_id) {
      const plant = getPlantById.get(req.body.plant_id);
      if (!plant) return res.status(400).json({ error: 'Selected plant does not exist.' });
      plantId = plant.id;
    }

    db.prepare('UPDATE managers SET plant_id = ? WHERE id = ?').run(plantId, target.id);

    recordAudit({
      actionType: 'MANAGER_PLANT_UPDATED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'manager',
      targetId: target.id,
      details: { name: target.name, from_plant_id: target.plant_id || null, to_plant_id: plantId },
      ip: getClientIp(req),
    });

    res.json({ manager: managerPublic(getManagerById.get(target.id)) });
  }
);

// Promote a manager to admin or demote an admin to manager.
// Only the primary admin may do this.
router.patch(
  '/:id/toggle-admin',
  requirePrimaryAdmin,
  [param('id').isInt().withMessage('Invalid manager id')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    if (Number(req.params.id) === req.manager.id) {
      return res.status(400).json({ error: 'You cannot change your own admin status.' });
    }

    const target = db.prepare('SELECT * FROM managers WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Manager not found.' });
    if (target.is_primary_admin) return res.status(400).json({ error: 'Cannot change the primary admin status.' });

    const newAdminValue = target.is_admin ? 0 : 1;
    // When promoting to admin, clear individual permissions (admins have full access).
    db.prepare("UPDATE managers SET is_admin = ?, permissions = '[]' WHERE id = ?").run(newAdminValue, target.id);

    recordAudit({
      actionType: newAdminValue ? 'MANAGER_PROMOTED_TO_ADMIN' : 'MANAGER_DEMOTED_FROM_ADMIN',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'manager',
      targetId: target.id,
      details: { name: target.name },
      ip: getClientIp(req),
    });

    res.json({ manager: managerPublic(getManagerById.get(target.id)) });
  }
);

module.exports = router;
