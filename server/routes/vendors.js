const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { getClientIp, toIST } = require('../utils');

const router = express.Router();
router.use(requireAuth);

const insertVendor = db.prepare(`
  INSERT INTO vendors (company_name, contact_person, email, phone, category, unique_token, sap_supplier_code)
  VALUES (@company_name, @contact_person, @email, @phone, @category, @unique_token, @sap_supplier_code)
`);

const getVendorById = db.prepare('SELECT * FROM vendors WHERE id = ?');

const listVendors = db.prepare(`
  SELECT v.*,
    (SELECT COUNT(*) FROM quotations q WHERE q.vendor_id = v.id AND q.is_latest = 1) AS total_bids,
    (SELECT COUNT(*) FROM quotation_outcomes qo JOIN quotations q ON q.id = qo.quotation_id
       WHERE q.vendor_id = v.id AND qo.outcome = 'won' AND q.is_latest = 1) AS wins,
    (SELECT COUNT(*) FROM requirement_vendors rv WHERE rv.vendor_id = v.id) AS assigned_count,
    (SELECT MAX(timestamp) FROM vendor_activity va WHERE va.vendor_id = v.id) AS last_activity
  FROM vendors v
  ORDER BY v.created_at DESC
`);

router.get('/', (req, res) => {
  const vendors = listVendors.all().map((v) => {
    const winRate = v.total_bids > 0 ? Math.round((v.wins / v.total_bids) * 100) : 0;
    return {
      ...v,
      win_rate: winRate,
      created_at_ist: toIST(v.created_at),
      last_activity_ist: v.last_activity ? toIST(v.last_activity) : null,
      portal_url: `/vendor/${v.unique_token}`,
    };
  });
  res.json({ vendors });
});

router.post(
  '/',
  [
    body('company_name').trim().notEmpty().withMessage('Company name is required'),
    body('contact_person').trim().notEmpty().withMessage('Contact person is required'),
    body('email').isEmail().withMessage('A valid email address is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('category').trim().notEmpty().withMessage('Category is required'),
    body('sap_supplier_code').optional({ checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('SAP supplier code must be 20 characters or fewer'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { company_name, contact_person, email, phone, category, sap_supplier_code } = req.body;
    const unique_token = uuidv4();

    const info = insertVendor.run({
      company_name, contact_person, email, phone, category, unique_token,
      sap_supplier_code: sap_supplier_code || null,
    });

    recordAudit({
      actionType: 'VENDOR_CREATED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'vendor',
      targetId: info.lastInsertRowid,
      details: { company_name, email, category, unique_token },
      ip: getClientIp(req),
    });

    const vendor = getVendorById.get(info.lastInsertRowid);
    res.status(201).json({ vendor: { ...vendor, portal_url: `/vendor/${vendor.unique_token}` } });
  }
);

// Set / update the SAP vendor-master supplier code for an existing vendor.
router.patch(
  '/:id/sap-code',
  [body('sap_supplier_code').optional({ checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('SAP supplier code must be 20 characters or fewer')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const vendor = getVendorById.get(req.params.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

    const code = req.body.sap_supplier_code || null;
    db.prepare('UPDATE vendors SET sap_supplier_code = ? WHERE id = ?').run(code, req.params.id);

    recordAudit({
      actionType: 'VENDOR_SAP_CODE_UPDATED',
      performedBy: `manager:${req.manager.id}(${req.manager.email})`,
      targetType: 'vendor',
      targetId: req.params.id,
      details: { company_name: vendor.company_name, from: vendor.sap_supplier_code, to: code },
      ip: getClientIp(req),
    });

    res.json({ vendor: getVendorById.get(req.params.id) });
  }
);

router.get('/:id/activity', (req, res) => {
  const vendor = getVendorById.get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

  const activity = db.prepare(`
    SELECT va.*, r.title AS requirement_title
    FROM vendor_activity va
    LEFT JOIN requirements r ON r.id = va.requirement_id
    WHERE va.vendor_id = ?
    ORDER BY va.timestamp DESC
  `).all(req.params.id).map((a) => ({ ...a, timestamp_ist: toIST(a.timestamp) }));

  res.json({ vendor, activity });
});

module.exports = router;
