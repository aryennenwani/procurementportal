const express = require('express');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');
const { computeHealthScore, runDetection, runGlobalDetection } = require('../services/partiality');
const { getClientIp, toIST } = require('../utils');

const router = express.Router();
router.use(requireAuth);
router.use(requirePermission('view_compliance'));

// Re-runs every detection signal (per-requirement + cross-requirement) so all derived
// views — score, flags, matrices, exposure — reflect the latest data on every load.
function refreshDetection() {
  const requirementIds = db.prepare('SELECT id FROM requirements').all().map((r) => r.id);
  for (const id of requirementIds) runDetection(id);
  runGlobalDetection();
}

// For a requirement with a recorded winner, returns how much more (if anything) was paid
// versus simply taking the lowest submitted bid: (winning price − lowest price) × quantity.
function computeOverpaymentForRequirement(requirementId) {
  const requirement = db.prepare('SELECT * FROM requirements WHERE id = ?').get(requirementId);
  const quotations = db.prepare(`
    SELECT q.*, v.company_name, qo.outcome
    FROM quotations q
    JOIN vendors v ON v.id = q.vendor_id
    LEFT JOIN quotation_outcomes qo ON qo.quotation_id = q.id
    WHERE q.requirement_id = ? AND q.is_latest = 1
    ORDER BY q.per_unit_price ASC
  `).all(requirementId);

  const winning = quotations.find((q) => q.outcome === 'won');
  if (!winning || quotations.length === 0) return null;

  const lowest = quotations[0];
  const perUnitDiff = Math.max(0, winning.per_unit_price - lowest.per_unit_price);
  const totalExposure = perUnitDiff * requirement.quantity;

  return {
    requirement_id: requirementId,
    requirement_title: requirement.title,
    winning_vendor: winning.company_name,
    winning_price: winning.per_unit_price,
    lowest_vendor: lowest.company_name,
    lowest_price: lowest.per_unit_price,
    quantity: requirement.quantity,
    unit: requirement.unit,
    per_unit_difference: Math.round(perUnitDiff * 100) / 100,
    total_exposure: Math.round(totalExposure * 100) / 100,
  };
}

router.get('/score', (req, res) => {
  refreshDetection();

  const score = computeHealthScore();
  let label = 'Excellent';
  if (score < 50) label = 'Needs Attention';
  else if (score < 75) label = 'Fair';
  else if (score < 90) label = 'Good';

  res.json({ score, label });
});

// Each flag is enriched with the winning decision date for its requirement (when available) —
// this lets the client group flags by "item + decision date" so that two different
// requirements that happen to share an item name don't get merged into one entity.
router.get('/flags', (req, res) => {
  refreshDetection();

  const flags = db.prepare(`
    SELECT pf.*, r.title AS requirement_title, r.status AS requirement_status, v.company_name AS vendor_name,
           wqo.decided_at AS decided_at, wv.company_name AS winning_vendor_name, wdm.name AS decided_by_name
    FROM partiality_flags pf
    JOIN requirements r ON r.id = pf.requirement_id
    LEFT JOIN vendors v ON v.id = pf.vendor_id
    LEFT JOIN quotations wq ON wq.requirement_id = r.id AND wq.is_latest = 1
    LEFT JOIN quotation_outcomes wqo ON wqo.quotation_id = wq.id AND wqo.outcome = 'won'
    LEFT JOIN vendors wv ON wv.id = wq.vendor_id
    LEFT JOIN managers wdm ON wdm.id = wqo.decided_by
    ORDER BY
      CASE pf.risk_level WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
      pf.detected_at DESC
  `).all().map((f) => ({
    ...f,
    detected_at_ist: toIST(f.detected_at),
    decided_at_ist: f.decided_at ? toIST(f.decided_at) : null,
  }));

  res.json({ flags });
});

router.get('/leaderboard', (req, res) => {
  const leaderboard = db.prepare(`
    SELECT v.id, v.company_name, v.category,
      COUNT(q.id) AS total_bids,
      SUM(CASE WHEN qo.outcome = 'won' THEN 1 ELSE 0 END) AS wins
    FROM vendors v
    LEFT JOIN quotations q ON q.vendor_id = v.id AND q.is_latest = 1
    LEFT JOIN quotation_outcomes qo ON qo.quotation_id = q.id
    GROUP BY v.id
    HAVING total_bids > 0
    ORDER BY (CAST(wins AS REAL) / total_bids) DESC, total_bids DESC
  `).all().map((v) => ({
    ...v,
    win_rate: v.total_bids > 0 ? Math.round((v.wins / v.total_bids) * 100) : 0,
  }));

  res.json({ leaderboard });
});

