// All timestamps are stored in UTC (ISO strings). This helper converts to IST for display.
function toIST(utcIsoString) {
  if (!utcIsoString) return null;
  const date = new Date(utcIsoString.endsWith('Z') ? utcIsoString : utcIsoString + 'Z');
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }) + ' IST';
}

function nowUTC() {
  return new Date().toISOString();
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

module.exports = { toIST, nowUTC, getClientIp };
