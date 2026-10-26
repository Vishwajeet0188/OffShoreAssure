/*
 * Stage 9 · Step 42: the report as a PDF, for a client, an insurer or an auditor
 * (user journey Stage 9 "exports the record"; UI flow "Export Report").
 *
 * It is built only from the saved report version, so the PDF always matches the
 * fingerprint printed in its footer.
 */
import PDFDocument from 'pdfkit';

const INK = '#1F1A17', MUTED = '#6B625B', LINE = '#D9CFC4', ACCENT = '#C2552E';
const POSITION_COLOUR = { ACTION_REQUIRED: '#B3402A', IN_REMEDIATION: '#A86A12', RISKS_ACCEPTED: '#6B4C8A', ACTIONS_CLOSED: '#3F7A4F' };
/* The built-in PDF fonts only cover Western European characters: write arrows and other symbols as words. */
const plain = text => String(text ?? '').replace(/\s*→\s*/g, ' to ').replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/[^\x00-\xFF‘’“”–—…•€]/g, '');
const fmt = d => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—');

/**
 * @param {object} r   the saved report version (content, version, snapshotSha256, createdAt …)
 * @param {number} versions   how many versions exist, for "Version X of Y"
 * @returns {Promise<Buffer>}
 */
export function renderReportPdf(r, versions) {
  const c = r.content;
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 64, left: 56, right: 56 }, bufferPages: true,
    info: { Title: `${c.assessment.reference} assessment report v${r.version}.0`, Author: 'OffshoreAssure', Subject: c.assessment.title } });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  const done = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const width = doc.page.width - 112;
  const text = doc.text.bind(doc);
  doc.text = (value, ...rest) => text(typeof value === 'string' ? plain(value) : value, ...rest);

  const heading = text => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(0.8).font('Helvetica-Bold').fontSize(13).fillColor(INK).text(text);
    doc.moveTo(56, doc.y + 3).lineTo(56 + width, doc.y + 3).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.moveDown(0.6);
  };
  const para = (text, opts = {}) => doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).fillColor(opts.colour || INK).text(text, opts);
  const pair = (label, value) => {
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(label, { continued: true, width });
    doc.fillColor(INK).text('  ' + value);
  };

  // ---- Front page ----
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text('OFFSHORE ASSURE', { characterSpacing: 2 });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Compliance & Assurance for Outsourced Services');
  doc.moveDown(3);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('EVIDENCE-BACKED ASSESSMENT REPORT', { characterSpacing: 1 });
  doc.moveDown(0.3).font('Helvetica-Bold').fontSize(22).fillColor(INK).text(c.assessment.title);
  doc.moveDown(1);
  pair('Assessment ID', c.assessment.reference);
  pair('Buyer', c.assessment.buyerName);
  pair('Vendor', c.assessment.vendorName || 'Not selected');
  pair('Report version', `v${r.version}.0 (version ${r.version} of ${versions})`);
  pair('Generated', `${fmt(r.createdAt)}${r.createdBy ? ' by ' + r.createdBy : ''}`);
  pair('Reason', r.reason);
  pair('Rules applied', c.rulePackVersion);
  doc.moveDown(1.5);
  const colour = POSITION_COLOUR[c.position.code] || INK;
  const boxY = doc.y;
  doc.roundedRect(56, boxY, width, 64, 6).lineWidth(1).strokeColor(colour).stroke();
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('POSITION', 72, boxY + 12, { characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(colour).text(c.position.label, 72, boxY + 24, { width: width - 32 });
  doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(c.position.detail, 72, boxY + 44, { width: width - 32 });
  doc.x = 56; doc.y = boxY + 80;
  para(c.note, { size: 9, colour: MUTED });

  // ---- Summary ----
  doc.addPage();
  heading('Summary');
  for (const s of c.sections) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(`Stage ${s.stage} · ${s.title}`);
    para(s.summary, { size: 9.5 });
    doc.moveDown(0.4);
  }

  // ---- Findings by stage ----
  heading('Findings by stage');
  for (const s of c.sections) {
    if (!s.facts.length) continue;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(`Stage ${s.stage} · ${s.title}`);
    for (const [k, v] of s.facts) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${k}: `, { continued: true, indent: 10 }).fillColor(INK).text(String(v));
    }
    doc.moveDown(0.5);
  }

  // ---- Open actions and accepted risks ----
  heading(`Open actions (${c.openActions.length})`);
  if (!c.openActions.length) para('None.', { size: 9.5, colour: MUTED });
  for (const a of c.openActions) para(`${a.code} · ${a.title} — ${a.owner}, ${a.status.toLowerCase()}${a.dueOn ? `, due ${a.dueOn}` : ''}`, { size: 9.5 });
  heading(`Risks accepted by the buyer (${c.acceptedRisks.length})`);
  if (!c.acceptedRisks.length) para('None.', { size: 9.5, colour: MUTED });
  for (const a of c.acceptedRisks) para(`${a.code} · ${a.title}. Reason: ${a.reason}`, { size: 9.5 });

  // ---- Evidence index ----
  heading(`Evidence index (${c.evidence.length} documents)`);
  if (!c.evidence.length) para('No documents were uploaded.', { size: 9.5, colour: MUTED });
  for (const e of c.evidence) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(`Stage ${e.stage} · ${e.fileName}`, { continued: true })
      .font('Helvetica').fillColor(MUTED).text(`  ${e.kind} · ${e.detail}${e.expiresOn ? ` · expires ${e.expiresOn}` : ''}`);
    doc.font('Courier').fontSize(7.5).fillColor(MUTED).text(`SHA-256 ${e.sha256}`);
    doc.moveDown(0.3);
  }

  // ---- Records and audit trail ----
  heading('Saved records and audit trail');
  for (const x of c.records || []) {
    doc.font('Helvetica').fontSize(9).fillColor(INK).text(x.record);
    doc.font('Courier').fontSize(7.5).fillColor(MUTED).text(`SHA-256 ${x.sha256}`);
  }
  doc.moveDown(0.5);
  para(`Audit trail: ${c.auditTrail.events} events${c.auditTrail.first ? `, ${fmt(c.auditTrail.first)} to ${fmt(c.auditTrail.last)}` : ''}. The full trail is in the audit pack (JSON).`, { size: 9.5 });
  para(`Next periodic review: ${c.nextReviewOn}`, { size: 9.5 });
  doc.moveDown(1);
  para(c.note, { size: 9, colour: MUTED });

  // ---- Footer on every page: fingerprint and page numbers ----
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - 44;
    doc.page.margins.bottom = 0;
    doc.moveTo(56, y - 6).lineTo(56 + width, y - 6).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text(`${c.assessment.reference} · report v${r.version}.0 (version ${r.version} of ${versions}) · fingerprint ${r.snapshotSha256}`, 56, y, { width: width - 70, lineBreak: false })
      .text(`Page ${i + 1} of ${range.count}`, 56, y, { width, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
