const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { recordAudit } = require('../middleware/audit');
const { getClientIp, toIST } = require('../utils');
const { runDetection } = require('../services/partiality');
const { sendQuotationNotificationEmail, notifyManager } = require('../services/mailer');
const {
  SESSION_HOURS, setSessionCookie, requireVendorSession,
} = require('../middleware/vendorAuth');

const router = express.Router();

const MAX_REVISIONS = 3;
const MAX_VERIFY_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 60 * 60 * 1000;

const getVendorByToken = db.prepare('SELECT * FROM vendors WHERE unique_token = ?');
const getRequirementById = db.prepare('SELECT * FROM requirements WHERE id = ?');
const getQuoteCount = db.prepare('SELECT COUNT(*) AS cnt FROM quotations WHERE requirement_id = ? AND is_latest = 1');
// Bid notifications go to admins and procurement managers — factory managers cannot act on
// quotations, so they are excluded even if they raised the requirement.
const getQuotationRecipients = db.prepare("SELECT * FROM managers WHERE is_admin = 1 OR role = 'procurement_manager'");

const insertActivity = db.prepare(`
  INSERT INTO vendor_activity (vendor_id, action, requirement_id, ip_address)
  VALUES (?, ?, ?, ?)
`);

const insertQuotation = db.prepare(`
  INSERT INTO quotations
    (requirement_id, vendor_id, per_unit_price, total_value, lead_time_days, validity_period, payment_terms, remarks,
     revision_number, parent_quotation_id, is_latest)
  VALUES (@requirement_id, @vendor_id, @per_unit_price, @total_value, @lead_time_days, @validity_period, @payment_terms, @remarks,
          @revision_number, @parent_quotation_id, @is_latest)
`);

const getLatestQuotation = db.prepare(`
  SELECT * FROM quotations WHERE requirement_id = ? AND vendor_id = ? AND is_latest = 1
`);

const getRevisionChain = db.prepare(`
  SELECT * FROM quotations WHERE requirement_id = ? AND vendor_id = ? ORDER BY revision_number ASC
`);

const isAssigned = db.prepare(`
  SELECT 1 FROM requirement_vendors WHERE requirement_id = ? AND vendor_id = ?
`);

const markNotLatest = db.prepare('UPDATE quotations SET is_latest = 0 WHERE id = ?');

const insertVerificationAttempt = db.prepare(`
  INSERT INTO vendor_verification_attempts (vendor_token, ip_address, success) VALUES (?, ?, ?)
`);

const countFailedAttempts = db.prepare(`
  SELECT COUNT(*) AS cnt FROM vendor_verification_attempts
  WHERE vendor_token = ? AND ip_address = ? AND success = 0 AND attempted_at > ?
`);

