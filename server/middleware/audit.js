const db = require('../db');
const { getClientIp } = require('../utils');

const insertLog = db.prepare(`
  INSERT INTO audit_log (action_type, performed_by, target_type, target_id, details_json, ip_address)
  VALUES (@action_type, @performed_by, @target_type, @target_id, @details_json, @ip_address)
`);

function recordAudit({ actionType, performedBy, targetType = null, targetId = null, details = null, ip = null }) {
  insertLog.run({
    action_type: actionType,
    performed_by: performedBy,
    target_type: targetType,
    target_id: targetId !== null && targetId !== undefined ? String(targetId) : null,
    details_json: details ? JSON.stringify(details) : null,
    ip_address: ip,
  });
}

// Logs a generic "page viewed" / request-level entry for every authenticated manager request.
function auditMiddleware(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const performedBy = req.manager ? `manager:${req.manager.id}(${req.manager.email})` : 'anonymous';
    recordAudit({
      actionType: `${req.method} ${req.baseUrl}${req.route ? req.route.path : req.path}`,
      performedBy,
      targetType: 'route',
      targetId: req.originalUrl,
      details: { method: req.method, query: req.query, params: req.params },
      ip: getClientIp(req),
    });
  });
  next();
}

module.exports = { auditMiddleware, recordAudit };
