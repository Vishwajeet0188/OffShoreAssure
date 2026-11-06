/*
 * Support tickets (Contact page).
 *
 * Public  /api/support
 *   GET   /tickets/form         categories and, when signed in, who is asking
 *   POST  /tickets              raise a ticket (signed in or not) → ticket number
 *   GET   /tickets              the signed-in person's own tickets with the team's remarks
 *   POST  /tickets/lookup       a visitor checks a ticket with its number and email
 *
 * Admin   /api/admin/tickets
 *   GET   /                     all tickets (?status=OPEN|IN_PROGRESS|CLOSED, ?search=)
 *   GET   /:number              one ticket with its history
 *   POST  /:number/remarks      add a remark and/or change the status (closing needs a remark)
 *
 * Remarks and status changes are append-only. The person who raised the ticket is
 * emailed the ticket number, and again when the team adds a remark.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { requireAdmin } from '../auth/session.js';
import { sendNotice } from '../mailer.js';

export const TICKET_CATEGORIES = [
  'General question',
  'Help using the platform',
  'An assessment',
  'Account and sign-in',
  'Report a problem',
  'Something else',
];
export const TICKET_STATUS = {
  OPEN: { label: 'Open' },
  IN_PROGRESS: { label: 'In progress' },
  CLOSED: { label: 'Closed' },
};

const appLink = p => config.frontendOrigin.split(',')[0].trim() + p;
const bad = (res, message, fields) =>
  res.status(400).json({ error: 'validation', message, ...(fields ? { fields } : {}) });
const fieldErrors = issues => Object.fromEntries(issues.map(issue => [issue.path[0], issue.message]));

const limit = (max, message) =>
  config.rateLimit
    ? rateLimit({
        windowMs: 60 * 60 * 1000,
        limit: max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'rate_limited', message },
      })
    : (_req, _res, next) => next();

/* ---------- Shapes ---------- */

const shapeTicket = (t, events = [], { forAdmin = false } = {}) => ({
  number: t.number,
  status: t.status,
  statusLabel: TICKET_STATUS[t.status].label,
  category: t.category,
  subject: t.subject,
  message: t.message,
  reference: t.reference,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
  closedAt: t.closed_at,
  // What the team wrote back, and when the status changed. Admin names are not shown to the requester.
  history: events.map(e => ({
    at: e.at,
    remark: e.remark,
    fromStatus: e.from_status,
    toStatus: e.to_status,
    ...(forAdmin ? { by: e.author_email || null } : {}),
  })),
  ...(forAdmin
    ? {
        id: t.id,
        role: t.role,
        name: t.name,
        email: t.email,
        phone: t.phone,
        organisation: t.organisation,
        signedIn: !!t.user_id,
      }
    : {}),
});

async function eventsFor(run, ticketIds) {
  if (!ticketIds.length) return [];
  const { rows } = await run(
    `SELECT e.*, u.email AS author_email FROM support_ticket_events e LEFT JOIN users u ON u.id = e.author_id
      WHERE e.ticket_id = ANY($1) ORDER BY e.id`,
    [ticketIds],
  );
  return rows;
}

async function ticketsWithHistory(run, tickets, opts) {
  const events = await eventsFor(
    run,
    tickets.map(t => t.id),
  );
  return tickets.map(t =>
    shapeTicket(
      t,
      events.filter(e => e.ticket_id === t.id),
      opts,
    ),
  );
}

/* ---------- Public ---------- */

export const supportRouter = Router();

const ticketSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+()\-\s]*$/, 'Use digits, spaces and + ( ) - only.')
    .optional()
    .or(z.literal('')),
  organisation: z.string().trim().max(160).optional().or(z.literal('')),
  category: z.enum(TICKET_CATEGORIES, { message: 'Choose what your query is about.' }),
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .max(40)
    .regex(/^(OA-[A-Z]{2}-\d{4}-\d{6})?$/, 'An Assessment ID looks like OA-UK-2026-000001.')
    .optional()
    .or(z.literal('')),
  subject: z
    .string()
    .trim()
    .min(4, 'Enter a subject (at least 4 characters).')
    .max(150, 'Use at most 150 characters.'),
  message: z
    .string()
    .trim()
    .min(10, 'Tell us a little more (at least 10 characters).')
    .max(4000, 'Use at most 4,000 characters.'),
  website: z.string().optional(), // left empty by people; filled in by spam robots
});

