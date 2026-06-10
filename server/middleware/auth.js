const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Fetch fresh data on every request so permission/role changes take effect immediately.
    const row = db.prepare(
      'SELECT id, email, name, is_admin, is_primary_admin, permissions, role FROM managers WHERE id = ?'
    ).get(payload.id);
    if (!row) return res.status(401).json({ error: 'Account not found. Please log in again.' });

    req.manager = {
      id: row.id,
      email: row.email,
      name: row.name,
      is_admin: row.is_admin || 0,
      is_primary_admin: row.is_primary_admin || 0,
      permissions: JSON.parse(row.permissions || '[]'),
      role: row.role || 'procurement_manager',
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.manager?.is_admin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

function requirePrimaryAdmin(req, res, next) {
  if (!req.manager?.is_primary_admin) {
    return res.status(403).json({ error: 'Only the primary admin can perform this action.' });
  }
  next();
}

// Returns middleware that passes if the manager is an admin OR has the given permission.
function requirePermission(permission) {
  return (req, res, next) => {
    if (req.manager?.is_admin) return next();
    if (req.manager?.permissions?.includes(permission)) return next();
    return res.status(403).json({ error: 'You do not have permission to access this.' });
  };
}

// Factory managers can only raise requirements — assigning vendors and deciding
// quotation outcomes is restricted to procurement managers and admins.
function requireProcurementManager(req, res, next) {
  if (req.manager?.is_admin) return next();
  if (req.manager?.role !== 'factory_manager') return next();
  return res.status(403).json({ error: 'Factory managers cannot perform this action.' });
}

module.exports = { requireAuth, requireAdmin, requirePrimaryAdmin, requirePermission, requireProcurementManager, JWT_SECRET };
