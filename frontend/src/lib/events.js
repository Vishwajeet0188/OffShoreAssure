/* Human-readable labels for audit events (Evidence Record), used by the admin console. */
export const EVENT_LABELS = {
  'user.registered': ['Registered', 'plum'],
  'verification_code.sent': ['Verification code sent', 'mute'],
  'verification_code.failed': ['Wrong verification code', 'amber'],
  'user.email_verified': ['Email verified', 'sage'],
  'user.signed_in': ['Signed in', 'sage'],
  'user.sign_in_failed': ['Sign-in failed', 'coral'],
  'user.signed_out': ['Signed out', 'mute'],
  'user.profile_updated': ['Profile completed / updated', 'plum'],
  'password_reset.requested': ['Password reset requested', 'amber'],
  'password_reset.completed': ['Password reset', 'sage'],
  'admin.user_activated': ['Admin activated account', 'sage'],
  'admin.user_deactivated': ['Admin deactivated account', 'coral'],
  'admin.account_seeded': ['Admin account created', 'plum'],
  'admin.admin_added': ['Admin added', 'plum'],
  'admin.admin_deactivated': ['Admin deactivated', 'coral'],
  'admin.admin_reactivated': ['Admin reactivated', 'sage'],
  'requirement.draft_created': ['Requirement draft started', 'plum'],
  'requirement.draft_saved': ['Requirement draft saved', 'mute'],
  'requirement.draft_deleted': ['Requirement draft deleted', 'mute'],
  'requirement.submission_rejected': ['Requirement submission incomplete', 'amber'],
  'requirement.submitted': ['Requirement submitted', 'sage'],
  'requirement.document_uploaded': ['Requirement document uploaded', 'plum'],
  'requirement.document_rejected': ['Requirement document rejected', 'coral'],
  'requirement.document_removed': ['Requirement document removed', 'mute'],
  'assessment.created': ['Assessment ID created', 'sage'],
  'requirement_profile.saved': ['Requirement profile saved', 'plum'],
  'requirement_summary.issued': ['Information Required issued', 'plum'],
  'vendor_selection.shortlisted': ['Vendor shortlisted', 'mute'],
  'vendor_selection.removed_from_shortlist': ['Vendor removed from shortlist', 'mute'],
  'vendor_selection.invited': ['Vendor invited', 'plum'],
  'vendor_selection.invitation_joined': ['Invited vendor registered', 'plum'],
  'vendor_selection.confirmed': ['Vendor selected', 'sage'],
  'vendor_selection.changed': ['Vendor changed (new version)', 'amber'],
  'feedback.published': ['Review published on website', 'sage'],
  'feedback.unpublished': ['Review removed from website', 'mute'],
  'compliance.started': ['Compliance assessment started', 'plum'],
  'compliance.answers_saved': ['Questionnaire answers saved', 'mute'],
  'compliance.evidence_uploaded': ['Evidence uploaded', 'mute'],
  'compliance.evidence_removed': ['Evidence removed', 'mute'],
  'compliance.submitted': ['Questionnaire submitted and scored', 'sage'],
  'contract.uploaded': ['Contract uploaded', 'plum'],
  'contract.version_uploaded': ['New contract version uploaded', 'plum'],
  'contract.analysed': ['Contract analysed', 'sage'],
  'obligations.extracted': ['Obligations extracted', 'sage'],
  'transfers.assessed': ['Transfer assessment saved', 'sage'],
  'risks.registered': ['Risk register saved', 'sage'],
  'remediation.planned': ['Remediation actions proposed', 'plum'],
  'remediation.decided': ['Remediation actions approved', 'sage'],
  'remediation.submitted': ['Vendor response submitted', 'plum'],
  'remediation.returned': ['Action returned to the vendor', 'amber'],
  'remediation.closed': ['Action closed', 'sage'],
  'remediation.reassessed': ['Remaining risk re-checked', 'sage'],
  'report.generated': ['Assessment report saved', 'sage'],
  'report.pack_downloaded': ['Audit pack downloaded', 'plum'],
  'monitoring.checked': ['Monitoring check saved', 'plum'],
  'monitoring.requested': ['Renewal requested from the vendor', 'amber'],
  'report.pdf_downloaded': ['Report PDF downloaded', 'plum'],
  'compliance.rescored': ['Compliance score re-checked automatically', 'amber'],
  'obligations.missed': ['Missed obligation reported', 'coral'],
  'admin.checks_run': ['Automatic checks run by an admin', 'plum'],
  'support.ticket_created': ['Support ticket raised', 'amber'],
  'admin.ticket_remark': ['Remark added to a ticket', 'plum'],
  'admin.ticket_status': ['Ticket status changed', 'sage'],
  'requirement.corrected': ['Requirement corrected (new version)', 'amber'],
  'vendor.company_registered': ['Vendor company registered', 'plum'],
  'vendor.profile_updated': ['Vendor profile updated', 'mute'],
  'admin.vendor_approved': ['Admin verified vendor', 'sage'],
  'admin.vendor_rejected': ['Admin marked vendor not verified', 'coral'],
  'organisation.join_requested': ['Requested to join organisation', 'amber'],
  'organisation.member_approved': ['Organisation member approved', 'sage'],
  'organisation.member_rejected': ['Organisation member not approved', 'coral']
};

export const eventLabel = e => (EVENT_LABELS[e] || [e.replace(/[._]/g, ' ')])[0];
export const eventTone = e => (EVENT_LABELS[e] || [null, 'mute'])[1];

/* One-line summary of an event's detail for tables. */
export function eventDetail(ev) {
  const d = ev.detail || {};
  if (d.organisationId && d.email) return [d.organisationName, d.email].filter(Boolean).join(' · ');
  if (d.organisationId) return [d.organisationName, d.note && 'reason: ' + d.note, d.reverify && 'sent back for verification'].filter(Boolean).join(' · ');
  if (d.role) return 'Role: ' + d.role;
  if (d.reference && d.version) return [d.reference, 'v' + d.version, d.reason || d.changeReason, d.controls != null && d.controls + ' controls'].filter(Boolean).join(' · ');
  if (d.reference) return [d.reference, d.title, d.validationStatus, d.riskTier && 'risk ' + d.riskTier.toLowerCase()].filter(Boolean).join(' · ');
  if (d.requirementId) return [d.title, d.fileName, d.missing != null ? (Array.isArray(d.missing) ? d.missing.length : d.missing) + ' missing' : null, d.reason].filter(Boolean).join(' · ');
  if (d.reason) return { wrong_password: 'Wrong password', unknown_email: 'Unknown email: ' + (d.email || ''), wrong_code: 'Wrong code', expired: 'Code expired', too_many_attempts: 'Too many attempts', no_code: 'No active code' }[d.reason] || d.reason;
  if (d.purpose) return (d.purpose === 'reset' ? 'Password reset' : 'Registration') + (d.resend ? ' · resent' : '');
  if (d.email && d.to) return `${d.email}: ${d.from} → ${d.to}`;
  if (d.fullName && d.email) return `${d.fullName} (${d.email})`;
  if (d.organisationName) return [d.organisationName, d.sector, d.jobRole].filter(Boolean).join(' · ');
  if (d.status) return 'Status: ' + d.status;
  if (d.via) return 'Via ' + d.via;
  return '';
}

export const STATUS_BADGE = {
  active: ['Approved', 'Active'], pending: ['Pending', 'Pending approval'],
  unverified: ['In review', 'Email not verified'], inactive: ['Restricted', 'Inactive']
};
