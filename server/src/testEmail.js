/* Checks the SMTP settings in .env and sends one test code.
   Usage: npm run test:email -- you@example.com            (verification email)
          npm run test:email -- you@example.com reset      (password reset email) */
import nodemailer from 'nodemailer';
import { config } from './config.js';
import { sendCode } from './mailer.js';

const to = process.argv[2];
if (!to) { console.error('Usage: npm run test:email -- you@example.com'); process.exit(1); }
if (!config.smtp.host) { console.error('SMTP_HOST is empty in .env, so emails are not sent (codes are printed in the console instead).'); process.exit(1); }
const t = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined });
try {
  await t.verify();
  console.log(`SMTP login OK (${config.smtp.host}:${config.smtp.port}, secure=${config.smtp.secure})`);
  const purpose = process.argv[3] === 'reset' ? 'reset' : 'register';
  await sendCode(to, '123456', purpose);
  console.log(`Test ${purpose} email sent to`, to, '- check the inbox (and spam folder).');
} catch (e) {
  console.error('SMTP failed:', e.message);
  if (/self.signed|certificate/i.test(e.message)) console.error('Hint: certificate problem - check SMTP_HOST matches the mail server name.');
  if (/auth|535|534|login/i.test(e.message)) console.error('Hint: wrong SMTP_USER / SMTP_PASS (Gmail needs an App Password, not your normal password).');
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(e.message)) console.error('Hint: wrong SMTP_HOST or port, or the port is blocked. Try 465 with SMTP_SECURE=true, or 587 with SMTP_SECURE=false.');
  process.exit(1);
}
