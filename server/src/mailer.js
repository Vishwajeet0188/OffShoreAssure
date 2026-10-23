import nodemailer from 'nodemailer';
import { config } from './config.js';

let transport = null;
if (config.smtp.host) {
  transport = nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
  });
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Wording for each code email. */
export const EMAIL_TEMPLATES = {
  register: {
    subject: 'Verify your email | OffshoreAssure',
    preheader: 'Your OffshoreAssure verification code',
    kicker: 'ACCOUNT VERIFICATION',
    title: 'Verify your email address',
    message: 'Welcome to OffshoreAssure. Enter the verification code below to complete your account registration.',
    label: 'YOUR VERIFICATION CODE',
    footer: 'If you did not create an account, you can safely ignore this email.'
  },
  reset: {
    subject: 'Password reset code | OffshoreAssure',
    preheader: 'Your OffshoreAssure password reset code',
    kicker: 'ACCOUNT SECURITY',
    title: 'Reset your password',
    message: 'We received a request to reset your OffshoreAssure password. Use the code below to continue.',
    label: 'YOUR PASSWORD RESET CODE',
    footer: 'If you did not request a password reset, you can ignore this email. Your password will remain unchanged.'
  }
};

/* Shared branded layout (table-based with inline styles, so it renders in Gmail, Outlook and mobile mail apps). */
function layout({ preheader, kicker, body }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>OffshoreAssure</title>
</head>
<body style="margin:0;padding:0;background:#f4f2f7;font-family:Arial,Helvetica,sans-serif;color:#271a38;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f2f7;">
    <tr>
      <td align="center" style="padding:36px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:540px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ebe6ef;">

          <!-- Brand header -->
          <tr>
            <td style="background:#271a38;padding:28px 32px 24px;text-align:center;">
              <div style="font-size:24px;font-weight:bold;letter-spacing:0.5px;color:#ffffff;line-height:1.2;">Offshore<span style="color:#e9a091;">Assure</span></div>
              <div style="margin-top:8px;font-size:11px;letter-spacing:2px;color:#d8d0e0;">${esc(kicker)}</div>
            </td>
          </tr>
          <tr><td style="height:4px;line-height:4px;font-size:0;background:#b95f50;">&nbsp;</td></tr>

          <!-- Main content -->
          <tr>
            <td style="padding:36px 32px 28px;">
              ${body}
              <p style="margin:28px 0 0;font-size:14px;line-height:1.8;color:#62596b;">
                Best regards,<br>
                <strong style="color:#271a38;">The OffshoreAssure Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#faf9fb;border-top:1px solid #eeeaf1;padding:20px 28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#766a7e;">&copy; ${year} OffshoreAssure &middot; Assurance for the connected world</p>
              <p style="margin:0;font-size:11px;color:#9b92a2;">This is an automated email. Please do not reply.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* Verification / password-reset code email. Returns { subject, text, html }. */
export function renderCodeEmail(code, purpose, minutes = config.codeTtlMinutes) {
  const t = EMAIL_TEMPLATES[purpose];
  if (!t) throw new Error(`Unsupported email purpose: ${purpose}`);
  const c = esc(code);
  const body = `
              <h1 style="margin:0 0 16px;font-size:25px;line-height:1.3;color:#271a38;font-weight:bold;">${esc(t.title)}</h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.8;color:#62596b;">Hello,</p>
              <p style="margin:0 0 26px;font-size:15px;line-height:1.8;color:#62596b;">${esc(t.message)}</p>

              <!-- Code -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#faf6f5;border:1px solid #f0e2df;border-radius:10px;padding:24px 12px;text-align:center;">
                    <p style="margin:0 0 14px;font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#766a7e;">${esc(t.label)}</p>
                    <p style="margin:0;font-size:34px;line-height:1.2;font-weight:bold;letter-spacing:9px;color:#b95f50;font-family:'Courier New',Courier,monospace;">${c}</p>
                    <p style="margin:16px 0 0;font-size:13px;color:#766a7e;">Expires in ${minutes} minutes</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 18px;font-size:13px;line-height:1.8;color:#62596b;">
                <strong style="color:#271a38;">Security tip:</strong> never share this code with anyone. OffshoreAssure will never ask you for it.
              </p>
              <p style="margin:0;font-size:13px;line-height:1.8;color:#766a7e;">${esc(t.footer)}</p>`;
  const text = `${t.title}

Hello,

${t.message}

${t.label}: ${code}

This code expires in ${minutes} minutes. Never share it with anyone; OffshoreAssure will never ask you for it.

${t.footer}

Best regards,
The OffshoreAssure Team`;
  return { subject: t.subject, text, html: layout({ preheader: `${t.preheader}: ${code}`, kicker: t.kicker, body }) };
}

/* Sends a verification code. Without SMTP settings (development) the code is printed in the server console. */
export async function sendCode(email, code, purpose) {
  const m = renderCodeEmail(code, purpose);
  if (!transport) {
    console.log(`[DEV EMAIL] ${purpose} code for ${email}: ${code}`);
    return { delivered: false };
  }
  await transport.sendMail({ from: config.smtp.from, to: email, subject: m.subject, text: m.text, html: m.html });
  return { delivered: true };
}

/* Notice email in the same branded layout (e.g. "you have been added as an admin").
   lines: paragraphs; the first is used as the greeting. Optional action: { label, url }. */
export function renderNotice(subject, lines, { kicker = 'ACCOUNT NOTICE', title = subject, action } = {}) {
  const body = `
              <h1 style="margin:0 0 16px;font-size:25px;line-height:1.3;color:#271a38;font-weight:bold;">${esc(title)}</h1>
              ${lines.map(l => `<p style="margin:0 0 14px;font-size:15px;line-height:1.8;color:#62596b;">${esc(l)}</p>`).join('\n              ')}
              ${action ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:10px 0 6px;"><tr>
                <td style="background:#b95f50;border-radius:8px;"><a href="${esc(action.url)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">${esc(action.label)}</a></td>
              </tr></table>
              <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#9b92a2;">Or copy this link: ${esc(action.url)}</p>` : ''}`;
  const text = [title, ...lines, action ? `${action.label}: ${action.url}` : null, 'Best regards,\nThe OffshoreAssure Team'].filter(Boolean).join('\n\n');
  return { subject, text, html: layout({ preheader: lines[1] || title, kicker, body }) };
}

export async function sendNotice(email, subject, lines, opts) {
  const m = renderNotice(subject, lines, opts);
  if (!transport) { console.log(`[DEV EMAIL] ${subject} → ${email}\n${m.text}`); return { delivered: false }; }
  await transport.sendMail({ from: config.smtp.from, to: email, subject: m.subject, text: m.text, html: m.html });
  return { delivered: true };
}
