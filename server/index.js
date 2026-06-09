require('dotenv').config();
const path = require('path');
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

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = [FRONTEND_URL, 'http://localhost:5173'];

if (isEmpty()) {
  seed();
}

const app = express();

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

app.use((req, res) => {
  res.status(404).json({ error: 'The requested resource was not found.' });
});

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'An unexpected server error occurred. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`[server] Shivtek Spechemi Procurement Portal running on port ${PORT}`);
});
