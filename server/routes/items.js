const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { getClientIp } = require('../utils');

const router = express.Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const VALID_UNITS = ['drums', 'MT', 'litres', 'kg'];

const listItems = db.prepare('SELECT * FROM items ORDER BY name ASC');
const getItemById = db.prepare('SELECT * FROM items WHERE id = ?');
const getItemByName = db.prepare('SELECT * FROM items WHERE name = ? COLLATE NOCASE');
const insertItem = db.prepare('INSERT INTO items (name, category, default_unit) VALUES (?, ?, ?)');
const updateItem = db.prepare('UPDATE items SET name = ?, category = ?, default_unit = ? WHERE id = ?');
const deleteItem = db.prepare('DELETE FROM items WHERE id = ?');
const countRequirementsForTitle = db.prepare('SELECT COUNT(*) AS cnt FROM requirements WHERE title = ?');

// Any authenticated manager can read the item list — needed to populate the
// requirement-creation dropdown.
router.get('/', (req, res) => {
  res.json({ items: listItems.all() });
});

router.post(
  '/',
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Item name is required'),
    body('category').optional({ checkFalsy: true }).trim(),
    body('default_unit').optional({ checkFalsy: true }).isIn(VALID_UNITS).withMessage(`Unit must be one of: ${VALID_UNITS.join(', ')}`),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { name, category, default_unit } = req.body;
    if (getItemByName.get(name.trim())) {
      return res.status(409).json({ error: 'An item with this name already exists.' });
    }

    const info = insertItem.run(name.trim(), category || null, default_unit || null);

    recordAudit({
      actionType: 'ITEM_CREATED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'item',
      targetId: info.lastInsertRowid,
      details: { name: name.trim() },
      ip: getClientIp(req),
    });

    res.status(201).json({ item: getItemById.get(info.lastInsertRowid) });
  }
);

router.put(
  '/:id',
  requireAdmin,
  [
    param('id').isInt().withMessage('Invalid item id'),
    body('name').trim().notEmpty().withMessage('Item name is required'),
    body('category').optional({ checkFalsy: true }).trim(),
    body('default_unit').optional({ checkFalsy: true }).isIn(VALID_UNITS).withMessage(`Unit must be one of: ${VALID_UNITS.join(', ')}`),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const item = getItemById.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });

    const { name, category, default_unit } = req.body;
    const duplicate = getItemByName.get(name.trim());
    if (duplicate && duplicate.id !== item.id) {
      return res.status(409).json({ error: 'An item with this name already exists.' });
    }

    updateItem.run(name.trim(), category || null, default_unit || null, req.params.id);

    recordAudit({
      actionType: 'ITEM_UPDATED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'item',
      targetId: req.params.id,
      details: { from: item.name, to: name.trim() },
      ip: getClientIp(req),
    });

    res.json({ item: getItemById.get(req.params.id) });
  }
);

router.delete('/:id', requireAdmin, [param('id').isInt().withMessage('Invalid item id')], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const item = getItemById.get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  if (countRequirementsForTitle.get(item.name).cnt > 0) {
    return res.status(409).json({ error: 'This item is used by existing requirements and cannot be deleted.' });
  }

  deleteItem.run(req.params.id);

  recordAudit({
    actionType: 'ITEM_DELETED',
    performedBy: `manager:${req.manager.id}(${req.manager.email})`,
    targetType: 'item',
    targetId: req.params.id,
    details: { name: item.name },
    ip: getClientIp(req),
  });

  res.json({ success: true });
});

// Bulk import items from an uploaded Excel sheet. Expects a header row with at least a
// "name" column (case-insensitive); "category" and "default_unit" columns are optional.
// Existing items (matched case-insensitively) are skipped to avoid duplicate spellings.
router.post('/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  let rows;
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch (err) {
    return res.status(400).json({ error: 'Could not read the uploaded file. Please upload a valid Excel file.' });
  }

  let added = 0;
  let skipped = 0;
  const addedNames = [];

  const tx = db.transaction((items) => {
    for (const row of items) {
      const keys = Object.keys(row);
      const nameKey = keys.find((k) => k.trim().toLowerCase() === 'name' || k.trim().toLowerCase() === 'item' || k.trim().toLowerCase() === 'item name');
      const categoryKey = keys.find((k) => k.trim().toLowerCase() === 'category');
      const unitKey = keys.find((k) => k.trim().toLowerCase() === 'default_unit' || k.trim().toLowerCase() === 'unit');

      const name = nameKey ? String(row[nameKey]).trim() : '';
      if (!name) { skipped++; continue; }

      if (getItemByName.get(name)) { skipped++; continue; }

      const category = categoryKey ? String(row[categoryKey]).trim() || null : null;
      let defaultUnit = unitKey ? String(row[unitKey]).trim() : '';
      if (!VALID_UNITS.includes(defaultUnit)) defaultUnit = null;

      insertItem.run(name, category, defaultUnit);
      addedNames.push(name);
      added++;
    }
  });
  tx(rows);

  recordAudit({
    actionType: 'ITEMS_BULK_UPLOADED',
    performedBy: `manager:${req.manager.id}(${req.manager.email})`,
    targetType: 'item',
    targetId: null,
    details: { added, skipped, names: addedNames },
    ip: getClientIp(req),
  });

  res.json({ added, skipped, items: listItems.all() });
});

module.exports = router;
