/* Stage 2 · Step 6 — Match service, location and scope (Engine).
   Compares a vendor's company profile with the buyer's requirement and explains every result.
   PROVISIONAL rules (no Stage 2 specification from the client yet): rule pack RP-2026.10-S2-draft. Change them here only. */
import { UNKNOWN } from '../requirements/fields.js';
import { countryName } from '../reference/countries.js';

export const MATCH_RULE_PACK = 'RP-2026.10-S2-draft';
export const MATCH = { GOOD: 'GOOD', PARTIAL: 'PARTIAL', NO_MATCH: 'NO_MATCH' };

const names = cs => cs.map(countryName).join(', ');

/* d = requirement answers, v = vendor { verificationStatus, services, deliveryCountries, country }.
   Returns { result, selectable, checks: [{ id, check, result: pass|partial|fail, detail }], flags: [check ids the buyer must accept] }. */
export function matchVendor(d, v) {
  const checks = [];
  const add = (id, check, result, detail) => checks.push({ id, check, result, detail });
  const delivery = v.deliveryCountries || [];
  const abroad = codes => [...new Set((codes || []).filter(c => c !== UNKNOWN && c !== d.buyerCountry))];

  // 1. Verified by OffshoreAssure (ASS-001 Legal Entity Verification, done at registration).
  if (v.verificationStatus === 'approved') add('verified', 'Verified by OffshoreAssure', 'pass', 'Identity and registration checked by OffshoreAssure.');
  else add('verified', 'Verified by OffshoreAssure', 'fail', v.verificationStatus === 'rejected' ? 'Verification was not approved. This vendor cannot be selected.' : 'Verification is pending. This vendor can be shortlisted but not selected until it is verified.');

  // 2. Service: the vendor provides the requested service category.
  if ((v.services || []).includes(d.serviceCategory)) add('service', 'Provides the service', 'pass', `Lists "${d.serviceCategory}".`);
  else if (d.serviceCategory === 'Other' || (v.services || []).includes('Other')) add('service', 'Provides the service', 'partial', 'The service is "Other": check the vendor’s description.');
  else add('service', 'Provides the service', 'fail', `Does not list "${d.serviceCategory}" (lists ${(v.services || []).join(', ') || 'no services'}).`);

  // 3. Location: delivers from the buyer's preferred supplier countries.
  const preferred = d.preferredCountries || [];
  const inPreferred = delivery.filter(c => preferred.includes(c));
  if (!preferred.length) add('location', 'Delivers from a preferred country', 'pass', 'No preferred countries were given.');
  else if (inPreferred.length) add('location', 'Delivers from a preferred country', 'pass', `Delivers from ${names(inPreferred)}.`);
  else add('location', 'Delivers from a preferred country', 'partial', `Delivers from ${names(delivery)}; the preferred countries are ${names(preferred)}.`);

  // 4. Restricted countries: must not deliver from a country the buyer restricted.
  const restricted = delivery.filter(c => (d.restrictedCountries || []).includes(c));
  if (restricted.length) add('restricted', 'No restricted countries', 'fail', `Delivers from ${names(restricted)}, which the buyer restricted.`);
  else add('restricted', 'No restricted countries', 'pass', (d.restrictedCountries || []).length ? `None of the restricted countries (${names(d.restrictedCountries)}).` : 'No restricted countries were given.');

  // 5. Scope: the countries the service will be accessed from are covered by the vendor's delivery countries.
  const access = abroad(d.remoteAccessCountries);
  const notCovered = access.filter(c => !delivery.includes(c));
  const extra = abroad(delivery).filter(c => !access.includes(c) && !(d.storageCountries || []).includes(c));
  if (!access.length && !extra.length) add('scope', 'Matches the access countries', 'pass', 'No remote access from outside the buyer’s country.');
  else if (!notCovered.length && !extra.length) add('scope', 'Matches the access countries', 'pass', `Covers ${names(access)}.`);
  else add('scope', 'Matches the access countries', 'partial', [
    notCovered.length ? `Does not list ${names(notCovered)}` : null,
    extra.length ? `also delivers from ${names(extra)}, which would add transfer routes` : null
  ].filter(Boolean).join('; ') + '.');

  const fails = checks.filter(c => c.result === 'fail' && c.id !== 'verified');
  const partials = checks.filter(c => c.result === 'partial');
  const result = fails.length ? MATCH.NO_MATCH : partials.length ? MATCH.PARTIAL : MATCH.GOOD;
  return {
    result, selectable: v.verificationStatus === 'approved',
    checks, flags: [...fails, ...partials].map(c => c.id), rulePackVersion: MATCH_RULE_PACK
  };
}

export const MATCH_ORDER = { GOOD: 0, PARTIAL: 1, NO_MATCH: 2 };
