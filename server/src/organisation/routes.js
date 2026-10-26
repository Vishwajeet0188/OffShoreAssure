/* Buyer organisation: members and join requests. The owner approves or rejects people who ask to join. */
import { Router } from 'express';
import { query } from '../db.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { requireRole } from '../auth/session.js';
import { sendNotice } from '../mailer.js';

export const organisationRouter = Router();
organisationRouter.use(requireRole('buyer'));

const appLink = path => config.frontendOrigin.split(',')[0].trim() + path;
const member = r => ({
  userId: r.user_id,
  email: r.email,
  fullName: r.full_name,
  jobRole: r.job_role,
  membership: r.membership,
  status: r.status,
  registeredAt: r.created_at,
  lastLoginAt: r.last_login_at,
  decidedAt: r.membership_decided_at,
});

/* Emails the owners when someone asks to join. Failures are logged, never block the request. */
export async function notifyJoinRequest(orgId, orgName, email, fullName) {
  const owners = (
    await query(
      `SELECT u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.organisation_id = $1 AND p.membership = 'owner' AND u.status = 'active'`,
      [orgId],
    )
  ).rows;
  for (const o of owners) {
    try {
      await sendNotice(
        o.email,
        `${fullName || email} wants to join ${orgName} on OffshoreAssure`,
        [
          `Hello ${o.full_name || ''},`.replace(' ,', ','),
          `${fullName || ''} (${email}) has registered and named ${orgName} as their organisation.`,
          'They cannot see your organisation’s requirements or assessments until you approve them.',
        ],
        {
          kicker: 'ORGANISATION',
          title: 'New request to join your organisation',
          action: { label: 'Review the request', url: appLink('/organisation') },
        },
      );
    } catch (e) {
      console.error('[EMAIL] join request notice failed:', e.message);
    }
  }
}

/* Approve or reject a pending member. Used by organisation owners and by OffshoreAssure admins. */
export async function decideMembership(req, orgId, userId, action) {
  const t = (
    await query(
      `SELECT p.user_id, p.membership, p.organisation_name, u.email, p.full_name FROM user_profiles p JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1 AND p.organisation_id = $2`,
      [userId, orgId],
    ).catch(() => ({ rows: [] }))
  ).rows[0];
  if (!t) return [404, { error: 'not_found', message: 'Person not found in this organisation.' }];
  if (t.membership !== 'pending')
    return [400, { error: 'not_pending', message: 'Only pending requests can be approved or rejected.' }];
  const to = action === 'approve' ? 'member' : 'rejected';
  await query(
    'UPDATE user_profiles SET membership = $2, membership_decided_by = $3, membership_decided_at = now() WHERE user_id = $1',
    [userId, to, req.user.id],
  );
  await audit(req, action === 'approve' ? 'organisation.member_approved' : 'organisation.member_rejected', {
    detail: { organisationId: orgId, organisationName: t.organisation_name, userId, email: t.email },
  });
  try {
    await sendNotice(
      t.email,
      action === 'approve'
        ? `You have joined ${t.organisation_name} on OffshoreAssure`
        : `Your request to join ${t.organisation_name}`,
      action === 'approve'
        ? [
            `Hello ${t.full_name || ''},`.replace(' ,', ','),
            `Your request to join ${t.organisation_name} has been approved. You can now see and create its requirements and assessments.`,
          ]
        : [
            `Hello ${t.full_name || ''},`.replace(' ,', ','),
            `Your request to join ${t.organisation_name} was not approved.`,
            'If this is a mistake, contact your organisation’s owner, or change the organisation in your profile.',
          ],
      {
        kicker: 'ORGANISATION',
        title: action === 'approve' ? 'Request approved' : 'Request not approved',
        action: { label: 'Open OffshoreAssure', url: appLink('/dashboard') },
      },
    );
  } catch (e) {
    console.error('[EMAIL] membership decision notice failed:', e.message);
  }
  return [200, { userId, membership: to }];
}

organisationRouter.get('/', async (req, res) => {
  const me = (
    await query(
      `SELECT p.organisation_id, p.membership, o.name, o.sector, o.created_at FROM user_profiles p JOIN organisations o ON o.id = p.organisation_id WHERE p.user_id = $1`,
      [req.user.id],
    )
  ).rows[0];
  if (!me) return res.json({ organisation: null, membership: null, members: [] });
  const active = ['owner', 'member'].includes(me.membership);
  const members = active
    ? (
        await query(
          `SELECT p.user_id, p.full_name, p.job_role, p.membership, p.membership_decided_at, u.email, u.status, u.created_at, u.last_login_at
       FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE p.organisation_id = $1 AND p.membership <> 'rejected'
      ORDER BY (p.membership = 'pending') DESC, (p.membership = 'owner') DESC, u.created_at`,
          [me.organisation_id],
        )
      ).rows.map(member)
    : [];
  res.json({
    organisation: { id: me.organisation_id, name: me.name, sector: me.sector, createdAt: me.created_at },
    membership: me.membership,
    members,
  });
});

organisationRouter.patch('/members/:userId', async (req, res) => {
  const action = req.body?.action;
  if (!['approve', 'reject'].includes(action))
    return res.status(400).json({ error: 'validation', message: 'Choose approve or reject.' });
  const me = (
    await query('SELECT organisation_id, membership FROM user_profiles WHERE user_id = $1', [req.user.id])
  ).rows[0];
  if (!me || me.membership !== 'owner')
    return res
      .status(403)
      .json({ error: 'not_owner', message: 'Only the organisation’s owner can approve or reject requests.' });
  const [status, body] = await decideMembership(req, me.organisation_id, req.params.userId, action);
  res.status(status).json(body);
});
