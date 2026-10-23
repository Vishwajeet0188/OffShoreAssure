/* Public website feedback: anyone can send it (signed in or not); the OffshoreAssure team reads it in the admin console. */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';

export const FEEDBACK_KINDS = ['feedback', 'question', 'problem', 'idea'];
const schema = z.object({
  kind: z.enum(FEEDBACK_KINDS, { message: 'Choose what this is about.' }),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  message: z.string().trim().min(10, 'Write at least 10 characters.').max(2000, 'Use at most 2,000 characters.'),
  name: z.string().trim().max(100).optional().or(z.literal('')),
  email: z.string().trim().toLowerCase().max(254).email('Enter a valid email address, or leave it empty.').optional().or(z.literal('')),
  page: z.string().trim().max(100).optional(),
  publicConsent: z.boolean().optional().default(false),
  website: z.string().max(0).optional().or(z.literal(''))   // honeypot: must stay empty
});

export const feedbackRouter = Router();
const sendLimit = config.rateLimit ? rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many messages. Please try again later.' } }) : (_req, _res, next) => next();

feedbackRouter.post('/', sendLimit, async (req, res) => {
  const p = schema.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: 'validation', message: 'Check the highlighted fields.', fields: Object.fromEntries(p.error.issues.map(i => [i.path[0], i.message])) });
  const b = p.data;
  await query(`INSERT INTO feedback (kind, rating, message, name, email, user_id, page, public_consent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [b.kind, b.rating ?? null, b.message, b.name || null, b.email || req.user?.email || null, req.user?.id || null, b.page || null, b.publicConsent]);
  res.status(201).json({ ok: true, message: 'Thank you. Your message has been sent to the OffshoreAssure team.' });
});

/* Public name for a review: the name as the sender typed it (they agreed to show it), never the email. */
export function displayName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  return n ? n.slice(0, 60) : null;
}
const ROLE = { buyer: 'Buyer', vendor: 'Vendor' };

/* Published reviews for the home page (sender agreed + published by an admin). */
feedbackRouter.get('/public', async (_req, res) => {
  const rows = (await query(
    `SELECT f.id, f.rating, f.message, f.name, f.published_at, u.role, p.full_name
       FROM feedback f LEFT JOIN users u ON u.id = f.user_id LEFT JOIN user_profiles p ON p.user_id = f.user_id
      WHERE f.published AND f.public_consent ORDER BY f.published_at DESC LIMIT 30`)).rows;
  res.json({ reviews: rows.map(r => ({ id: r.id, rating: r.rating, message: r.message, name: displayName(r.name || r.full_name) || 'OffshoreAssure user',
    role: ROLE[r.role] || 'Visitor', publishedAt: r.published_at })) });
});
