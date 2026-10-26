/* Support tickets: Contact page and admin console. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://oa:oa@localhost:5432/offshoreassure_test';
process.env.DEV_SHOW_CODES = 'true';
process.env.RATE_LIMIT = 'false';
process.env.RESEND_COOLDOWN_SECONDS = '0';
process.env.NODE_ENV = 'test';
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-support-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { EXAMPLE } = await import('./fixtures.js');
const bcrypt = (await import('bcryptjs')).default;

let server, base;
function client() {
  let cookie = '';
  return async (method, p, body, raw) => {
    const headers = { ...(cookie ? { cookie } : {}), ...(raw ? { 'content-type': raw.type } : { 'content-type': 'application/json' }) };
    const r = await fetch(base + p, { method, headers, body: raw ? raw.data : body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
}
async function signUp(email, role) {
  const c = client(); const r = await c('POST', '/auth/register', { email, password: 'Secure1234', role });
  await c('POST', '/auth/verify', { email, code: r.body.devCode }); return c;
}
let admin, buyer, vendor, other, ref, vendorId;

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: false });
  server = createApp().listen(0); base = `http://localhost:${server.address().port}/api`;
  await pool.query(`INSERT INTO users (email, password_hash, status, is_admin, role, email_verified_at) VALUES ('admin@oa.example', $1, 'active', true, 'admin', now())`, [await bcrypt.hash('Admin12345', 4)]);
  admin = client(); await admin('POST', '/auth/login', { email: 'admin@oa.example', password: 'Admin12345' });
  buyer = await signUp('sarah@ukcompany.example', 'buyer');
  await buyer('PUT', '/me/profile', { fullName: 'Sarah Williams', organisationName: 'UK Company Ltd', sector: 'Financial Services', jobRole: 'Compliance Manager' });
  vendor = await signUp('anna@krakow.example', 'vendor');
  await vendor('PUT', '/me/profile', { fullName: 'Anna K', jobRole: 'Delivery Manager', organisationName: 'Krakow IT', registrationNumber: 'KRS 1', country: 'PL', services: ['IT Support'], deliveryCountries: ['PL', 'IN', 'BR', 'PH'] });
  vendorId = (await pool.query(`SELECT id FROM organisations WHERE name = 'Krakow IT'`)).rows[0].id;
  await admin('PATCH', '/admin/vendors/' + vendorId, { status: 'approved' });
  other = await signUp('tom@otherbuyer.example', 'buyer');
  await other('PUT', '/me/profile', { fullName: 'Tom', organisationName: 'Other Buyer Ltd', sector: 'Retail', jobRole: 'Compliance Manager' });
});
after(async () => { server.close(); await pool.end(); });


const visitor = client();
const TICKET = { name: 'Priya Shah', email: 'priya@visitor.example', phone: '07123 456789', organisation: 'Visitor Ltd', category: 'General question',
  subject: 'Do you cover HR outsourcing?', message: 'We plan to move payroll and HR to a team in Poland. Is that covered?' };
let visitorTicket, buyerTicket;

test('a visitor raises a ticket and gets a ticket number; the form is checked first', async () => {
  let r = await visitor('GET', '/support/tickets/form');
  assert.equal(r.status, 200); assert.ok(r.body.categories.includes('Report a problem')); assert.equal(r.body.me, null);
  r = await visitor('POST', '/support/tickets', { ...TICKET, email: 'not-an-email', message: 'short' });
  assert.equal(r.status, 400); assert.ok(r.body.fields.email && r.body.fields.message);
  r = await visitor('POST', '/support/tickets', { ...TICKET, reference: 'ABC' });
  assert.equal(r.status, 400); assert.ok(r.body.fields.reference);
  r = await visitor('POST', '/support/tickets', TICKET);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  visitorTicket = r.body.ticket;
  assert.match(visitorTicket.number, /^OA-TKT-\d{4}-\d{6}$/); assert.equal(visitorTicket.status, 'OPEN');
  assert.equal(visitorTicket.email, undefined, 'contact details are not echoed back');
  r = await visitor('POST', '/support/tickets', { ...TICKET, website: 'http://spam.example' });
  assert.equal(r.body.ticket, null, 'a robot filling the hidden field gets nothing');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM support_tickets')).rows[0].n, 1);
});

test('a visitor checks a ticket with its number and email only', async () => {
  let r = await visitor('POST', '/support/tickets/lookup', { number: visitorTicket.number, email: 'PRIYA@visitor.example' });
  assert.equal(r.status, 200); assert.equal(r.body.ticket.subject, TICKET.subject);
  r = await visitor('POST', '/support/tickets/lookup', { number: visitorTicket.number, email: 'someone@else.example' });
  assert.equal(r.status, 404);
  r = await visitor('POST', '/support/tickets/lookup', { number: 'TKT-1', email: 'priya@visitor.example' });
  assert.equal(r.status, 400);
  assert.deepEqual((await visitor('GET', '/support/tickets')).body.tickets, []);
});

test('signed-in buyers and vendors raise tickets from their account and see only their own', async () => {
  let r = await buyer('GET', '/support/tickets/form');
  assert.equal(r.body.me.email, 'sarah@ukcompany.example'); assert.equal(r.body.me.role, 'buyer'); assert.equal(r.body.me.organisation, 'UK Company Ltd');
  r = await buyer('POST', '/support/tickets', { ...TICKET, name: 'Sarah Williams', email: 'other@x.example', category: 'An assessment',
    reference: 'oa-uk-2026-000001', subject: 'Contract upload fails', message: 'The contract PDF upload says the file cannot be read.' });
  assert.equal(r.status, 201); buyerTicket = r.body.ticket;
  assert.equal(buyerTicket.reference, 'OA-UK-2026-000001');
  const row = (await pool.query('SELECT email, role, user_id FROM support_tickets WHERE number = $1', [buyerTicket.number])).rows[0];
  assert.equal(row.email, 'sarah@ukcompany.example', 'the account email, not the typed one'); assert.equal(row.role, 'buyer'); assert.ok(row.user_id);
  assert.equal((await vendor('POST', '/support/tickets', { ...TICKET, name: 'Anna K', subject: 'Profile verification', message: 'How long does verification take?' })).status, 201);
  const mine = (await buyer('GET', '/support/tickets')).body.tickets;
  assert.deepEqual(mine.map(t => t.number), [buyerTicket.number]);
  assert.equal((await vendor('GET', '/support/tickets')).body.tickets.length, 1);
  assert.equal((await other('GET', '/support/tickets')).body.tickets.length, 0);
});

test('admin sees every ticket, adds remarks and closes it; the requester sees the remark', async () => {
  let r = await admin('GET', '/admin/tickets');
  assert.equal(r.status, 200); assert.equal(r.body.tickets.length, 3); assert.equal(r.body.counts.OPEN, 3);
  assert.deepEqual(new Set(r.body.tickets.map(t => t.role)), new Set(['visitor', 'buyer', 'vendor']));
  assert.equal((await admin('GET', '/admin/tickets?search=contract')).body.tickets.length, 1);
  r = await admin('GET', `/admin/tickets/${buyerTicket.number}`);
  assert.equal(r.body.ticket.email, 'sarah@ukcompany.example'); assert.equal(r.body.ticket.role, 'buyer');
  assert.equal((await admin('POST', `/admin/tickets/${buyerTicket.number}/remarks`, {})).status, 400);
  assert.equal((await admin('POST', `/admin/tickets/${buyerTicket.number}/remarks`, { status: 'CLOSED' })).status, 400, 'closing needs a remark');
  r = await admin('POST', `/admin/tickets/${buyerTicket.number}/remarks`, { remark: 'We are looking at the PDF you uploaded.', status: 'IN_PROGRESS' });
  assert.equal(r.status, 200); assert.equal(r.body.ticket.status, 'IN_PROGRESS');
  r = await admin('POST', `/admin/tickets/${buyerTicket.number}/remarks`, { remark: 'Fixed: scanned PDFs need text. Please upload a text PDF or Word file.', status: 'CLOSED' });
  assert.equal(r.status, 200); assert.equal(r.body.ticket.status, 'CLOSED'); assert.ok(r.body.ticket.closedAt);
  const mine = (await buyer('GET', '/support/tickets')).body.tickets[0];
  assert.equal(mine.status, 'CLOSED'); assert.equal(mine.history.length, 2);
  assert.match(mine.history[1].remark, /scanned PDFs/); assert.equal(mine.history[1].by, undefined, 'admin names stay internal');
  assert.equal((await admin('GET', '/admin/tickets?status=CLOSED')).body.tickets.length, 1);
  await assert.rejects(pool.query('UPDATE support_ticket_events SET remark = $1', ['x']), /append-only/);
  assert.equal((await buyer('GET', '/admin/tickets')).status, 403);
  assert.equal((await vendor('POST', `/admin/tickets/${buyerTicket.number}/remarks`, { remark: 'Not allowed here.' })).status, 403);
  r = await visitor('POST', '/support/tickets/lookup', { number: visitorTicket.number, email: TICKET.email });
  assert.equal(r.body.ticket.history.length, 0);
});
