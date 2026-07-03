const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireProcurementManager } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { runDetection } = require('../services/partiality');
const { sendVendorAssignmentEmail, notifyManager } = require('../services/mailer');
const { getClientIp, toIST } = require('../utils');

const router = express.Router();
router.use(requireAuth);

const VALID_UNITS = ['drums', 'MT', 'litres', 'kg'];
const VALID_STATUSES = ['Open', 'Pending', 'Closed'];

const insertRequirement = db.prepare(`
  INSERT INTO requirements (title, description, quantity, unit, grade, deadline, notes, status, created_by, plant_code)
  VALUES (@title, @description, @quantity, @unit, @grade, @deadline, @notes, 'Open', @created_by, @plant_code)
`);

const listRequirements = db.prepare(`
  SELECT r.*, m.name AS created_by_name,
    (SELECT COUNT(*) FROM requirement_vendors rv WHERE rv.requirement_id = r.id) AS vendor_count,
    (SELECT COUNT(*) FROM quotations q WHERE q.requirement_id = r.id AND q.is_latest = 1) AS quotation_count,
    (SELECT MAX(risk_level) FROM (
       SELECT CASE risk_level WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END AS risk_level
       FROM partiality_flags WHERE requirement_id = r.id
     )) AS max_risk_rank
  FROM requirements r
  JOIN managers m ON m.id = r.created_by
  ORDER BY r.created_at DESC
`);

const getRequirementById = db.prepare('SELECT * FROM requirements WHERE id = ?');
const getRequirementWithCreator = db.prepare(`
  SELECT r.*, m.name AS created_by_name FROM requirements r
  JOIN managers m ON m.id = r.created_by
  WHERE r.id = ?
`);
const updateStatus = db.prepare('UPDATE requirements SET status = ? WHERE id = ?');
const getVendorById = db.prepare('SELECT * FROM vendors WHERE id = ?');
const assignVendor = db.prepare(`
  INSERT OR IGNORE INTO requirement_vendors (requirement_id, vendor_id) VALUES (?, ?)
`);

const RISK_RANK_TO_LABEL = { 3: 'HIGH', 2: 'MEDIUM', 1: 'LOW' };
const getItemByName = db.prepare('SELECT * FROM items WHERE name = ? COLLATE NOCASE');

router.get('/', (req, res) => {
  const rows = listRequirements.all().map((r) => ({
    ...r,
    created_at_ist: toIST(r.created_at),
    risk_level: r.max_risk_rank ? RISK_RANK_TO_LABEL[r.max_risk_rank] : 'LOW',
  }));
  res.json({ requirements: rows });
});

router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Item name is required'),
    body('description').optional({ checkFalsy: true }).trim(),
    body('quantity').isFloat({ gt: 0 }).withMessage('Quantity must be a positive number'),
    body('unit').isIn(VALID_UNITS).withMessage(`Unit must be one of: ${VALID_UNITS.join(', ')}`),
    body('grade').optional({ checkFalsy: true }).trim(),
    body('deadline').isISO8601().withMessage('Deadline must be a valid date'),
    body('notes').optional({ checkFalsy: true }).trim(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { description, quantity, unit, grade, deadline, notes } = req.body;

    // Item must come from the Item Master so the same item can never appear under
    // different spellings across requirements, price history and collusion grouping.
    const item = getItemByName.get(req.body.title.trim());
    if (!item) {
      return res.status(400).json({ error: 'Validation failed', details: [{ path: 'title', msg: 'Item must be selected from the item master list.' }] });
    }
    const title = item.name;

    const info = insertRequirement.run({
      title,
      description: description || null,
      quantity,
      unit,
      grade: grade || null,
      deadline: new Date(deadline).toISOString(),
      notes: notes || null,
      created_by: req.manager.id,
      plant_code: req.manager.plant_code || null,
    });

    recordAudit({
      actionType: 'REQUIREMENT_CREATED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'requirement',
      targetId: info.lastInsertRowid,
      details: { title, quantity, unit, deadline },
      ip: getClientIp(req),
    });

    const created = getRequirementById.get(info.lastInsertRowid);

    // Notify all other managers that a new requirement has been raised.
    const otherManagers = db.prepare('SELECT id FROM managers WHERE id != ?').all(req.manager.id);
    otherManagers.forEach((m) => {
      notifyManager({
        managerId: m.id,
        title: 'New requirement raised',
        body: `${req.manager.name} raised a new requirement: ${title} (${quantity} ${unit})`,
        targetType: 'requirement',
        targetId: info.lastInsertRowid,
      });
    });

    res.status(201).json({ requirement: created });
  }
);

router.patch(
  '/:id/status',
  [
    param('id').isInt().withMessage('Invalid requirement id'),
    body('status').isIn(VALID_STATUSES).withMessage(`Status must be one of: ${VALID_STATUSES.join(', ')}`),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const requirement = getRequirementById.get(req.params.id);
    if (!requirement) return res.status(404).json({ error: 'Requirement not found.' });

    const oldStatus = requirement.status;
    updateStatus.run(req.body.status, req.params.id);

    recordAudit({
      actionType: 'REQUIREMENT_STATUS_CHANGED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'requirement',
      targetId: req.params.id,
      details: { from: oldStatus, to: req.body.status },
      ip: getClientIp(req),
    });

    res.json({ requirement: getRequirementById.get(req.params.id) });
  }
);

