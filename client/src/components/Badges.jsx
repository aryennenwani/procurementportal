const STATUS_STYLES = {
  Open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Closed: 'bg-slate-100 text-slate-600 border-slate-200',
};
const STATUS_DOTS = {
  Open: 'bg-emerald-500',
  Pending: 'bg-amber-500',
  Closed: 'bg-slate-400',
};

const RISK_STYLES = {
  HIGH: 'bg-red-50 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
};
const RISK_DOTS = {
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-slate-400',
};

const OUTCOME_STYLES = {
  Won: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Not Selected': 'bg-red-50 text-red-700 border-red-200',
  'Pending Decision': 'bg-slate-100 text-slate-600 border-slate-200',
};
const OUTCOME_DOTS = {
  Won: 'bg-emerald-500',
  'Not Selected': 'bg-red-500',
  'Pending Decision': 'bg-slate-400',
};

// ERP sync states for purchase orders.
const SAP_STYLES = {
  synced: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-blue-50 text-blue-700 border-blue-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  local: 'bg-slate-100 text-slate-600 border-slate-200',
};
const SAP_DOTS = {
  synced: 'bg-emerald-500',
  pending: 'bg-blue-500 animate-pulse',
  failed: 'bg-red-500',
  local: 'bg-slate-400',
};
const SAP_LABELS = {
  synced: 'Synced to SAP',
  pending: 'Syncing to SAP…',
  failed: 'SAP sync failed',
  local: 'Portal only',
};

function Badge({ className, dot, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  return <Badge className={STATUS_STYLES[status] || STATUS_STYLES.Closed} dot={STATUS_DOTS[status] || STATUS_DOTS.Closed}>{status}</Badge>;
}

export function RiskBadge({ level }) {
  return <Badge className={RISK_STYLES[level] || RISK_STYLES.LOW} dot={RISK_DOTS[level] || RISK_DOTS.LOW}>{level} RISK</Badge>;
}

export function OutcomeBadge({ outcome }) {
  return <Badge className={OUTCOME_STYLES[outcome] || OUTCOME_STYLES['Pending Decision']} dot={OUTCOME_DOTS[outcome] || OUTCOME_DOTS['Pending Decision']}>{outcome}</Badge>;
}

export function SapStatusBadge({ status }) {
  return <Badge className={SAP_STYLES[status] || SAP_STYLES.local} dot={SAP_DOTS[status] || SAP_DOTS.local}>{SAP_LABELS[status] || status}</Badge>;
}
