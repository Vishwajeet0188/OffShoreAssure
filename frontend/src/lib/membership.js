/* Buyer organisation membership labels. */
export const MEMBERSHIP = {
  owner: ['Approved', 'Owner'],
  member: ['Approved', 'Member'],
  pending: ['Pending', 'Waiting for approval'],
  rejected: ['Restricted', 'Not approved'],
};
export const activeMember = m => m === 'owner' || m === 'member' || m == null;
