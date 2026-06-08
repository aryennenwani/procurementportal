const STATUS_STYLES = {
  Open: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  Pending: 'bg-amber-100 text-amber-700 border-amber-300',
  Closed: 'bg-gray-100 text-gray-600 border-gray-300',
};

const RISK_STYLES = {
  HIGH: 'bg-red-100 text-red-700 border-red-300',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-300',
  LOW: 'bg-gray-100 text-gray-600 border-gray-300',
};

const OUTCOME_STYLES = {
  Won: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  'Not Selected': 'bg-red-100 text-red-700 border-red-300',
  'Pending Decision': 'bg-gray-100 text-gray-600 border-gray-300',
};

function Badge({ className, children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  return <Badge className={STATUS_STYLES[status] || STATUS_STYLES.Closed}>{status}</Badge>;
}

export function RiskBadge({ level }) {
  return <Badge className={RISK_STYLES[level] || RISK_STYLES.LOW}>{level} RISK</Badge>;
}

export function OutcomeBadge({ outcome }) {
  return <Badge className={OUTCOME_STYLES[outcome] || OUTCOME_STYLES['Pending Decision']}>{outcome}</Badge>;
}
