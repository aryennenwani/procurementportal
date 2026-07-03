require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const db = require('./db');
const { seed, isEmpty } = require('./seed');
const { auditMiddleware } = require('./middleware/audit');

const authRoutes = require('./routes/auth');
const requirementRoutes = require('./routes/requirements');
const vendorRoutes = require('./routes/vendors');
const vendorPortalRoutes = require('./routes/vendorPortal');
const archiveRoutes = require('./routes/archive');
const exportRoutes = require('./routes/exportRoutes');
const complianceRoutes = require('./routes/compliance');
const auditLogRoutes = require('./routes/auditLog');
const quotationRoutes = require('./routes/quotations');
const notificationRoutes = require('./routes/notifications');
const managerAdminRoutes = require('./routes/managerAdmin');
const itemRoutes = require('./routes/items');
const purchaseOrderRoutes = require('./routes/purchaseOrders');

const PORT = process.env.PORT || 4000;
const IS_PROD = process.env.NODE_ENV === 'production';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = [FRONTEND_URL, 'http://localhost:5173'];

if (isEmpty()) {
  seed();
}

const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(auditMiddleware);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a few minutes and try again.' },
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/requirements', requirementRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/vendor', vendorPortalRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/managers', managerAdminRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);

// Unmatched API routes → JSON 404
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'The requested API resource was not found.' });
});

// In production, serve the built React app and let the SPA handle routing.
const clientDist = path.join(__dirname, '../client/dist');
if (IS_PROD && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'An unexpected server error occurred. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`[server] Shivtek Spechemi Procurement Portal running on port ${PORT}`);
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email]  WARNING: RESEND_API_KEY not set — vendor emails will NOT be sent.');
  } else {
    console.log('[email]  Resend email configured.');
  }
  if (require('./services/sap').isSapConfigured()) {
    console.log('[sap]    SAP S/4HANA integration configured — winning bids will create POs in SAP.');
  } else {
    console.warn('[sap]    SAP not configured — purchase orders will be raised in the portal only.');
  }
});
