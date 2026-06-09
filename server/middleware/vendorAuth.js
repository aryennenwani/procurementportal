const db = require('../db');

const SESSION_COOKIE = 'vqp_vendor_session';
const SESSION_HOURS = 24;

const getSession = db.prepare('SELECT * FROM vendor_sessions WHERE id = ?');

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: SESSION_HOURS * 60 * 60 * 1000,
};

function setSessionCookie(res, sessionId) {
  res.cookie(SESSION_COOKIE, sessionId, cookieOptions);
}

// Confirms the request carries a live session bound to this exact vendor token. Accepts
// either the httpOnly cookie (desktop) or the X-Vendor-Session header (mobile/localStorage).
function requireVendorSession(req, res, next) {
  const sessionId = req.cookies?.[SESSION_COOKIE] || req.headers['x-vendor-session'];
  if (!sessionId) {
    return res.status(401).json({ error: 'Please verify your email address to access this portal.' });
  }

  const session = getSession.get(sessionId);
  if (!session || session.vendor_token !== req.params.token || new Date(`${session.expires_at}Z`).getTime() < Date.now()) {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    return res.status(401).json({ error: 'Your session has expired. Please verify your email address again.' });
  }

  req.vendorSession = session;
  next();
}

module.exports = { SESSION_COOKIE, SESSION_HOURS, cookieOptions, setSessionCookie, requireVendorSession };