const insertSession = db.prepare(`
  INSERT INTO vendor_sessions (id, vendor_id, vendor_token, verified_email, ip_address, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function shapeQuotation(q, requirement) {
  return {
    ...q,
    submitted_at_ist: toIST(q.submitted_at),
    requirement_title: requirement.title,
    unit: requirement.unit,
  };
}

// A small generic limiter for all public vendor endpoints — a coarse DoS guard that sits
// above the dedicated DB-backed lockout logic on /verify (which enforces the precise
// 5-failed-attempts-per-hour rule and produces the vendor_access_brute_force audit trail).
const publicVendorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

router.use(publicVendorLimiter);

// Public — email verification gate. The vendor link alone never grants access; the visitor
// must prove they own the registered email address before a session is issued.
router.post(
  '/:token/verify',
  [
    param('token').isUUID().withMessage('Invalid vendor link'),
    body('email').isEmail().withMessage('Please enter a valid email address').normalizeEmail(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { token } = req.params;
    const ip = getClientIp(req);
    const vendor = getVendorByToken.get(token);

    const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
    const failedCount = countFailedAttempts.get(token, ip, since).cnt;
    if (failedCount >= MAX_VERIFY_ATTEMPTS) {
      recordAudit({
        actionType: 'vendor_access_brute_force',
        performedBy: `ip:${ip}`,
        targetType: 'vendor_token',
        targetId: token,
        details: { ip, failed_attempts: failedCount },
        ip,
      });
      return res.status(429).json({ error: 'Too many attempts. Try again in 1 hour.' });
    }

    if (!vendor) {
      insertVerificationAttempt.run(token, ip, 0);
      return res.status(404).json({ error: 'This link is not associated with that email address.' });
    }

    const submittedEmail = (req.body.email || '').trim().toLowerCase();
    const matches = submittedEmail === vendor.email.trim().toLowerCase();

    insertVerificationAttempt.run(token, ip, matches ? 1 : 0);
    insertActivity.run(vendor.id, matches ? 'VERIFIED' : 'VERIFICATION_FAILED', null, ip);

    if (!matches) {
      recordAudit({
        actionType: 'VENDOR_VERIFICATION_FAILED',
        performedBy: `vendor:${vendor.id}(${vendor.company_name})`,
        targetType: 'vendor',
        targetId: vendor.id,
        details: { submitted_email: submittedEmail, ip },
        ip,
      });
      return res.status(403).json({ error: 'This link is not associated with that email address.' });
    }

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
    insertSession.run(sessionId, vendor.id, token, submittedEmail, ip, expiresAt);
    setSessionCookie(res, sessionId); // desktop browsers use cookie

    recordAudit({
      actionType: 'VENDOR_VERIFIED',
      performedBy: `vendor:${vendor.id}(${vendor.company_name})`,
      targetType: 'vendor',
      targetId: vendor.id,
      details: { verified_email: submittedEmail, ip },
      ip,
    });

    res.json({ verified: true, sessionToken: sessionId });
  }
);

// Everything below requires a verified, live session bound to this exact token.
router.use('/:token', [param('token').isUUID().withMessage('Invalid vendor link')], requireVendorSession);

router.get('/:token', (req, res) => {
  const vendor = getVendorByToken.get(req.params.token);
  if (!vendor) return res.status(404).json({ error: 'Vendor portal link not found.' });

  const ip = getClientIp(req);
  insertActivity.run(vendor.id, 'LINK_OPENED', null, ip);
  recordAudit({
    actionType: 'VENDOR_LINK_OPENED',
    performedBy: `vendor:${vendor.id}(${vendor.company_name})`,
    targetType: 'vendor',
    targetId: vendor.id,
    details: { token: req.params.token },
    ip,
  });

  const requirements = db.prepare(`
    SELECT r.* FROM requirements r
    JOIN requirement_vendors rv ON rv.requirement_id = r.id
    WHERE rv.vendor_id = ?
    ORDER BY r.deadline ASC
  `).all(vendor.id);

  const shaped = requirements.map((r) => {
    const latest = getLatestQuotation.get(r.id, vendor.id);
    const chain = latest ? getRevisionChain.all(r.id, vendor.id) : [];
    const deadlinePassed = new Date(`${r.deadline}`).getTime() < Date.now();
    const canRevise = !!latest && r.status === 'Open' && !deadlinePassed && latest.revision_number < MAX_REVISIONS;

    return {
      ...r,
      deadline_ist: toIST(r.deadline),
      already_submitted: !!latest,
      quotation: latest ? shapeQuotation(latest, r) : null,
      revision_history: chain.map((q) => shapeQuotation(q, r)),
      revisions_used: latest ? latest.revision_number : 0,
      max_revisions: MAX_REVISIONS,
      can_revise: canRevise,
      revision_closed_reason: latest && !canRevise
        ? (latest.revision_number >= MAX_REVISIONS
          ? 'You have used all 3 allowed revisions for this requirement.'
          : 'Revision period closed.')
        : null,
    };
  });

  res.json({
    vendor: {
      id: vendor.id,
      company_name: vendor.company_name,
      contact_person: vendor.contact_person,
      category: vendor.category,
    },
    requirements: shaped,
  });
});

router.post(
  '/:token/quote',
  [
    body('requirement_id').isInt().withMessage('A requirement must be specified'),
    body('per_unit_price').isFloat({ gt: 0 }).withMessage('Per-unit price must be a positive number'),
    body('lead_time_days').isInt({ gt: 0 }).withMessage('Lead time must be a positive number of days'),
    body('validity_period').trim().notEmpty().withMessage('Validity period is required'),
    body('payment_terms').trim().notEmpty().withMessage('Payment terms are required'),
    body('remarks').optional({ checkFalsy: true }).trim(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const vendor = getVendorByToken.get(req.params.token);
    if (!vendor) return res.status(404).json({ error: 'Vendor portal link not found.' });

    const { requirement_id, per_unit_price, lead_time_days, validity_period, payment_terms, remarks } = req.body;

    const requirement = getRequirementById.get(requirement_id);
    if (!requirement) return res.status(404).json({ error: 'Requirement not found.' });

    if (!isAssigned.get(requirement_id, vendor.id)) {
      return res.status(403).json({ error: 'You have not been assigned to this requirement.' });
    }

    const existing = getLatestQuotation.get(requirement_id, vendor.id);
    if (existing) {
      return res.status(409).json({ error: 'You have already submitted a quotation for this requirement. Use "Revise Offer" to update it.' });
    }

    const total_value = Number(per_unit_price) * Number(requirement.quantity);
    const ip = getClientIp(req);

    let info;
    try {
      info = insertQuotation.run({
        requirement_id, vendor_id: vendor.id, per_unit_price, total_value, lead_time_days,
        validity_period, payment_terms, remarks: remarks || null,
        revision_number: 0, parent_quotation_id: null, is_latest: 1,
      });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'You have already submitted a quotation for this requirement. Use "Revise Offer" to update it.' });
      }
      throw err;
    }

    insertActivity.run(vendor.id, 'QUOTATION_SUBMITTED', requirement_id, ip);
    recordAudit({
      actionType: 'QUOTATION_SUBMITTED',
      performedBy: `vendor:${vendor.id}(${vendor.company_name})`,
      targetType: 'quotation',
      targetId: info.lastInsertRowid,
      details: { requirement_id, per_unit_price, total_value, lead_time_days },
      ip,
    });

    runDetection(requirement_id);

    const hideAmount = getQuoteCount.get(requirement_id).cnt < 2;
    const amountText = hideAmount ? 'Hidden until 2 bids are received' : `₹${Number(per_unit_price).toLocaleString('en-IN')}`;
    for (const manager of getQuotationRecipients.all()) {
      notifyManager({
        managerId: manager.id,
        title: 'New quotation received',
        body: `Quotation received from ${vendor.company_name} for ${requirement.title} — ${amountText}`,
        targetType: 'requirement',
        targetId: requirement_id,
      });
      sendQuotationNotificationEmail({ manager, vendor, requirement, amount: per_unit_price, revised: false, hideAmount });
    }

    const quotation = db.prepare('SELECT * FROM quotations WHERE id = ?').get(info.lastInsertRowid);

    res.status(201).json({
      message: 'Your quotation has been submitted successfully and is now permanently on record.',
      quotation: shapeQuotation(quotation, requirement),
    });
  }
);

router.post(
  '/:token/revise',
  [
    body('requirement_id').isInt().withMessage('A requirement must be specified'),
    body('per_unit_price').isFloat({ gt: 0 }).withMessage('Per-unit price must be a positive number'),
    body('lead_time_days').isInt({ gt: 0 }).withMessage('Lead time must be a positive number of days'),
    body('validity_period').trim().notEmpty().withMessage('Validity period is required'),
    body('payment_terms').trim().notEmpty().withMessage('Payment terms are required'),
    body('remarks').optional({ checkFalsy: true }).trim(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const vendor = getVendorByToken.get(req.params.token);
    if (!vendor) return res.status(404).json({ error: 'Vendor portal link not found.' });

    const { requirement_id, per_unit_price, lead_time_days, validity_period, payment_terms, remarks } = req.body;

    const requirement = getRequirementById.get(requirement_id);
    if (!requirement) return res.status(404).json({ error: 'Requirement not found.' });

    if (!isAssigned.get(requirement_id, vendor.id)) {
      return res.status(403).json({ error: 'You have not been assigned to this requirement.' });
    }

    const current = getLatestQuotation.get(requirement_id, vendor.id);
    if (!current) {
      return res.status(409).json({ error: 'You have not submitted a quotation for this requirement yet.' });
    }
    if (requirement.status !== 'Open') {
      return res.status(409).json({ error: 'This requirement is no longer open. Revisions are not accepted.' });
    }
    const winnerDecided = db.prepare(`
      SELECT 1 FROM quotation_outcomes qo JOIN quotations q ON q.id = qo.quotation_id
      WHERE q.requirement_id = ? AND qo.outcome = 'won'
    `).get(requirement_id);
    if (winnerDecided) {
      return res.status(409).json({ error: 'A winner has already been selected for this requirement. Revisions are not accepted.' });
    }
    if (new Date(`${requirement.deadline}`).getTime() < Date.now()) {
      return res.status(409).json({ error: 'The submission deadline has passed. Revisions are not accepted.' });
    }
    if (current.revision_number >= MAX_REVISIONS) {
      return res.status(409).json({ error: `You have used all ${MAX_REVISIONS} allowed revisions for this requirement.` });
    }

    const total_value = Number(per_unit_price) * Number(requirement.quantity);
    const ip = getClientIp(req);
    const oldPrice = current.per_unit_price;

    const recordRevision = db.transaction(() => {
      markNotLatest.run(current.id);
      return insertQuotation.run({
        requirement_id, vendor_id: vendor.id, per_unit_price, total_value, lead_time_days,
        validity_period, payment_terms, remarks: remarks || null,
        revision_number: current.revision_number + 1,
        parent_quotation_id: current.parent_quotation_id || current.id,
        is_latest: 1,
      });
    });
    const info = recordRevision();

    insertActivity.run(vendor.id, 'QUOTATION_REVISED', requirement_id, ip);
    recordAudit({
      actionType: 'QUOTATION_REVISED',
      performedBy: `vendor:${vendor.id}(${vendor.company_name})`,
      targetType: 'quotation',
      targetId: info.lastInsertRowid,
      details: {
        requirement_id, revision_number: current.revision_number + 1,
        old_price: oldPrice, new_price: per_unit_price,
      },
      ip,
    });

    runDetection(requirement_id);

    const reviseHideAmount = getQuoteCount.get(requirement_id).cnt < 2;
    const reviseAmountText = reviseHideAmount
      ? 'Hidden until 2 bids are received'
      : `new price ₹${Number(per_unit_price).toLocaleString('en-IN')} (was ₹${Number(oldPrice).toLocaleString('en-IN')})`;
    for (const manager of getQuotationRecipients.all()) {
      notifyManager({
        managerId: manager.id,
        title: 'Quotation revised',
        body: `Vendor ${vendor.company_name} revised their offer for ${requirement.title} — ${reviseAmountText}`,
        targetType: 'requirement',
        targetId: requirement_id,
      });
      sendQuotationNotificationEmail({ manager, vendor, requirement, amount: per_unit_price, revised: true, hideAmount: reviseHideAmount });
    }

    const quotation = db.prepare('SELECT * FROM quotations WHERE id = ?').get(info.lastInsertRowid);

    res.status(201).json({
      message: 'Revised offer submitted. Manager has been notified.',
      quotation: shapeQuotation(quotation, requirement),
    });
  }
);

module.exports = router;
