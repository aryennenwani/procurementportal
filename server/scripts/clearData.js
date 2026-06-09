const db = require('../db');

const tables = [
  'quotations',
  'requirement_vendors',
  'vendor_sessions',
  'notifications',
  'audit_log',
  'compliance_flags',
  'requirements',
  'vendors',
];

console.log('[clear] Removing all test/demo data...');
for (const table of tables) {
  try {
    const result = db.prepare(`DELETE FROM ${table}`).run();
    console.log(`[clear]   ${table}: removed ${result.changes} rows`);
  } catch (e) {
    console.log(`[clear]   ${table}: skipped (${e.message})`);
  }
}
console.log('[clear] Done. Managers table left intact.');
process.exit(0);
