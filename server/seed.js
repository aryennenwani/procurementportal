const bcrypt = require('bcryptjs');
const db = require('./db');

function isEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM managers').get().cnt;
  return count === 0;
}

// Clean-start seed: creates only the default admin account. No demo vendors, requirements,
// quotations, or activity are generated — every list starts empty until real data is entered.
function seed() {
  if (!isEmpty()) {
    console.log('[seed] Database already has data — skipping seed.');
    return;
  }

  console.log('[seed] Creating default admin account...');

  db.prepare('INSERT INTO managers (email, password_hash, name, is_admin) VALUES (?, ?, ?, ?)').run(
    'admin@company.com',
    bcrypt.hashSync('admin123', 10),
    'Admin',
    1
  );

  console.log('[seed] Done. Default login: admin@company.com / admin123');
  console.log('[seed] IMPORTANT: Change the default password immediately after first login.');
}

if (require.main === module) {
  seed();
}

module.exports = { seed, isEmpty };
