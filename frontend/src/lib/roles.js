/* Where each role lands after signing in. */
export const homeFor = user => !user ? '/' : user.isAdmin || user.role === 'admin' ? '/admin' : user.role === 'vendor' ? '/vendor' : '/dashboard';
export const ROLE_LABEL = { buyer: 'Buyer', vendor: 'Vendor', admin: 'Admin' };
export const VERIFY_LABEL = { pending: ['Pending', 'Pending verification'], approved: ['Approved', 'Verified'], rejected: ['Restricted', 'Not verified'] };