// Estimated Financial Exposure — sum of (winning bid − lowest bid) × quantity across every
// requirement that currently carries a HIGH-risk partiality flag.
router.get('/financial-exposure', (req, res) => {
  refreshDetection();

  const highRiskRequirementIds = db.prepare(`
    SELECT DISTINCT requirement_id FROM partiality_flags WHERE risk_level = 'HIGH'
  `).all().map((r) => r.requirement_id);

  const breakdown = highRiskRequirementIds
    .map(computeOverpaymentForRequirement)
    .filter((row) => row && row.total_exposure > 0)
    .sort((a, b) => b.total_exposure - a.total_exposure);

  const totalExposure = Math.round(breakdown.reduce((sum, row) => sum + row.total_exposure, 0) * 100) / 100;

  res.json({ total_exposure: totalExposure, requirement_count: breakdown.length, breakdown });
});

// Decider ↔ Vendor Collusion Matrix — how often each manager's *decisions* award the
// requirement to each vendor. Keyed on who picked the winner (qo.decided_by), not who
// raised the requirement — the requirement raiser has no influence over the outcome.
router.get('/collusion-matrix', (req, res) => {
  refreshDetection();

  const rows = db.prepare(`
    SELECT qo.decided_by AS manager_id, m.name AS manager_name,
           q.vendor_id, v.company_name AS vendor_name,
           COUNT(*) AS wins
    FROM quotations q
    JOIN quotation_outcomes qo ON qo.quotation_id = q.id AND qo.outcome = 'won'
    JOIN managers m ON m.id = qo.decided_by
    JOIN vendors v ON v.id = q.vendor_id
    GROUP BY qo.decided_by, q.vendor_id
    ORDER BY m.name, wins DESC
  `).all();

  const managerTotals = new Map();
  for (const row of rows) {
    managerTotals.set(row.manager_id, (managerTotals.get(row.manager_id) || 0) + row.wins);
  }

  const cells = rows.map((row) => {
    const managerTotal = managerTotals.get(row.manager_id);
    return {
      ...row,
      manager_total_wins: managerTotal,
      win_share: managerTotal > 0 ? Math.round((row.wins / managerTotal) * 1000) / 10 : 0,
      flagged: managerTotal >= 3 && row.wins / managerTotal > 0.5,
    };
  });

  const managers = [...new Map(rows.map((r) => [r.manager_id, r.manager_name])).entries()].map(([id, name]) => ({ id, name }));
  const vendors = [...new Map(rows.map((r) => [r.vendor_id, r.vendor_name])).entries()].map(([id, name]) => ({ id, name }));

  res.json({ managers, vendors, cells });
});

// Item Price History — winning-bid prices over time per item, for trend/anomaly visualization.
router.get('/price-history', (req, res) => {
  refreshDetection();

  const rows = db.prepare(`
    SELECT r.id AS requirement_id, r.title AS item, q.per_unit_price, qo.decided_at
    FROM requirements r
    JOIN quotations q ON q.requirement_id = r.id
    JOIN quotation_outcomes qo ON qo.quotation_id = q.id AND qo.outcome = 'won'
    ORDER BY qo.decided_at ASC
  `).all();

  const byItem = new Map();
  for (const row of rows) {
    const key = row.item.trim().toLowerCase();
    if (!byItem.has(key)) byItem.set(key, { item: row.item, history: [] });
    byItem.get(key).history.push({
      requirement_id: row.requirement_id,
      price: row.per_unit_price,
      decided_at: row.decided_at,
      decided_at_ist: toIST(row.decided_at),
    });
  }

  const items = [...byItem.values()].map(({ item, history }) => {
    const avg = history.reduce((sum, h) => sum + h.price, 0) / history.length;
    return {
      item,
      average_price: Math.round(avg * 100) / 100,
      history: history.map((h) => ({ ...h, is_anomaly: h.price > avg * 1.15 })),
    };
  }).filter((i) => i.history.length > 0);

  res.json({ items });
});

