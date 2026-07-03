const { Resend } = require('resend');
const db = require('../db');
const { recordAudit } = require('../middleware/audit');
const { toIST } = require('../utils');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

let resend = null;
function getResend() {
  if (resend) return resend;
  if (!process.env.RESEND_API_KEY) return null;
  resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

function layout(bodyHtml, ctaLabel, ctaUrl) {
  return `
  <div style="background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1E2B4A;max-width:560px;margin:0 auto;padding:0;">
    <div style="background:#0B2D71;padding:20px 28px;border-radius:8px 8px 0 0;">
      <p style="font-size:15px;font-weight:700;color:#ffffff;margin:0;">Shivtek Spechemi</p>
      <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:2px 0 0;">Vendor Procurement Portal</p>
    </div>
    <div style="padding:28px 28px 24px;">
      ${bodyHtml}
      ${ctaUrl ? `
      <div style="margin:28px 0 8px;">
        <a href="${ctaUrl}" style="display:inline-block;background:#1A56D6;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;">${ctaLabel}</a>
      </div>` : ''}
      <p style="font-size:12px;color:#8a8a8e;margin-top:28px;border-top:1px solid #eee;padding-top:16px;">
        This is an automated message from Shivtek Spechemi Industries Ltd. Please do not reply to this email.
      </p>
    </div>
  </div>`;
}

async function sendMail({ to, subject, html, text, attachments, context }) {
  const client = getResend();
  if (!client) {
    console.warn(`[email] SKIPPED — RESEND_API_KEY not configured. Would have sent "${subject}" to ${to}`);
    recordAudit({
      actionType: 'email_failed',
      performedBy: 'system',
      targetType: context?.targetType || 'email',
      targetId: context?.targetId || null,
      details: { to, subject, reason: 'RESEND_API_KEY not configured' },
      ip: null,
    });
    return false;
  }

  console.log(`[email] Sending "${subject}" to ${to} ...`);
  try {
    const { error } = await client.emails.send({
      from: 'Shivtek Spechemi <hello@cardinaldigitalsolutions.in>',
      replyTo: 'hello@cardinaldigitalsolutions.in',
      to: [to],
      subject,
      html,
      text: text || undefined,
      attachments: attachments || undefined,
    });
    if (error) throw new Error(error.message);
    console.log(`[email] Sent OK → ${to}`);
    return true;
  } catch (err) {
    console.error(`[email] FAILED → ${to} | ${err.message}`);
    recordAudit({
      actionType: 'email_failed',
      performedBy: 'system',
      targetType: context?.targetType || 'email',
      targetId: context?.targetId || null,
      details: { to, subject, reason: err.message },
      ip: null,
    });
    return false;
  }
}

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

  const text = [
    `Hello ${vendor.contact_person},`,
    ``,
    `${vendor.company_name} has been assigned to submit a quotation for the following requirement:`,
    ``,
    `Item: ${requirement.title}`,
    `Quantity: ${requirement.quantity} ${requirement.unit}`,
    requirement.grade ? `Grade: ${requirement.grade}` : null,
    `Deadline: ${toIST(requirement.deadline)}`,
    ``,
    `View and submit your quotation here: ${portalUrl}`,
    ``,
    `This is an automated message from Shivtek Spechemi Industries Ltd. Please do not reply to this email.`,
  ].filter(Boolean).join('\n');

  await sendMail({
    to: vendor.email,
    subject: `New requirement assigned: ${requirement.title}`,
    html,
    text,
    context: { targetType: 'vendor', targetId: vendor.id },
  });
}