supportRouter.get('/tickets/form', async (req, res) => {
  let me = null;
  if (req.user) {
    const { rows } = await query(
      `SELECT p.full_name, o.name AS organisation FROM user_profiles p LEFT JOIN organisations o ON o.id = p.organisation_id WHERE p.user_id = $1`,
      [req.user.id],
    );
    me = {
      email: req.user.email,
      role: req.user.role,
      name: rows[0]?.full_name || '',
      organisation: rows[0]?.organisation || '',
    };
  }
  res.json({ categories: TICKET_CATEGORIES, me, contactEmail: process.env.SUPPORT_EMAIL || null });
});

supportRouter.post(
  '/tickets',
  limit(10, 'Too many tickets from here. Please try again later.'),
  async (req, res) => {
    const p = ticketSchema.safeParse(req.body || {});
    if (!p.success) return bad(res, 'Check the highlighted fields.', fieldErrors(p.error.issues));
    const d = p.data;
    if (d.website) return res.status(201).json({ ticket: null }); // a robot: say nothing useful

    // Signed in: the account decides who is asking, not the form.
    const email = req.user ? req.user.email : d.email;
    const role = req.user ? req.user.role : 'visitor';

    const ticket = await tx(async db => {
      const {
        rows: [n],
      } = await db.query(`SELECT nextval('support_ticket_seq') AS n`);
      const number = `OA-TKT-${new Date().getUTCFullYear()}-${String(n.n).padStart(6, '0')}`;
      const {
        rows: [t],
      } = await db.query(
        `INSERT INTO support_tickets (number, user_id, role, name, email, phone, organisation, category, reference, subject, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          number,
          req.user?.id || null,
          role,
          d.name,
          email,
          d.phone || null,
          d.organisation || null,
          d.category,
          d.reference || null,
          d.subject,
          d.message,
        ],
      );
      await audit(req, 'support.ticket_created', {
        db,
        stage: 'support',
        ref: number,
        detail: { number, role, category: d.category, reference: d.reference || null },
      });
      return t;
    });

    try {
      await sendNotice(
        email,
        `Your ticket ${ticket.number}: ${ticket.subject}`,
        [
          `Hello ${ticket.name},`,
          `Thank you for contacting OffshoreAssure. Your ticket number is ${ticket.number}.`,
          'Our team will reply on the Contact page under your ticket, and we will email you when they do.',
          `Your message: "${ticket.message.length > 300 ? ticket.message.slice(0, 297) + '…' : ticket.message}"`,
        ],
        {
          kicker: 'SUPPORT',
          title: `Ticket ${ticket.number} received`,
          action: { label: 'View your ticket', url: appLink(`/contact?ticket=${ticket.number}`) },
        },
      );
    } catch (error) {
      console.error('[EMAIL] ticket confirmation failed:', error.message);
    }

    res.status(201).json({ ticket: shapeTicket(ticket) });
  },
);

supportRouter.get('/tickets', async (req, res) => {
  if (!req.user) return res.json({ tickets: [] });
  const { rows } = await query(
    'SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
    [req.user.id],
  );
  res.json({ tickets: await ticketsWithHistory(query, rows) });
});

const lookupSchema = z.object({
  number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^OA-TKT-\d{4}-\d{6}$/, 'A ticket number looks like OA-TKT-2026-000001.'),
  email: z.string().trim().toLowerCase().email('Enter the email you used.'),
});

supportRouter.post(
  '/tickets/lookup',
  limit(30, 'Too many look-ups. Please try again later.'),
  async (req, res) => {
    const p = lookupSchema.safeParse(req.body || {});
    if (!p.success) return bad(res, p.error.issues[0].message, fieldErrors(p.error.issues));
    const { rows } = await query('SELECT * FROM support_tickets WHERE number = $1 AND lower(email) = $2', [
      p.data.number,
      p.data.email,
    ]);
    // The same answer whether the number or the email is wrong, so nobody can guess other people's tickets.
    if (!rows[0])
      return res
        .status(404)
        .json({ error: 'not_found', message: 'No ticket matches that number and email.' });
    res.json({ ticket: (await ticketsWithHistory(query, rows))[0] });
  },
);

/* ---------- Admin ---------- */

export const adminTicketsRouter = Router();

adminTicketsRouter.get('/tickets', requireAdmin, async (req, res) => {
  const status = Object.keys(TICKET_STATUS).includes(req.query.status) ? req.query.status : null;
  const search = String(req.query.search || '')
    .trim()
    .slice(0, 100);
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(
      `(number ILIKE $${params.length} OR subject ILIKE $${params.length} OR email ILIKE $${params.length} OR name ILIKE $${params.length} OR coalesce(organisation, '') ILIKE $${params.length})`,
    );
  }
  const { rows } = await query(
    `SELECT t.*, (SELECT count(*)::int FROM support_ticket_events e WHERE e.ticket_id = t.id AND e.remark IS NOT NULL) AS remarks
       FROM support_tickets t ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END, created_at DESC LIMIT 500`,
    params,
  );
  const { rows: counts } = await query(
    'SELECT status, count(*)::int AS n FROM support_tickets GROUP BY status',
  );
  res.json({
    tickets: rows.map(t => ({
      number: t.number,
      status: t.status,
      statusLabel: TICKET_STATUS[t.status].label,
      role: t.role,
      name: t.name,
      email: t.email,
      organisation: t.organisation,
      category: t.category,
      subject: t.subject,
      reference: t.reference,
      remarks: t.remarks,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
    counts: Object.fromEntries(
      Object.keys(TICKET_STATUS).map(s => [s, counts.find(c => c.status === s)?.n || 0]),
    ),
    statuses: TICKET_STATUS,
  });
});

adminTicketsRouter.get('/tickets/:number', requireAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM support_tickets WHERE number = $1', [req.params.number]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found', message: 'Ticket not found.' });
  res.json({
    ticket: (await ticketsWithHistory(query, rows, { forAdmin: true }))[0],
    statuses: TICKET_STATUS,
  });
});

const remarkSchema = z.object({
  remark: z.string().trim().max(4000, 'Use at most 4,000 characters.').optional().or(z.literal('')),
  status: z.enum(Object.keys(TICKET_STATUS)).optional(),
});

adminTicketsRouter.post('/tickets/:number/remarks', requireAdmin, async (req, res) => {
  const p = remarkSchema.safeParse(req.body || {});
  if (!p.success) return bad(res, p.error.issues[0].message);
  const remark = p.data.remark || '';

  const out = await tx(async db => {
    const t = (
      await db.query('SELECT * FROM support_tickets WHERE number = $1 FOR UPDATE', [req.params.number])
    ).rows[0];
    if (!t) return [404, { error: 'not_found', message: 'Ticket not found.' }];
    const to = p.data.status && p.data.status !== t.status ? p.data.status : null;
    if (!remark && !to)
      return [400, { error: 'validation', message: 'Write a remark or change the status.' }];
    if (remark && remark.length < 5)
      return [400, { error: 'validation', message: 'Write a remark of at least 5 characters.' }];
    if (to === 'CLOSED' && !remark)
      return [
        400,
        {
          error: 'validation',
          message: 'Add a remark that explains how the query was resolved before closing the ticket.',
        },
      ];

    await db.query(
      'INSERT INTO support_ticket_events (ticket_id, author_id, remark, from_status, to_status) VALUES ($1, $2, $3, $4, $5)',
      [t.id, req.user.id, remark || null, to ? t.status : null, to],
    );
    await db.query(
      `UPDATE support_tickets SET updated_at = now(), status = coalesce($2, status),
      closed_at = CASE WHEN $2 = 'CLOSED' THEN now() WHEN $2 IS NOT NULL THEN NULL ELSE closed_at END WHERE id = $1`,
      [t.id, to],
    );
    await audit(req, to ? 'admin.ticket_status' : 'admin.ticket_remark', {
      db,
      stage: 'support',
      ref: t.number,
      detail: { number: t.number, from: to ? t.status : null, to, remark: !!remark },
    });
    const fresh = (await db.query('SELECT * FROM support_tickets WHERE id = $1', [t.id])).rows;
    return [
      200,
      {
        ticket: (await ticketsWithHistory(db.query.bind(db), fresh, { forAdmin: true }))[0],
        previous: t,
        to,
      },
    ];
  });
  if (out[0] !== 200) return res.status(out[0]).json(out[1]);

  const { ticket, to } = out[1];
  try {
    const lines = [
      `Hello ${ticket.name},`,
      `There is an update on your ticket ${ticket.number} ("${ticket.subject}").`,
    ];
    if (remark) lines.push(`Our team wrote: "${remark}"`);
    if (to) lines.push(`Status: ${TICKET_STATUS[to].label}.`);
    await sendNotice(ticket.email, `Update on your ticket ${ticket.number}`, lines, {
      kicker: 'SUPPORT',
      title: to === 'CLOSED' ? 'Your ticket is closed' : 'Your ticket has an update',
      action: { label: 'View your ticket', url: appLink(`/contact?ticket=${ticket.number}`) },
    });
  } catch (error) {
    console.error('[EMAIL] ticket update failed:', error.message);
  }

  res.json({ ticket, statuses: TICKET_STATUS });
});
