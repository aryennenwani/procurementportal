const nodemailer = require('nodemailer');
const db = require('../db');
const { recordAudit } = require('../middleware/audit');
const { toIST } = require('../utils');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;

  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
}

function layout(bodyHtml, ctaLabel, ctaUrl) {
  return `
  <div style="background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1C1C1E;max-width:560px;margin:0 auto;padding:32px 28px;">
    <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#B8962E;font-weight:600;margin:0 0 18px;">Vendor Procurement Portal</p>
    ${bodyHtml}
    ${ctaUrl ? `
    <div style="margin:28px 0 8px;">
      <a href="${ctaUrl}" style="display:inline-block;background:#B8962E;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;">${ctaLabel}</a>
    </div>` : ''}
    <p style="font-size:12px;color:#8a8a8e;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">
      This is an automated message from the Vendor Procurement Portal. Please do not reply to this email.
    </p>
  </div>`;
}

// Sends an email via Gmail SMTP. Never throws — on failure it logs an "email_failed" audit
// entry and returns so the calling API request can complete normally.
async function sendMail({ to, subject, html, context }) {
  const t = getTransporter();
  if (!t) {
    recordAudit({
      actionType: 'email_failed',
      performedBy: 'system',
      targetType: context?.targetType || 'email',
      targetId: context?.targetId || null,
      details: { to, subject, reason: 'GMAIL_USER / GMAIL_APP_PASSWORD not configured' },
      ip: null,
    });
    return;
  }

  try {
    await t.sendMail({
      from: `"Vendor Procurement Portal" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    recordAudit({
      actionType: 'email_failed',
      performedBy: 'system',
      targetType: context?.targetType || 'email',
      targetId: context?.targetId || null,
      details: { to, subject, reason: err.message },
      ip: null,
    });
  }
}

// (a) Sent when a vendor is assigned to a requirement: their secure portal link + requirement details.
async function sendVendorAssignmentEmail({ vendor, requirement }) {
  const portalUrl = `${FRONTEND_URL}/vendor/${vendor.unique_token}`;
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 16px;">You've been invited to quote on a new requirement</h1>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      Hello ${vendor.contact_person}, <strong>${vendor.company_name}</strong> has been assigned to submit a quotation for the following requirement:
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 8px;">
      <tr><td style="padding:6px 0;color:#8a8a8e;width:120px;">Item</td><td style="padding:6px 0;font-weight:600;">${requirement.title}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8a8e;">Quantity</td><td style="padding:6px 0;">${requirement.quantity} ${requirement.unit}</td></tr>
      ${requirement.grade ? `<tr><td style="padding:6px 0;color:#8a8a8e;">Grade</td><td style="padding:6px 0;">${requirement.grade}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#8a8a8e;">Deadline</td><td style="padding:6px 0;">${toIST(requirement.deadline)}</td></tr>
    </table>
    <p style="font-size:14px;line-height:1.6;margin:16px 0 0;">
      Use the secure link below to access your private portal, verify your email, and submit your quotation.
    </p>
  `, 'View & Submit Quotation', portalUrl);

  await sendMail({
    to: vendor.email,
    subject: `New requirement assigned: ${requirement.title}`,
    html,
    context: { targetType: 'vendor', targetId: vendor.id },
  });
}

// (b) Sent to the manager who created the requirement when a vendor submits or revises a quote.
async function sendQuotationNotificationEmail({ manager, vendor, requirement, amount, revised = false }) {
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 16px;">${revised ? 'Quotation revised' : 'New quotation received'}</h1>
    <p style="font-size:14px;line-height:1.6;margin:0;">
      ${revised ? 'Quotation revised' : 'Quotation received'} from <strong>${vendor.company_name}</strong> for
      <strong>${requirement.title}</strong> — ₹${Number(amount).toLocaleString('en-IN')}.
    </p>
  `, 'View Requirement', `${FRONTEND_URL}/dashboard/requirements/${requirement.id}`);

  await sendMail({
    to: manager.email,
    subject: `${revised ? 'Quotation revised' : 'Quotation received'} from ${vendor.company_name} for ${requirement.title} — ₹${Number(amount).toLocaleString('en-IN')}`,
    html,
    context: { targetType: 'requirement', targetId: requirement.id },
  });
}

function notifyManager({ managerId, title, body, targetType = null, targetId = null }) {
  db.prepare(`
    INSERT INTO notifications (manager_id, title, body, target_type, target_id) VALUES (?, ?, ?, ?, ?)
  `).run(managerId, title, body, targetType, targetId !== null && targetId !== undefined ? String(targetId) : null);
}

module.exports = { sendVendorAssignmentEmail, sendQuotationNotificationEmail, notifyManager };