async function sendQuotationNotificationEmail({ manager, vendor, requirement, amount, revised = false, hideAmount = false }) {
  const amountHtml = hideAmount
    ? 'Hidden until at least 2 bids are received'
    : `₹${Number(amount).toLocaleString('en-IN')}`;
  const amountSubject = hideAmount
    ? 'amount hidden until 2 bids received'
    : `₹${Number(amount).toLocaleString('en-IN')}`;

  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 16px;">${revised ? 'Quotation revised' : 'New quotation received'}</h1>
    <p style="font-size:14px;line-height:1.6;margin:0;">
      ${revised ? 'Quotation revised' : 'Quotation received'} from <strong>${vendor.company_name}</strong> for
      <strong>${requirement.title}</strong> — ${amountHtml}.
    </p>
  `, 'View Requirement', `${FRONTEND_URL}/dashboard/requirements/${requirement.id}`);

  const text = [
    `${revised ? 'Quotation revised' : 'Quotation received'} from ${vendor.company_name} for ${requirement.title} — ${hideAmount ? 'amount hidden until at least 2 bids are received' : `Rs. ${Number(amount).toLocaleString('en-IN')}`}.`,
    ``,
    `View the requirement here: ${FRONTEND_URL}/dashboard/requirements/${requirement.id}`,
    ``,
    `This is an automated message from Shivtek Spechemi Industries Ltd. Please do not reply to this email.`,
  ].join('\n');

  await sendMail({
    to: manager.email,
    subject: `${revised ? 'Quotation revised' : 'Quotation received'} from ${vendor.company_name} for ${requirement.title} — ${amountSubject}`,
    html,
    text,
    context: { targetType: 'requirement', targetId: requirement.id },
  });
}

// Sends the winning vendor their purchase order with the branded PO PDF attached.
async function sendPurchaseOrderEmail({ po, pdfBuffer }) {
  const html = layout(`
    <h1 style="font-size:20px;margin:0 0 16px;">Purchase Order ${po.po_number}</h1>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      Hello ${po.vendor_contact}, congratulations — <strong>${po.vendor_name}</strong> has been awarded the following requirement.
      The official purchase order is attached as a PDF.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 8px;">
      <tr><td style="padding:6px 0;color:#8a8a8e;width:130px;">PO Number</td><td style="padding:6px 0;font-weight:600;">${po.po_number}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8a8e;">Item</td><td style="padding:6px 0;font-weight:600;">${po.requirement_title}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8a8e;">Quantity</td><td style="padding:6px 0;">${po.quantity} ${po.unit}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8a8e;">Total Value</td><td style="padding:6px 0;">₹${Number(po.total_amount).toLocaleString('en-IN')}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8a8e;">Payment Terms</td><td style="padding:6px 0;">${po.payment_terms}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8a8e;">Delivery</td><td style="padding:6px 0;">${po.lead_time_days} days from PO date</td></tr>
    </table>
    <p style="font-size:14px;line-height:1.6;margin:16px 0 0;">
      Please acknowledge receipt of this purchase order by replying to your usual contact at Shivtek Spechemi.
    </p>
  `, null, null);

  const text = [
    `Hello ${po.vendor_contact},`,
    ``,
    `Congratulations — ${po.vendor_name} has been awarded the following requirement. The official purchase order is attached as a PDF.`,
    ``,
    `PO Number: ${po.po_number}`,
    `Item: ${po.requirement_title}`,
    `Quantity: ${po.quantity} ${po.unit}`,
    `Total Value: Rs. ${Number(po.total_amount).toLocaleString('en-IN')}`,
    `Payment Terms: ${po.payment_terms}`,
    `Delivery: ${po.lead_time_days} days from PO date`,
    ``,
    `This is an automated message from Shivtek Spechemi Industries Ltd. Please do not reply to this email.`,
  ].join('\n');

  return sendMail({
    to: po.vendor_email,
    subject: `Purchase Order ${po.po_number} — ${po.requirement_title}`,
    html,
    text,
    attachments: [{ filename: `${po.po_number}.pdf`, content: pdfBuffer }],
    context: { targetType: 'purchase_order', targetId: po.id },
  });
}

function notifyManager({ managerId, title, body, targetType = null, targetId = null }) {
  db.prepare(`
    INSERT INTO notifications (manager_id, title, body, target_type, target_id) VALUES (?, ?, ?, ?, ?)
  `).run(managerId, title, body, targetType, targetId !== null && targetId !== undefined ? String(targetId) : null);
}

module.exports = { sendVendorAssignmentEmail, sendQuotationNotificationEmail, sendPurchaseOrderEmail, notifyManager };
