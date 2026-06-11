const db = require('../db');

const WIN_RATE_THRESHOLD = 0.6;
const CLUSTER_PCT = 0.02; // 2%
const SHORT_DEADLINE_HOURS = 48;

const PRICE_INFLATION_THRESHOLD = 1.20;   // winning > 20% above avg of non-winning quotes
const LAST_MINUTE_WINDOW_PCT = 90;        // submitted within final 10% of deadline window
const HISTORICAL_DRIFT_THRESHOLD = 1.15;  // winning > 15% above historical average for item
const HISTORICAL_DRIFT_MONTHS = 6;
const COLLUSION_WIN_SHARE = 0.5;          // vendor wins > 50% of one manager's requirements
const COLLUSION_MIN_DECIDED = 3;          // manager must have decided >= 3 requirements
const COMPETITIVE_PCT = 0.10;             // within 10% of requirement's average price
const CONSISTENT_LOSER_MIN_COUNT = 5;     // > 5 competitive-but-never-won submissions

const insertFlag = db.prepare(`
  INSERT OR IGNORE INTO partiality_flags (requirement_id, flag_type, risk_level, vendor_id, description, metric_value)
  VALUES (@requirement_id, @flag_type, @risk_level, @vendor_id, @description, @metric_value)
`);

const findExistingFlag = db.prepare(`
  SELECT 1 FROM partiality_flags
  WHERE requirement_id = ? AND flag_type = ?
    AND ((vendor_id IS NULL AND ? IS NULL) OR vendor_id = ?)
`);

// SQLite treats NULL vendor_id values as distinct for the UNIQUE constraint, so flags without
// a vendor need an explicit existence check to avoid duplicate rows on every re-run of detection.
const persistFlags = db.transaction((flags) => {
  for (const flag of flags) {
    const exists = findExistingFlag.get(flag.requirement_id, flag.flag_type, flag.vendor_id, flag.vendor_id);
    if (!exists) insertFlag.run({ metric_value: null, ...flag });
  }
});

const getQuotationsForRequirement = db.prepare(`
  SELECT q.*, v.company_name, qo.outcome, qo.rejection_reason, qo.decided_at
  FROM quotations q
  JOIN vendors v ON v.id = q.vendor_id
  LEFT JOIN quotation_outcomes qo ON qo.quotation_id = q.id
  WHERE q.requirement_id = ? AND q.is_latest = 1
  ORDER BY q.per_unit_price ASC
`);

const getRequirement = db.prepare(`SELECT * FROM requirements WHERE id = ?`);

const getAssignedVendorCount = db.prepare(`
  SELECT COUNT(*) AS cnt FROM requirement_vendors WHERE requirement_id = ?
`);

const getVendorWinStats = db.prepare(`
  SELECT
    COUNT(*) AS total_bids,
    SUM(CASE WHEN qo.outcome = 'won' THEN 1 ELSE 0 END) AS wins
  FROM quotations q
  LEFT JOIN quotation_outcomes qo ON qo.quotation_id = q.id
  WHERE q.vendor_id = ? AND q.is_latest = 1
`);

const getHistoricalWinningPrices = db.prepare(`
  SELECT q.per_unit_price
  FROM requirements r2
  JOIN quotations q ON q.requirement_id = r2.id AND q.is_latest = 1
  JOIN quotation_outcomes qo ON qo.quotation_id = q.id AND qo.outcome = 'won'
  WHERE LOWER(TRIM(r2.title)) = LOWER(TRIM(?)) AND r2.id != ? AND qo.decided_at >= ?
`);

function asUtcDate(isoString) {
  return new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
}

