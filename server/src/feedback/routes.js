/*
 * Feedback from the public website.
 *
 * Only signed-in buyers and vendors can send feedback. The sender's name and
 * email come from their account, so they are not typed in the form. The
 * OffshoreAssure team reads every message in the admin console.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';

export const FEEDBACK_KINDS = ['feedback', 'question', 'problem', 'idea'];

const feedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS, { message: 'Choose what this is about.' }),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  message: z
    .string()
    .trim()
    .min(10, 'Write at least 10 characters.')
    .max(2000, 'Use at most 2,000 characters.'),
  page: z.string().trim().max(100).optional(),
  publicConsent: z.boolean().optional().default(false),
});

export const feedbackRouter = Router();

const sendLimit = config.rateLimit
  ? rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'rate_limited', message: 'Too many messages. Please try again later.' },
    })
  : (_req, _res, next) => next();

function requireBuyerOrVendor(req, res, next) {
  if (!req.user) {
    return res
      .status(401)
      .json({
        error: 'not_signed_in',
        message: 'Please register yourself first, then you can send feedback.',
      });
  }
  if (!['buyer', 'vendor'].includes(req.user.role)) {
    return res
      .status(403)
      .json({ error: 'wrong_role', message: 'Feedback can be sent from a buyer or vendor account.' });
  }
  next();
}

feedbackRouter.post('/', requireBuyerOrVendor, sendLimit, async (req, res) => {
  const parsed = feedbackSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map(issue => [issue.path[0], issue.message]));
    return res.status(400).json({ error: 'validation', message: 'Check the highlighted fields.', fields });
  }

  const feedback = parsed.data;
  const { rows } = await query('SELECT full_name FROM user_profiles WHERE user_id = $1', [req.user.id]);
  const senderName = rows[0]?.full_name || null;

  await query(
    `INSERT INTO feedback (kind, rating, message, name, email, user_id, page, public_consent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      feedback.kind,
      feedback.rating ?? null,
      feedback.message,
      senderName,
      req.user.email,
      req.user.id,
      feedback.page || null,
      feedback.publicConsent,
    ],
  );

  res
    .status(201)
    .json({ ok: true, message: 'Thank you. Your message has been sent to the OffshoreAssure team.' });
});

/* Public name for a review: the sender's name from their profile (they agreed to show it), never the email. */
export function displayName(name) {
  const n = String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
  return n ? n.slice(0, 60) : null;
}
const ROLE = { buyer: 'Buyer', vendor: 'Vendor' };

/* Published reviews for the home page (sender agreed + published by an admin). */
feedbackRouter.get('/public', async (_req, res) => {
  const rows = (
    await query(
      `SELECT f.id, f.rating, f.message, f.name, f.published_at, u.role, p.full_name
       FROM feedback f LEFT JOIN users u ON u.id = f.user_id LEFT JOIN user_profiles p ON p.user_id = f.user_id
      WHERE f.published AND f.public_consent ORDER BY f.published_at DESC LIMIT 30`,
    )
  ).rows;
  res.json({
    reviews: rows.map(r => ({
      id: r.id,
      rating: r.rating,
      message: r.message,
      name: displayName(r.name || r.full_name) || 'OffshoreAssure user',
      role: ROLE[r.role] || 'Visitor',
      publishedAt: r.published_at,
    })),
  });
});