// Suspicious Transactions — HIGH-risk flags only, enriched with the financial exposure they represent.
router.get('/suspicious-transactions', (req, res) => {
  refreshDetection();

  const flags = db.prepare(`
    SELECT pf.*, r.title AS requirement_title, r.status AS requirement_status, v.company_name AS vendor_name,
           wqo.decided_at AS decided_at, wv.company_name AS winning_vendor_name, wdm.name AS decided_by_name
    FROM partiality_flags pf
    JOIN requirements r ON r.id = pf.requirement_id
    LEFT JOIN vendors v ON v.id = pf.vendor_id
    LEFT JOIN quotations wq ON wq.requirement_id = r.id AND wq.is_latest = 1
    LEFT JOIN quotation_outcomes wqo ON wqo.quotation_id = wq.id AND wqo.outcome = 'won'
    LEFT JOIN vendors wv ON wv.id = wq.vendor_id
    LEFT JOIN managers wdm ON wdm.id = wqo.decided_by
    WHERE pf.risk_level = 'HIGH'
    ORDER BY pf.detected_at DESC
  `).all();

  const exposureCache = new Map();
  const enriched = flags.map((f) => {
    if (!exposureCache.has(f.requirement_id)) {
      exposureCache.set(f.requirement_id, computeOverpaymentForRequirement(f.requirement_id));
    }
    return {
      ...f,
      detected_at_ist: toIST(f.detected_at),
      decided_at_ist: f.decided_at ? toIST(f.decided_at) : null,
      financial_exposure: exposureCache.get(f.requirement_id),
    };
  });

  res.json({ transactions: enriched });
});

function loadAuditReportData() {
  refreshDetection();

  const score = computeHealthScore();
  const flags = db.prepare(`
    SELECT pf.*, r.title AS requirement_title, r.status AS requirement_status, v.company_name AS vendor_name,
           wqo.decided_at AS decided_at, wv.company_name AS winning_vendor_name, wdm.name AS decided_by_name
    FROM partiality_flags pf
    JOIN requirements r ON r.id = pf.requirement_id
    LEFT JOIN vendors v ON v.id = pf.vendor_id
    LEFT JOIN quotations wq ON wq.requirement_id = r.id AND wq.is_latest = 1
    LEFT JOIN quotation_outcomes wqo ON wqo.quotation_id = wq.id AND wqo.outcome = 'won'
    LEFT JOIN vendors wv ON wv.id = wq.vendor_id
    LEFT JOIN managers wdm ON wdm.id = wqo.decided_by
    ORDER BY CASE pf.risk_level WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, pf.detected_at DESC
  `).all();
  const leaderboard = db.prepare(`
    SELECT v.company_name,
      COUNT(q.id) AS total_bids,
      SUM(CASE WHEN qo.outcome = 'won' THEN 1 ELSE 0 END) AS wins
    FROM vendors v
    LEFT JOIN quotations q ON q.vendor_id = v.id AND q.is_latest = 1
    LEFT JOIN quotation_outcomes qo ON qo.quotation_id = q.id
    GROUP BY v.id
    HAVING total_bids > 0
    ORDER BY (CAST(wins AS REAL) / total_bids) DESC
  `).all().map((v) => ({ ...v, win_rate: v.total_bids > 0 ? Math.round((v.wins / v.total_bids) * 100) : 0 }));

  return { score, flags, leaderboard };
}

const RISK_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 };

// Groups flag rows into one entry per requirement-instance (item + decision date), mirroring
// the Compliance page UI — avoids repeating the item/risk-type labels for every flag and
// keeps two requirements that share an item name as distinct entries.
function groupFlagsByInstance(flags) {
  const map = new Map();
  for (const f of flags) {
    if (!map.has(f.requirement_id)) {
      map.set(f.requirement_id, {
        requirement_title: f.requirement_title,
        requirement_status: f.requirement_status,
        decided_at_ist: f.decided_at ? toIST(f.decided_at) : null,
        winning_vendor_name: f.winning_vendor_name,
        decided_by_name: f.decided_by_name,
        maxRisk: f.risk_level,
        byRisk: new Map(),
      });
    }
    const group = map.get(f.requirement_id);
    if (RISK_RANK[f.risk_level] > RISK_RANK[group.maxRisk]) group.maxRisk = f.risk_level;
    if (!group.byRisk.has(f.risk_level)) group.byRisk.set(f.risk_level, new Map());
    const typeMap = group.byRisk.get(f.risk_level);
    if (!typeMap.has(f.flag_type)) typeMap.set(f.flag_type, new Set());
    typeMap.get(f.flag_type).add(f.description);
  }
  return [...map.values()];
}

