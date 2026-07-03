const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireProcurementManager } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { getClientIp, toIST } = require('../utils');
const { runDetection, runGlobalDetection } = require('../services/partiality');
const { raisePurchaseOrderForWin } = require('../services/sap');
const path = require('path');
const { QUOTE_UPLOAD_DIR } = require('../services/uploads');

const router = express.Router();
router.use(requireAuth);

// Download a file the vendor attached to their quotation (spec sheet, COA, …).
router.get(
  '/:id/attachments/:attachmentId',
  [param('id').isInt(), param('attachmentId').isInt()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const attachment = db.prepare(
      'SELECT * FROM quotation_attachments WHERE id = ? AND quotation_id = ?'
    ).get(req.params.attachmentId, req.params.id);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });

    res.download(path.join(QUOTE_UPLOAD_DIR, attachment.stored_name), attachment.original_name, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: 'The attachment file is no longer available on the server.' });
      }
    });
  }
);

const MIN_BIDS_TO_DECIDE = 2;
const MIN_JUSTIFICATION_LENGTH = 50;

const getQuotation = db.prepare(`
  SELECT q.*, v.company_name FROM quotations q JOIN vendors v ON v.id = q.vendor_id WHERE q.id = ?
`);

const getOutcome = db.prepare('SELECT * FROM quotation_outcomes WHERE quotation_id = ?');

const getQuotationsForRequirement = db.prepare(`
  SELECT q.*, v.company_name FROM quotations q
  JOIN vendors v ON v.id = q.vendor_id
  WHERE q.requirement_id = ? AND q.is_latest = 1
  ORDER BY q.per_unit_price ASC
`);

const insertOutcome = db.prepare(`
  INSERT INTO quotation_outcomes (quotation_id, outcome, rejection_reason, justification, decided_by)
  VALUES (@quotation_id, @outcome, @rejection_reason, @justification, @decided_by)
`);

