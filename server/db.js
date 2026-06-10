const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'procurement.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS managers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  category TEXT NOT NULL,
  unique_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  grade TEXT,
  deadline TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Pending','Closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by INTEGER NOT NULL REFERENCES managers(id)
);

CREATE TABLE IF NOT EXISTS requirement_vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(requirement_id, vendor_id)
);

-- Each vendor submission (and every later revision) is its own immutable row — never
-- updated or deleted. revision_number/parent_quotation_id/is_latest track the version
-- chain so the manager sees full history while detection always uses the latest.
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  per_unit_price REAL NOT NULL,
  total_value REAL NOT NULL,
  lead_time_days INTEGER NOT NULL,
  validity_period TEXT NOT NULL,
  payment_terms TEXT NOT NULL,
  remarks TEXT,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revision_number INTEGER NOT NULL DEFAULT 0,
  parent_quotation_id INTEGER REFERENCES quotations(id),
  is_latest INTEGER NOT NULL DEFAULT 1
);

-- Only one row per (requirement, vendor) may be the "current" quotation at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_latest_per_vendor
  ON quotations(requirement_id, vendor_id) WHERE is_latest = 1;

CREATE TABLE IF NOT EXISTS quotation_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id INTEGER NOT NULL UNIQUE REFERENCES quotations(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('won','not_selected')),
  rejection_reason TEXT,
  justification TEXT,
  decided_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_by INTEGER NOT NULL REFERENCES managers(id)
);

CREATE TABLE IF NOT EXISTS vendor_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  action TEXT NOT NULL,
  requirement_id INTEGER REFERENCES requirements(id),
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ip_address TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_type TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ip_address TEXT
);

CREATE TABLE IF NOT EXISTS partiality_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  flag_type TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
  vendor_id INTEGER REFERENCES vendors(id),
  description TEXT NOT NULL,
  metric_value REAL,
  detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved INTEGER NOT NULL DEFAULT 0,
  UNIQUE(requirement_id, flag_type, vendor_id)
);

-- In-app notifications for managers (e.g. quotation received/revised).
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_id INTEGER NOT NULL REFERENCES managers(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Short-lived sessions issued once a vendor verifies their email for a token-based portal link.
-- The cookie carries only the session id; the row binds it to the exact vendor + email + IP
-- that completed verification, so a stolen link alone can never grant access.
CREATE TABLE IF NOT EXISTS vendor_sessions (
  id TEXT PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  vendor_token TEXT NOT NULL,
  verified_email TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);

-- Per-IP, per-token failed verification attempts, used to trigger a 1-hour lockout after 5 tries.
CREATE TABLE IF NOT EXISTS vendor_verification_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_token TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`);

// Migration guard: existing database files created before this column set was added
// won't pick up new columns from CREATE TABLE IF NOT EXISTS, so add them explicitly.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('quotation_outcomes', 'justification', 'TEXT');
ensureColumn('partiality_flags', 'metric_value', 'REAL');
ensureColumn('managers', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('managers', 'is_primary_admin', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('managers', 'permissions', "TEXT NOT NULL DEFAULT '[]'");
// 'procurement_manager' (raise requirements, assign vendors, decide winners) or
// 'factory_manager' (raise requirements only). Admins are unaffected by this field.
ensureColumn('managers', 'role', "TEXT NOT NULL DEFAULT 'procurement_manager'");

// On first migration, promote the earliest manager to admin so there is always one.
const adminCount = db.prepare('SELECT COUNT(*) AS cnt FROM managers WHERE is_admin = 1').get().cnt;
if (adminCount === 0) {
  const first = db.prepare('SELECT id FROM managers ORDER BY id ASC LIMIT 1').get();
  if (first) db.prepare('UPDATE managers SET is_admin = 1 WHERE id = ?').run(first.id);
}

// Ensure primary admin kashish@shiva-group.com exists.
const PRIMARY_ADMIN_EMAIL = 'kashish@shiva-group.com';
const existingKashish = db.prepare('SELECT id FROM managers WHERE email = ?').get(PRIMARY_ADMIN_EMAIL);
if (!existingKashish) {
  db.prepare('INSERT INTO managers (email, password_hash, name, is_admin, is_primary_admin) VALUES (?, ?, ?, 1, 1)')
    .run(PRIMARY_ADMIN_EMAIL, bcrypt.hashSync('kashish123', 10), 'Kashish');
} else {
  db.prepare('UPDATE managers SET is_admin = 1, is_primary_admin = 1 WHERE email = ?').run(PRIMARY_ADMIN_EMAIL);
}

module.exports = db;