router.get('/report/csv', (req, res) => {
  const { score, flags, leaderboard } = loadAuditReportData();

  const flagRows = flags.map((f) => ({
    Section: 'Partiality Flag',
    Requirement: f.requirement_title,
    'Risk Level': f.risk_level,
    Type: f.flag_type,
    Vendor: f.vendor_name || '—',
    Description: f.description,
    'Detected At (IST)': toIST(f.detected_at),
    Resolved: f.resolved ? 'Yes' : 'No',
  }));
  const leaderboardRows = leaderboard.map((v) => ({
    Section: 'Vendor Win Rate',
    Requirement: '',
    'Risk Level': '',
    Type: v.company_name,
    Vendor: `${v.wins}/${v.total_bids} bids won`,
    Description: `Win rate: ${v.win_rate}%`,
    'Detected At (IST)': '',
    Resolved: '',
  }));

  const parser = new Parser({
    fields: ['Section', 'Requirement', 'Risk Level', 'Type', 'Vendor', 'Description', 'Detected At (IST)', 'Resolved'],
  });
  const csv = `Procurement Health Score,${score}/100\n\n` + parser.parse([...flagRows, ...leaderboardRows]);

  recordAudit({
    actionType: 'EXPORT_DOWNLOADED',
    performedBy: `manager:${req.manager.id}(${req.manager.email})`,
    targetType: 'compliance_report',
    targetId: null,
    details: { format: 'csv' },
    ip: getClientIp(req),
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="procurement-audit-report.csv"');
  res.send(csv);
});

router.get('/report/pdf', (req, res) => {
  const { score, flags, leaderboard } = loadAuditReportData();

  recordAudit({
    actionType: 'EXPORT_DOWNLOADED',
    performedBy: `manager:${req.manager.id}(${req.manager.email})`,
    targetType: 'compliance_report',
    targetId: null,
    details: { format: 'pdf' },
    ip: getClientIp(req),
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="procurement-audit-report.pdf"');

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(20).fillColor('#1C1C1E').text('Procurement Audit Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#B8962E').text('Anti-Corruption & Partiality Detection Engine', { align: 'center' });
  doc.moveDown(1.5);

  doc.fontSize(13).fillColor('#1C1C1E').text(`Procurement Health Score: ${score} / 100`);
  doc.fontSize(9).fillColor('#666').text(`Generated: ${toIST(new Date().toISOString())}`);
  doc.moveDown(1);

  const flagGroups = groupFlagsByInstance(flags);
  doc.fontSize(13).fillColor('#1C1C1E').text(`Flagged Requirements (${flagGroups.length})`, { underline: true });
  if (flagGroups.length === 0) {
    doc.moveDown(0.4).fontSize(10).fillColor('#666').text('No partiality flags have been detected.');
  } else {
    flagGroups.forEach((g, idx) => {
      const color = g.maxRisk === 'HIGH' ? '#a33' : g.maxRisk === 'MEDIUM' ? '#a87a00' : '#666';
      doc.moveDown(idx === 0 ? 0.4 : 0.7);
      doc.fontSize(10).fillColor(color).text(`[${g.maxRisk}] ${g.requirement_title}${g.decided_at_ist ? `  —  ${g.decided_at_ist}` : ''}`);
      doc.fontSize(9).fillColor('#888').text(
        g.winning_vendor_name
          ? `   Won by ${g.winning_vendor_name}${g.decided_by_name ? `  •  Decided by ${g.decided_by_name}` : ''}`
          : `   Status: ${g.requirement_status}`
      );
      for (const risk of ['HIGH', 'MEDIUM', 'LOW']) {
        const typeMap = g.byRisk.get(risk);
        if (!typeMap) continue;
        for (const [flagType, descriptions] of typeMap) {
          doc.moveDown(0.2);
          doc.fontSize(9).fillColor(color).text(`   [${risk}] ${flagType}`);
          for (const description of descriptions) {
            doc.fontSize(9).fillColor('#444').text(`      • ${description}`);
          }
        }
      }
    });
  }

  doc.moveDown(1);
  doc.fontSize(13).fillColor('#1C1C1E').text('Vendor Win-Rate Leaderboard', { underline: true });
  if (leaderboard.length === 0) {
    doc.moveDown(0.4).fontSize(10).fillColor('#666').text('No quotations recorded yet.');
  } else {
    leaderboard.forEach((v, idx) => {
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#1C1C1E').text(`${idx + 1}. ${v.company_name} — ${v.win_rate}% win rate (${v.wins}/${v.total_bids} bids)`);
    });
  }

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor('#999').text(
    'This report is system-generated and reflects the procurement system state at the time of generation. All timestamps shown in IST.',
    { align: 'center' }
  );

  doc.end();
});

module.exports = router;
