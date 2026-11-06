import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';

export const COOKIE = 'oa_session';

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: config.cookieSameSite,
  secure: config.cookieSecure,
  path: '/',
  maxAge: config.sessionHours * 3600 * 1000,
});

export function startSession(res, user) {
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(COOKIE, token, cookieOptions());
}

export function endSession(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE, opts);
}

/* Loads the signed-in user (if any) onto req.user. Inactive or deleted users are treated as signed out. */
export async function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const { sub } = jwt.verify(token, config.jwtSecret);
    const r = await query('SELECT id, email, status, is_admin, role FROM users WHERE id = $1', [sub]);
    const u = r.rows[0];
    if (u && u.status === 'active') req.user = { ...u, role: u.is_admin ? 'admin' : u.role };
  } catch {
    /* invalid or expired token: signed out */
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_signed_in', message: 'Please sign in.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_signed_in', message: 'Please sign in.' });
  if (!req.user.is_admin) return res.status(403).json({ error: 'forbidden', message: 'Admin access only.' });
  next();
}

/* Role guard: requireRole('buyer') / requireRole('vendor'). Admins use requireAdmin. */
export const requireRole = role => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'not_signed_in', message: 'Please sign in.' });
  if (req.user.role !== role)
    return res
      .status(403)
      .json({
        error: 'wrong_role',
        message: role === 'buyer' ? 'This area is for buyers.' : 'This area is for vendors.',
      });
  next();
};
