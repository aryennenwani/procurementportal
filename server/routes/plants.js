const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { getClientIp } = require('../utils');

const router = express.Router();
router.use(requireAuth);

const listPlants = db.prepare('SELECT * FROM plants ORDER BY code ASC');
const getPlantById = db.prepare('SELECT * FROM plants WHERE id = ?');
const getPlantByCode = db.prepare('SELECT * FROM plants WHERE code = ? COLLATE NOCASE');
const countManagersForPlant = db.prepare('SELECT COUNT(*) AS cnt FROM managers WHERE plant_id = ?');

// Any authenticated manager can read the plant list — needed for the manager form dropdown.
router.get('/', (req, res) => {
  res.json({ plants: listPlants.all() });
});

router.post(
  '/',
  requireAdmin,
  [
    body('code').trim().notEmpty().withMessage('Plant code is required').isLength({ max: 10 }).withMessage('Plant code must be 10 characters or fewer'),
    body('name').trim().notEmpty().withMessage('Plant name is required'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const code = req.body.code.trim();
    const name = req.body.name.trim();
    if (getPlantByCode.get(code)) {
      return res.status(409).json({ error: 'A plant with this code already exists.' });
    }

    const info = db.prepare('INSERT INTO plants (code, name) VALUES (?, ?)').run(code, name);

    recordAudit({
      actionType: 'PLANT_CREATED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'plant',
      targetId: info.lastInsertRowid,
      details: { code, name },
      ip: getClientIp(req),
    });

    res.status(201).json({ plant: getPlantById.get(info.lastInsertRowid) });
  }
);

router.delete('/:id', requireAdmin, [param('id').isInt().withMessage('Invalid plant id')], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

  const plant = getPlantById.get(req.params.id);
  if (!plant) return res.status(404).json({ error: 'Plant not found.' });

  const inUse = countManagersForPlant.get(plant.id).cnt;
  if (inUse > 0) {
    return res.status(409).json({ error: `This plant is assigned to ${inUse} manager${inUse !== 1 ? 's' : ''} and cannot be deleted. Reassign them first.` });
  }

  db.prepare('DELETE FROM plants WHERE id = ?').run(plant.id);

  recordAudit({
    actionType: 'PLANT_DELETED',
    performedBy: `manager:${req.manager.id}(${req.manager.email})`,
    targetType: 'plant',
    targetId: req.params.id,
    details: { code: plant.code, name: plant.name },
    ip: getClientIp(req),
  });

  res.json({ success: true });
});

module.exports = router;