function average(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Runs all partiality + embezzlement detection signals for a requirement and persists
 * any new flags. Returns { riskLevel, flags } where flags is the full current flag list.
 */
function runDetection(requirementId) {
  const requirement = getRequirement.get(requirementId);
  if (!requirement) return { riskLevel: 'LOW', flags: [] };

  const quotations = getQuotationsForRequirement.all(requirementId);
  const newFlags = [];
  const winning = quotations.find((q) => q.outcome === 'won');

  // Signal 1: Price Outlier — winning quote is not the cheapest
  if (winning && quotations.length > 1) {
    const cheapest = quotations[0]; // sorted ascending by per_unit_price
    if (winning.id !== cheapest.id && cheapest.per_unit_price < winning.per_unit_price) {
      newFlags.push({
        requirement_id: requirementId,
        flag_type: 'PRICE_OUTLIER',
        risk_level: 'HIGH',
        vendor_id: winning.vendor_id,
        description: `Lower quote exists but not selected — ${cheapest.company_name} quoted ₹${cheapest.per_unit_price} vs winning ₹${winning.per_unit_price} from ${winning.company_name}`,
      });
    }
  }

  // Signal 2: Vendor Win Rate — vendor wins more than 60% of their bids
  const vendorIds = [...new Set(quotations.map((q) => q.vendor_id))];
  for (const vendorId of vendorIds) {
    const stats = getVendorWinStats.get(vendorId);
    if (stats.total_bids >= 3 && stats.wins / stats.total_bids > WIN_RATE_THRESHOLD) {
      const vendor = quotations.find((q) => q.vendor_id === vendorId);
      newFlags.push({
        requirement_id: requirementId,
        flag_type: 'VENDOR_WIN_RATE',
        risk_level: 'HIGH',
        vendor_id: vendorId,
        description: `${vendor.company_name} has won ${stats.wins}/${stats.total_bids} bids (${Math.round((stats.wins / stats.total_bids) * 100)}%) — exceeds 60% win-rate threshold`,
      });
    }
  }

  // Signal 3: Quote Clustering — two quotes within 1-2% of each other, all others much higher
  if (quotations.length >= 3) {
    for (let i = 0; i < quotations.length; i++) {
      for (let j = i + 1; j < quotations.length; j++) {
        const a = quotations[i];
        const b = quotations[j];
        const diffPct = Math.abs(a.per_unit_price - b.per_unit_price) / Math.min(a.per_unit_price, b.per_unit_price);
        if (diffPct <= CLUSTER_PCT) {
          const others = quotations.filter((q) => q.id !== a.id && q.id !== b.id);
          const clusterAvg = (a.per_unit_price + b.per_unit_price) / 2;
          const allOthersHigher = others.length > 0 && others.every((o) => o.per_unit_price > clusterAvg * 1.05);
          if (allOthersHigher) {
            newFlags.push({
              requirement_id: requirementId,
              flag_type: 'QUOTE_CLUSTERING',
              risk_level: 'MEDIUM',
              vendor_id: null,
              description: `Possible quote sharing — ${a.company_name} (₹${a.per_unit_price}) and ${b.company_name} (₹${b.per_unit_price}) are within ${(diffPct * 100).toFixed(2)}% of each other while other bids are significantly higher`,
            });
          }
        }
      }
    }
  }

  // Signal 4: Single Vendor — requirement assigned to only one vendor
  const assignedCount = getAssignedVendorCount.get(requirementId).cnt;
  if (assignedCount === 1) {
    newFlags.push({
      requirement_id: requirementId,
      flag_type: 'SINGLE_VENDOR',
      risk_level: 'LOW',
      vendor_id: null,
      description: 'No competitive bidding — this requirement was assigned to only one vendor',
    });
  }

  // Signal 5: Short Deadline — deadline less than 48 hours from creation
  const created = asUtcDate(requirement.created_at);
  const deadline = new Date(requirement.deadline);
  const hoursDiff = (deadline.getTime() - created.getTime()) / (1000 * 60 * 60);
  if (hoursDiff < SHORT_DEADLINE_HOURS) {
    newFlags.push({
      requirement_id: requirementId,
      flag_type: 'SHORT_DEADLINE',
      risk_level: 'LOW',
      vendor_id: null,
      description: `Insufficient bidding time — deadline was set only ${Math.max(0, Math.round(hoursDiff))} hours after the requirement was created (minimum recommended: 48 hours)`,
    });
  }

  // ---- Embezzlement / bid-inflation signals (require a recorded winner) ----
  if (winning) {
    // Signal E1 — Price Inflation: winning bid > 20% above the average of all non-winning quotes
    if (quotations.length >= 3) {
      const nonWinning = quotations.filter((q) => q.id !== winning.id);
      const avgNonWinning = average(nonWinning.map((q) => q.per_unit_price));
      if (avgNonWinning > 0 && winning.per_unit_price > avgNonWinning * PRICE_INFLATION_THRESHOLD) {
        const deviationPct = ((winning.per_unit_price - avgNonWinning) / avgNonWinning) * 100;
        newFlags.push({
          requirement_id: requirementId,
          flag_type: 'PRICE_INFLATION',
          risk_level: 'HIGH',
          vendor_id: winning.vendor_id,
          description: `Winning bid significantly above market average — possible price inflation. ${winning.company_name} won at ₹${winning.per_unit_price}, which is ${deviationPct.toFixed(1)}% above the ₹${avgNonWinning.toFixed(2)} average of other bids`,
          metric_value: Math.round(deviationPct * 10) / 10,
        });
      }
    }

    // Signal E2 — Last Minute Submission: winning bid submitted in the final 10% of the deadline window, and won
    const windowMs = deadline.getTime() - created.getTime();
    if (windowMs > 0) {
      const submittedAt = asUtcDate(winning.submitted_at);
      const elapsedPct = ((submittedAt.getTime() - created.getTime()) / windowMs) * 100;
      if (elapsedPct >= LAST_MINUTE_WINDOW_PCT) {
        newFlags.push({
          requirement_id: requirementId,
          flag_type: 'LAST_MINUTE_SUBMISSION',
          risk_level: 'MEDIUM',
          vendor_id: winning.vendor_id,
          description: `Winning bid submitted at last minute — possible coordination. ${winning.company_name}'s winning quotation was submitted at ${elapsedPct.toFixed(1)}% of the deadline window (within the final 10%)`,
          metric_value: Math.round(elapsedPct * 10) / 10,
        });
      }
    }

    // Signal E3 — Bid Gap Analysis: winning bid is worse than the second-lowest bid (cheaper options were skipped over)
    if (quotations.length >= 2) {
      const lowest = quotations[0];
      const secondLowest = quotations[1];
      if (winning.per_unit_price > secondLowest.per_unit_price) {
        const overpaidPerUnit = winning.per_unit_price - lowest.per_unit_price;
        const totalOverpaid = overpaidPerUnit * requirement.quantity;
        newFlags.push({
          requirement_id: requirementId,
          flag_type: 'BID_GAP',
          risk_level: 'HIGH',
          vendor_id: winning.vendor_id,
          description: `Cheaper option available — higher bid selected. (₹${winning.per_unit_price} − ₹${lowest.per_unit_price}) × ${requirement.quantity} ${requirement.unit} = ₹${totalOverpaid.toLocaleString('en-IN')} potential loss versus the lowest bid from ${lowest.company_name}`,
          metric_value: Math.round(totalOverpaid * 100) / 100,
        });
      }
    }

    // Signal E4 — Historical Price Drift: winning price > 15% above the average winning price
    // for the same item over the last 6 months
    const sixMonthsAgo = new Date(asUtcDate(winning.decided_at).getTime() - HISTORICAL_DRIFT_MONTHS * 30 * 24 * 3600 * 1000).toISOString();
    const historicalPrices = getHistoricalWinningPrices.all(requirement.title, requirementId, sixMonthsAgo).map((r) => r.per_unit_price);
    if (historicalPrices.length >= 1) {
      const avgHistorical = average(historicalPrices);
      if (avgHistorical > 0 && winning.per_unit_price > avgHistorical * HISTORICAL_DRIFT_THRESHOLD) {
        const drivePct = ((winning.per_unit_price - avgHistorical) / avgHistorical) * 100;
        newFlags.push({
          requirement_id: requirementId,
          flag_type: 'HISTORICAL_PRICE_DRIFT',
          risk_level: 'MEDIUM',
          vendor_id: winning.vendor_id,
          description: `Winning price significantly higher than historical average for this item — ₹${winning.per_unit_price} is ${drivePct.toFixed(1)}% above the ₹${avgHistorical.toFixed(2)} average winning price for "${requirement.title}" over the last ${HISTORICAL_DRIFT_MONTHS} months`,
          metric_value: Math.round(drivePct * 10) / 10,
        });
      }
    }
  }

  persistFlags(newFlags);

  const allFlags = db.prepare(`
    SELECT pf.*, v.company_name AS vendor_name
    FROM partiality_flags pf
    LEFT JOIN vendors v ON v.id = pf.vendor_id
    WHERE pf.requirement_id = ?
    ORDER BY
      CASE pf.risk_level WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
      pf.detected_at DESC
  `).all(requirementId);

  let riskLevel = 'LOW';
  if (allFlags.some((f) => f.risk_level === 'HIGH')) riskLevel = 'HIGH';
  else if (allFlags.some((f) => f.risk_level === 'MEDIUM')) riskLevel = 'MEDIUM';

  return { riskLevel, flags: allFlags };
}

/**
 * Cross-requirement embezzlement signals that look at patterns across the whole system
 * rather than a single requirement: manager↔vendor collusion and systematically excluded
 * (but competitive) vendors. Flags are attached to the most recent contributing requirement
 * so they surface in that requirement's detail view as well as system-wide on Compliance.
 */
function runGlobalDetection() {
  const newFlags = [];

  // Signal E5 — Repeat Winner Anomaly: one vendor wins > 50% of the requirements decided by
  // the same manager. Keyed on who made the award decision (decided_by), not who raised
  // the requirement — the requirement raiser doesn't choose the winner.
  const decidedWins = db.prepare(`
    SELECT r.id AS requirement_id, qo.decided_by AS manager_id, m.name AS manager_name,
           q.vendor_id, v.company_name AS vendor_name, qo.decided_at
    FROM requirements r
    JOIN quotations q ON q.requirement_id = r.id AND q.is_latest = 1
    JOIN quotation_outcomes qo ON qo.quotation_id = q.id AND qo.outcome = 'won'
    JOIN managers m ON m.id = qo.decided_by
    JOIN vendors v ON v.id = q.vendor_id
  `).all();

  const byManager = new Map();
  for (const row of decidedWins) {
    if (!byManager.has(row.manager_id)) {
      byManager.set(row.manager_id, { managerName: row.manager_name, total: 0, byVendor: new Map() });
    }
    const m = byManager.get(row.manager_id);
    m.total += 1;
    if (!m.byVendor.has(row.vendor_id)) {
      m.byVendor.set(row.vendor_id, { vendorName: row.vendor_name, wins: 0, latestRequirementId: null, latestDecidedAt: null });
    }
    const v = m.byVendor.get(row.vendor_id);
    v.wins += 1;
    if (!v.latestDecidedAt || row.decided_at > v.latestDecidedAt) {
      v.latestDecidedAt = row.decided_at;
      v.latestRequirementId = row.requirement_id;
    }
  }
  for (const m of byManager.values()) {
    if (m.total < COLLUSION_MIN_DECIDED) continue;
    for (const [vendorId, v] of m.byVendor) {
      const share = v.wins / m.total;
      if (share > COLLUSION_WIN_SHARE) {
        newFlags.push({
          requirement_id: v.latestRequirementId,
          flag_type: 'VENDOR_MANAGER_COLLUSION',
          risk_level: 'HIGH',
          vendor_id: vendorId,
          description: `Vendor consistently wins requirements decided by the same person — possible collusion. ${v.vendorName} has won ${v.wins}/${m.total} (${Math.round(share * 100)}%) of requirements decided by ${m.managerName}, exceeding the 50% threshold`,
          metric_value: Math.round(share * 1000) / 10,
        });
      }
    }
  }

  // Signal E6 — Consistent Loser Pattern: competitively-priced vendor that never wins
  const allQuotes = db.prepare(`
    SELECT q.id, q.requirement_id, q.vendor_id, q.per_unit_price, q.submitted_at, v.company_name AS vendor_name, qo.outcome
    FROM quotations q
    JOIN vendors v ON v.id = q.vendor_id
    LEFT JOIN quotation_outcomes qo ON qo.quotation_id = q.id
    WHERE q.is_latest = 1
  `).all();

  const reqPrices = new Map();
  for (const q of allQuotes) {
    if (!reqPrices.has(q.requirement_id)) reqPrices.set(q.requirement_id, []);
    reqPrices.get(q.requirement_id).push(q.per_unit_price);
  }
  const reqAverages = new Map();
  for (const [rid, prices] of reqPrices) reqAverages.set(rid, average(prices));

  const vendorStats = new Map();
  for (const q of allQuotes) {
    const avg = reqAverages.get(q.requirement_id);
    const isCompetitive = avg > 0 && Math.abs(q.per_unit_price - avg) / avg <= COMPETITIVE_PCT;
    if (!vendorStats.has(q.vendor_id)) {
      vendorStats.set(q.vendor_id, { vendorName: q.vendor_name, competitiveCount: 0, wins: 0, latestRequirementId: null, latestSubmittedAt: null });
    }
    const s = vendorStats.get(q.vendor_id);
    if (q.outcome === 'won') s.wins += 1;
    if (isCompetitive) {
      s.competitiveCount += 1;
      if (!s.latestSubmittedAt || q.submitted_at > s.latestSubmittedAt) {
        s.latestSubmittedAt = q.submitted_at;
        s.latestRequirementId = q.requirement_id;
      }
    }
  }
  for (const [vendorId, s] of vendorStats) {
    if (s.competitiveCount > CONSISTENT_LOSER_MIN_COUNT && s.wins === 0) {
      newFlags.push({
        requirement_id: s.latestRequirementId,
        flag_type: 'CONSISTENT_LOSER',
        risk_level: 'MEDIUM',
        vendor_id: vendorId,
        description: `Competitive vendor never selected — possible systematic exclusion. ${s.vendorName} has submitted ${s.competitiveCount} quotations within 10% of the average price but has never won a single requirement`,
        metric_value: s.competitiveCount,
      });
    }
  }

  persistFlags(newFlags);
  return newFlags;
}

/**
 * Computes an overall procurement health score (0-100).
 * Starts at 100 and deducts points for active flags across all requirements.
 */
function computeHealthScore() {
  const flags = db.prepare(`SELECT risk_level, requirement_id FROM partiality_flags`).all();
  const requirementCount = db.prepare(`SELECT COUNT(*) AS cnt FROM requirements`).get().cnt;

  if (requirementCount === 0) return 100;

  let deductions = 0;
  for (const flag of flags) {
    if (flag.risk_level === 'HIGH') deductions += 12;
    else if (flag.risk_level === 'MEDIUM') deductions += 6;
    else deductions += 2;
  }

  const score = Math.max(0, Math.round(100 - deductions / Math.max(1, Math.sqrt(requirementCount))));
  return Math.min(100, score);
}

module.exports = { runDetection, runGlobalDetection, computeHealthScore };
