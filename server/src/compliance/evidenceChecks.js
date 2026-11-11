/* Stage 3, step 13: checks on each evidence file the vendor uploads.

   Malware scan · file type · size · expiry date · entity name · duplicate files · readability.
   The document text is read once, here, to find a few facts used by the step 14 checks (for example an
   access policy that excludes privileged accounts from MFA). The text itself is not saved: the file stays
   encrypted in storage and only the facts are kept.

   Malware scan: a built-in check for the EICAR test signature, executable programs and files whose content
   does not match their extension. On a live server this must be backed by a full virus scanner (for example
   ClamAV) before go-live. These are automatic checks: they are not the same as independently verified
   evidence, which needs the assigned reviewer. */

import { extractContractText, UnreadableContractError } from '../contracts/extract.js';
import { COUNTRIES } from '../reference/countries.js';
import { DOCUMENT_TYPES, keywords, hashWord } from '../engine/assurance.js';

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!';

/* The first bytes each allowed file type must start with. */
const MAGIC = {
  pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  docx: [[0x50, 0x4b, 0x03, 0x04]], // zip
  xlsx: [[0x50, 0x4b, 0x03, 0x04]],
  pptx: [[0x50, 0x4b, 0x03, 0x04]],
  doc: [[0xd0, 0xcf, 0x11, 0xe0]],
  xls: [[0xd0, 0xcf, 0x11, 0xe0]],
  png: [[0x89, 0x50, 0x4e, 0x47]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
};
const EXECUTABLE = [
  [0x4d, 0x5a], // Windows program (MZ)
  [0x7f, 0x45, 0x4c, 0x46], // Linux program (ELF)
  [0xcf, 0xfa, 0xed, 0xfe], // macOS program (Mach-O)
  [0xca, 0xfe, 0xba, 0xbe],
  [0x23, 0x21], // script (#!)
];
const startsWith = (buf, bytes) => bytes.every((b, i) => buf[i] === b);

/* Formats the engine can read text from. Others (images, older Office files) need a human reviewer. */
const READABLE = ['pdf', 'docx', 'txt', 'csv'];

/* Malware scan and file-type check. Returns null when the file is safe to keep, or the reason it was blocked. */
export function scanFile(buf, ext) {
  if (buf.includes(Buffer.from(EICAR)))
    return 'The malware scan found a virus signature. The file was not saved.';
  if (EXECUTABLE.some(sig => startsWith(buf, sig)))
    return 'The file is a program or script, not a document. The file was not saved.';
  if (MAGIC[ext] && !MAGIC[ext].some(sig => startsWith(buf, sig)))
    return `The file content is not a real .${ext} file. The file was not saved.`;
  if (['txt', 'csv'].includes(ext) && buf.subarray(0, 4096).includes(0))
    return `The file content is not a real .${ext} file. The file was not saved.`;
  return null;
}

/* Legal-form words left out when looking for the vendor's name in a document. */
const LEGAL_FORMS =
  /\b(ltd|limited|plc|llp|llc|inc|incorporated|corp|corporation|gmbh|ag|sa|sas|bv|nv|sp\.?\s*z\s*o\.?\s*o\.?|pvt|private|pte|pty|co|company|group|holdings?)\b\.?/gi;
const coreName = name =>
  String(name || '')
    .replace(LEGAL_FORMS, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
const flat = s =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ');

/* Country names (and a few common short forms) found in a text. */
const ALIASES = { US: ['united states', 'usa'], GB: ['united kingdom', 'great britain'], AE: ['uae'] };
function countriesIn(text) {
  const t = ' ' + flat(text) + ' ';
  return COUNTRIES.filter(c =>
    [c.name, ...(ALIASES[c.code] || [])].some(n => n.length > 3 && t.includes(' ' + flat(n).trim() + ' ')),
  ).map(c => c.code);
}

/* A sentence that mentions MFA, privileged accounts and an exclusion. */
const MFA = /\b(mfa|multi[- ]factor|two[- ]factor|2fa)\b/i;
const PRIVILEGED = /\b(privileged|administrator|admin|root|service accounts?)\b/i;
const EXCLUDED =
  /\b(not required|not apply|does not apply|exempt|excluded|exclude|except|optional|not enforced|not mandatory)\b/i;

/* Reads the document and returns the facts used by step 14, with the processing status.
   ctx: { vendorName, registrationNumber, serviceKeywords } */
export async function analyseDocument(buf, ext, docType, ctx) {
  const facts = { readable: false };
  let text = '';
  if (READABLE.includes(ext)) {
    try {
      const out = await extractContractText(buf, ext === 'csv' ? 'txt' : ext);
      text = out.pages.join('\n');
      facts.readable = true;
    } catch (e) {
      if (!(e instanceof UnreadableContractError)) throw e;
      facts.unreadableReason = e.message;
    }
  } else facts.machineReadable = false;

  if (facts.readable) {
    const t = flat(text);
    const name = coreName(ctx.vendorName);
    const reg = String(ctx.registrationNumber || '').replace(/[^A-Za-z0-9]/g, '');
    facts.entityMatch =
      (name.length > 2 && (' ' + t + ' ').includes(' ' + name + ' ')) ||
      (reg.length > 3 && text.replace(/[^A-Za-z0-9]/g, '').includes(reg));
    if (docType === 'ACCESS_POLICY')
      facts.mfaExcludesPrivileged = text
        .split(/(?<=[.;!?])\s+|\n+/)
        .some(s => MFA.test(s) && PRIVILEGED.test(s) && EXCLUDED.test(s));
    if (docType === 'DATA_FLOW') facts.countries = countriesIn(text);
    if (docType === 'CERTIFICATION')
      facts.scopeWords = (ctx.serviceKeywords || []).filter(w => t.includes(w));
    if (docType === 'SUBPROCESSOR_REGISTER') {
      const lines = text
        .split(/\n+/)
        .map(l => l.trim())
        .filter(Boolean);
      facts.listsEntries = lines.length >= 2 && !/\b(no subprocessors|none)\b/i.test(text);
      facts.words = keywords(text).slice(0, 5000).map(hashWord);
    }
  }
  return facts;
}

/* The processing status shown to the vendor and the buyer (step 13 output). */
export function processingStatus({ facts, docType, expiresOn, today = new Date() }) {
  if (expiresOn && new Date(expiresOn) < new Date(today.toISOString().slice(0, 10))) return 'EXPIRED';
  if (facts.machineReadable === false) return 'NEEDS_REVIEW';
  if (!facts.readable) return 'UNREADABLE';
  if (!facts.entityMatch) return 'MISMATCH';
  return 'ACCEPTED';
}

export const PROCESSING = {
  ACCEPTED: 'Accepted (automatic checks passed)',
  EXPIRED: 'Expired: kept, but not counted as current',
  UNREADABLE: 'Unreadable: replace it, or the reviewer checks it by hand',
  MISMATCH: 'Entity mismatch: the vendor’s name was not found in the document',
  NEEDS_REVIEW: 'Needs human review (the engine cannot read this format)',
};

/* The list of checks shown with each document. */
export function checkList({ facts, docType, expiresOn, issuedOn, duplicateOf, status, size, maxBytes }) {
  const t = DOCUMENT_TYPES[docType] || {};
  const out = [
    { check: 'Malware scan', outcome: 'Passed', detail: 'Built-in signature and file-type check.' },
    { check: 'File type', outcome: 'Passed' },
    { check: 'Size', outcome: size <= maxBytes ? 'Passed' : 'Failed' },
    {
      check: 'Expiry date',
      outcome: !t.expires && !expiresOn ? 'Not needed' : status === 'EXPIRED' ? 'Expired' : 'Current',
      detail: expiresOn ? `Expires ${expiresOn}` : issuedOn ? `Issued ${issuedOn}` : '',
    },
    {
      check: 'Readable',
      outcome: facts.readable ? 'Passed' : facts.machineReadable === false ? 'Human review' : 'Unreadable',
    },
    {
      check: 'Entity name',
      outcome: !facts.readable ? 'Not checked' : facts.entityMatch ? 'Match' : 'Mismatch',
    },
    { check: 'Duplicate file', outcome: duplicateOf ? 'Duplicate' : 'None' },
  ];
  if (docType === 'ACCESS_POLICY' && facts.readable)
    out.push({
      check: 'MFA for privileged accounts',
      outcome: facts.mfaExcludesPrivileged ? 'Contradiction' : 'No exclusion found',
    });
  return out;
}