router.post(
  '/:id/assign',
  requireProcurementManager,
  [
    param('id').isInt().withMessage('Invalid requirement id'),
    body('vendor_ids').isArray({ min: 1 }).withMessage('At least one vendor must be selected'),
    body('vendor_ids.*').isInt().withMessage('Invalid vendor id in list'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const requirement = getRequirementById.get(req.params.id);
    if (!requirement) return res.status(404).json({ error: 'Requirement not found.' });

    const assigned = [];
    const newlyAssignedVendors = [];
    const tx = db.transaction((vendorIds) => {
      for (const vendorId of vendorIds) {
        const vendor = getVendorById.get(vendorId);
        if (!vendor) continue;
        const result = assignVendor.run(req.params.id, vendorId);
        if (result.changes > 0) {
          assigned.push(vendor.company_name);
          newlyAssignedVendors.push(vendor);
        }
      }
    });
    tx(req.body.vendor_ids);

    recordAudit({
      actionType: 'VENDORS_ASSIGNED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'requirement',
      targetId: req.params.id,
      details: { assigned_vendors: assigned, vendor_ids: req.body.vendor_ids },
      ip: getClientIp(req),
    });

    runDetection(req.params.id);

    // Fire and forget — each newly-assigned vendor receives their secure portal link by email.
    // Sent sequentially with a delay to stay under Resend's free-tier rate limit (2 req/sec).
    (async () => {
      for (const vendor of newlyAssignedVendors) {
        await sendVendorAssignmentEmail({ vendor, requirement });
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    })();

    const vendors = db.prepare(`
      SELECT v.* FROM vendors v
      JOIN requirement_vendors rv ON rv.vendor_id = v.id
      WHERE rv.requirement_id = ?
    `).all(req.params.id);

    res.json({ assigned_vendors: vendors });
  }
);

router.get('/:id/quotations', [param('id').isInt().withMessage('Invalid requirement id')], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const requirement = getRequirementWithCreator.get(req.params.id);
  if (!requirement) return res.status(404).json({ error: 'Requirement not found.' });

  const quotations = db.prepare(`
    SELECT q.*, v.company_name, v.contact_person, v.email AS vendor_email,
           qo.outcome, qo.rejection_reason, qo.decided_at, dm.name AS decided_by_name
    FROM quotations q
    JOIN vendors v ON v.id = q.vendor_id
    LEFT JOIN quotation_outcomes qo ON qo.quotation_id = q.id
    LEFT JOIN managers dm ON dm.id = qo.decided_by
    WHERE q.requirement_id = ? AND q.is_latest = 1
    ORDER BY q.per_unit_price ASC
  `).all(req.params.id);

  let lowestPrice = null;
  if (quotations.length > 0) {
    lowestPrice = Math.min(...quotations.map((q) => q.per_unit_price));
  }

  const getRevisionChain = db.prepare(`
    SELECT * FROM quotations WHERE requirement_id = ? AND vendor_id = ? ORDER BY revision_number ASC
  `);

  const getQuoteAttachments = db.prepare(`
    SELECT id, original_name, mime_type, size_bytes FROM quotation_attachments WHERE quotation_id = ?
  `);

  const enriched = quotations.map((q) => {
    const chain = q.revision_number > 0 ? getRevisionChain.all(req.params.id, q.vendor_id) : [];
    return {
      ...q,
      submitted_at_ist: toIST(q.submitted_at),
      decided_at_ist: q.decided_at ? toIST(q.decided_at) : null,
      is_lowest: lowestPrice !== null && q.per_unit_price === lowestPrice,
      revision_history: chain.map((c) => ({ ...c, submitted_at_ist: toIST(c.submitted_at) })),
      attachments: getQuoteAttachments.all(q.id),
    };
  });

  const assignedVendors = db.prepare(`
    SELECT v.id, v.company_name, rv.assigned_at
    FROM requirement_vendors rv JOIN vendors v ON v.id = rv.vendor_id
    WHERE rv.requirement_id = ?
  `).all(req.params.id);

  // Prices are hidden until at least 2 bids are in — prevents the manager from seeing
  // a single quote and gaming subsequent vendors. Exception: if only one bid was received
  // and the deadline is within 6 hours (or has passed), the price unhides automatically
  // since there's no longer a meaningful chance for a second bid to arrive.
  const hoursToDeadline = (new Date(requirement.deadline).getTime() - Date.now()) / (1000 * 60 * 60);
  const singleBidUnhidden = enriched.length === 1 && hoursToDeadline <= 6;
  const bidsHidden = enriched.length < 2 && !singleBidUnhidden;
  const safeQuotations = bidsHidden
    ? enriched.map((q) => ({
        ...q,
        per_unit_price: null,
        total_value: null,
        is_lowest: false,
        revision_history: q.revision_history.map((r) => ({ ...r, per_unit_price: null, total_value: null })),
      }))
    : enriched;

  const { riskLevel, flags } = runDetection(req.params.id);

  recordAudit({
    actionType: 'QUOTATIONS_VIEWED',
    performedBy: `manager:${req.manager.id}(${req.manager.email})`,
    targetType: 'requirement',
    targetId: req.params.id,
    details: { quotation_count: quotations.length, risk_level: riskLevel },
    ip: getClientIp(req),
  });

  res.json({
    requirement: {
      ...requirement,
      created_at_ist: toIST(requirement.created_at),
      deadline_ist: toIST(requirement.deadline),
    },
    assigned_vendors: assignedVendors,
    quotations: safeQuotations,
    bids_hidden: bidsHidden,
    partiality: {
      risk_level: riskLevel,
      flags: flags.map((f) => ({ ...f, detected_at_ist: toIST(f.detected_at) })),
    },
  });
});

module.exports = router;
