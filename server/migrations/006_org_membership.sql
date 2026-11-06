-- Buyer organisation membership. The first person to register an organisation owns it; anyone else who names the
-- same organisation waits as "pending" until an owner (or an OffshoreAssure admin) approves them. This stops a stranger
-- from seeing an organisation's assessments just by typing its name.
ALTER TABLE user_profiles
  ADD COLUMN membership text NOT NULL DEFAULT 'member' CHECK (membership IN ('owner', 'member', 'pending', 'rejected')),
  ADD COLUMN membership_decided_by uuid REFERENCES users(id),
  ADD COLUMN membership_decided_at timestamptz;

-- Existing data: the earliest user of each organisation becomes its owner; the others stay members.
UPDATE user_profiles p SET membership = 'owner'
  FROM (SELECT DISTINCT ON (p2.organisation_id) p2.user_id
          FROM user_profiles p2 JOIN users u ON u.id = p2.user_id
         WHERE p2.organisation_id IS NOT NULL
         ORDER BY p2.organisation_id, u.created_at) first_user
 WHERE p.user_id = first_user.user_id;