// Records the win/rejection decision for a quotation. This is an insert-only "outcome" record —
// the quotation itself is never modified, preserving the immutable original submission.
router.post(
  '/:id/outcome',
  requireProcurementManager,
  [
    param('id').isInt().withMessage('Invalid quotation id'),
    body('outcome').isIn(['won', 'not_selected']).withMessage('Outcome must be "won" or "not_selected"'),
    body('rejection_reason').optional({ checkFalsy: true }).trim(),
    body('justification').optional({ checkFalsy: true }).trim(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const quotation = getQuotation.get(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found.' });

    const existing = getOutcome.get(req.params.id);
    if (existing) {
      return res.status(409).json({ error: 'An outcome has already been recorded for this quotation and cannot be changed.' });
    }

    const requirement = db.prepare('SELECT * FROM requirements WHERE id = ?').get(quotation.requirement_id);
    if (requirement.status === 'Closed') {
      return res.status(409).json({ error: 'This requirement is closed — no further decisions can be recorded.' });
    }

    const { outcome, rejection_reason, justification } = req.body;

    let isLowest = true;
    let lowest = null;
    let priceDifference = 0;
    let totalOverpaid = 0;

    if (outcome === 'won') {
      const otherWinner = db.prepare(`
        SELECT qo.* FROM quotation_outcomes qo
        JOIN quotations q ON q.id = qo.quotation_id
        WHERE q.requirement_id = ? AND qo.outcome = 'won'
      `).get(quotation.requirement_id);
      if (otherWinner) {
        return res.status(409).json({ error: 'A winning quotation has already been recorded for this requirement.' });
      }

      const requirementQuotations = getQuotationsForRequirement.all(quotation.requirement_id);
      if (requirementQuotations.length < MIN_BIDS_TO_DECIDE) {
        return res.status(409).json({
          error: `At least ${MIN_BIDS_TO_DECIDE} quotations are required before a winner can be selected for this requirement (currently ${requirementQuotations.length}).`,
        });
      }

      lowest = requirementQuotations[0];
      isLowest = lowest.id === quotation.id;
      priceDifference = quotation.per_unit_price - lowest.per_unit_price;

      // Mandatory Justification Gate: selecting a non-lowest bid requires a written, permanently
      // logged justification of at least MIN_JUSTIFICATION_LENGTH characters. This cannot be skipped.
      if (!isLowest) {
        const trimmed = (justification || '').trim();
        if (trimmed.length < MIN_JUSTIFICATION_LENGTH) {
          return res.status(400).json({
            error: `You are selecting a bid that is not the lowest. This action will be permanently logged. Please provide written justification for this decision (minimum ${MIN_JUSTIFICATION_LENGTH} characters).`,
            details: [{ path: 'justification', msg: `Justification must be at least ${MIN_JUSTIFICATION_LENGTH} characters long.` }],
          });
        }
        totalOverpaid = priceDifference * requirement.quantity;
      }
    }

    const performedBy = `manager:${req.manager.id}(${req.manager.email})`;
    const ip = getClientIp(req);
    const flagNonLowest = outcome === 'won' && !isLowest;

    // Everything below is recorded atomically: the outcome, the real-time HIGH-risk flag for a
    // non-lowest selection, and its justification audit entry are written together — so a
    // non-lowest award can never exist in the system without its accompanying record.
    const recordDecision = db.transaction(() => {
      const info = insertOutcome.run({
        quotation_id: req.params.id,
        outcome,
        rejection_reason: outcome === 'not_selected' ? (rejection_reason || null) : null,
        justification: flagNonLowest ? justification.trim() : null,
        decided_by: req.manager.id,
      });

      if (flagNonLowest) {
        db.prepare(`
          INSERT OR IGNORE INTO partiality_flags (requirement_id, flag_type, risk_level, vendor_id, description, metric_value)
          VALUES (?, 'NON_LOWEST_BID_SELECTED', 'HIGH', ?, ?, ?)
        `).run(
          quotation.requirement_id,
          quotation.vendor_id,
          `A non-lowest bid was selected as the winner. ${quotation.company_name} was awarded at ₹${quotation.per_unit_price} while ${lowest.company_name} quoted ₹${lowest.per_unit_price} — a difference of ₹${priceDifference.toLocaleString('en-IN')} per unit (₹${totalOverpaid.toLocaleString('en-IN')} total). A written justification was recorded.`,
          Math.round(totalOverpaid * 100) / 100,
        );

        recordAudit({
          actionType: 'NON_LOWEST_BID_JUSTIFICATION',
          performedBy,
          targetType: 'requirement',
          targetId: quotation.requirement_id,
          details: {
            requirement_id: quotation.requirement_id,
            chosen_vendor: { id: quotation.vendor_id, name: quotation.company_name, per_unit_price: quotation.per_unit_price },
            lowest_vendor: { id: lowest.vendor_id, name: lowest.company_name, per_unit_price: lowest.per_unit_price },
            price_difference_per_unit: priceDifference,
            total_potential_loss: totalOverpaid,
            justification: justification.trim(),
          },
          ip,
        });
      }

      recordAudit({
        actionType: 'QUOTATION_OUTCOME_RECORDED',
        performedBy,
        targetType: 'quotation',
        targetId: req.params.id,
        details: {
          outcome,
          rejection_reason: rejection_reason || null,
          vendor: quotation.company_name,
          requirement_id: quotation.requirement_id,
          is_lowest_bid: outcome === 'won' ? isLowest : undefined,
        },
        ip,
      });

      // Once a winner is selected, every other bid is automatically closed out and the
      // requirement closes — no further decisions can be made on it after this point.
      if (outcome === 'won') {
        const others = getQuotationsForRequirement.all(quotation.requirement_id).filter((q) => q.id !== quotation.id);
        for (const other of others) {
          if (getOutcome.get(other.id)) continue;
          insertOutcome.run({
            quotation_id: other.id,
            outcome: 'not_selected',
            rejection_reason: 'Automatically marked as not selected — another vendor was awarded this requirement.',
            justification: null,
            decided_by: req.manager.id,
          });
        }

        db.prepare("UPDATE requirements SET status = 'Closed' WHERE id = ?").run(quotation.requirement_id);

        recordAudit({
          actionType: 'REQUIREMENT_STATUS_CHANGED',
          performedBy,
          targetType: 'requirement',
          targetId: quotation.requirement_id,
          details: { from: requirement.status, to: 'Closed', reason: 'Winning bid selected' },
          ip,
        });
      }

      return info;
    });

    const info = recordDecision();

    runDetection(quotation.requirement_id);
    runGlobalDetection();

    // A winning bid immediately raises the purchase order (and kicks off the SAP
    // sync in the background). PO creation must never fail the award decision.
    let purchaseOrder = null;
    if (outcome === 'won') {
      try {
        purchaseOrder = raisePurchaseOrderForWin({
          requirementId: quotation.requirement_id,
          quotationId: quotation.id,
          managerId: req.manager.id,
          ip,
        });
      } catch (err) {
        console.error('[sap] failed to raise purchase order:', err);
      }
    }

    const created = db.prepare('SELECT * FROM quotation_outcomes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({
      outcome: { ...created, decided_at_ist: toIST(created.decided_at) },
      purchase_order: purchaseOrder,
    });
  }
);

module.exports = router;
