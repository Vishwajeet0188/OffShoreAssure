import { Icon } from '../../components/common/Icon.jsx';
import { STAGES, BUILT_STEPS } from '../../lib/stages.js';
import { PageHero, SectionHead, CtaBand, StartButton, Available } from './parts.jsx';

/* Plain-English description of each stage of the sequence diagram: what happens and who does it. */
const PLAIN = {
  1: ['You describe the service you want to outsource: what it is, what data is involved and which countries are used. We check your answers, give the assessment an ID and show what is still missing.', 'Buyer'],
  2: ['You search for verified vendors or invite your own. We compare each one with your needs and explain the result. You choose a vendor and say why.', 'Buyer'],
  3: ['We build a questionnaire from the checks that apply to you. The vendor answers it and uploads certificates and policies. We check them and give a first score.', 'Vendor and OffshoreAssure'],
  4: ['You upload the contract. We read it and find the important clauses, such as data protection, security and the right to audit.', 'Buyer and OffshoreAssure'],
  5: ['We turn the contract clauses into a clear list of who must do what, and by when.', 'OffshoreAssure'],
  6: ['We map where your data goes and who can see it, and check that each country and transfer is properly protected.', 'OffshoreAssure'],
  7: ['We bring all the findings together into one list of risks, each with its reason and the evidence behind it.', 'OffshoreAssure'],
  8: ['You agree the actions. The vendor fixes the gaps and sends new evidence, and we check again.', 'Buyer and vendor'],
  9: ['You receive a report backed by evidence, and we keep watching for changes, renewals and new requests.', 'Buyer and OffshoreAssure']
};

const LIVE = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][STAGES.filter(s => s.steps.every(([n]) => BUILT_STEPS.includes(n))).length - 1] || 'None';

const TRUST = [
  ['folder', 'Nothing is lost', 'Every answer, decision and document is saved with the date and the person who made it.'],
  ['layers', 'Changes are versioned', 'If something changes, a new version is created. The earlier version is always kept.'],
  ['shield', 'Documents are protected', 'Uploaded files are encrypted and only the people involved in the assessment can see them.'],
  ['target', 'Results are explained', 'Every result shows the rule and the reason behind it, in plain words.']
];

const BUYER_PATH = ['Register and add your organisation', 'Describe the service you want to outsource', 'Review the "Information Required" summary', 'Choose and confirm a vendor', 'Review the vendor’s evidence, the contract and data transfers', 'Agree actions and receive your report'];
const VENDOR_PATH = ['Register your company', 'Wait for our team to verify it', 'Get invited or selected by a UK buyer', 'Answer the questionnaire and upload evidence', 'Fix any gaps that are found', 'Build a verified track record for your next bid'];

export default function HowItWorks() {
  return (
    <>
      <PageHero eyebrow="How it works" title="One assessment, nine clear stages."
        lead="OffshoreAssure follows an outsourcing arrangement from the very first requirement to the final report. Each stage uses what was learned in the stage before, so nothing has to be entered twice." 
        points={[['layers', '9 connected stages'], ['users', 'Buyer and vendor'], ['folder', 'Every step recorded']]}/>

      <section className="lp-sec" data-section="stages"><div className="lp-wrap">
        <SectionHead eyebrow="The nine stages" title="What happens at each stage." sub={`Stages become available as they are built. ${LIVE} of the nine are live today.`} />
        <ol className="lp-stagelist">{STAGES.map(s => {
          const live = s.steps.every(([n]) => BUILT_STEPS.includes(n));
          const [text, who] = PLAIN[s.n];
          return (
            <li key={s.n} className="card">
              <span className="lp-jn">{String(s.n).padStart(2, '0')}</span>
              <div>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}><h3 className="lp-h3" style={{ margin: 0 }}>{s.title}</h3><Available now={live} /></div>
                <p>{text}</p>
                <span className="note"><Icon n="users" s={13} /> Who: {who}</span>
              </div>
            </li>);
        })}</ol>
      </div></section>

      <section className="lp-sec lp-alt" data-section="journeys"><div className="lp-wrap">
        <SectionHead eyebrow="Your journey" title="What you do, step by step." />
        <div className="lp-split2">
          <div className="card lp-who"><span className="lp-oi"><Icon n="users" s={19} /></span><h3 className="lp-h3">If you are a buyer</h3>
            <ol className="lp-numlist">{BUYER_PATH.map(t => <li key={t}>{t}</li>)}</ol></div>
          <div className="card lp-who"><span className="lp-oi"><Icon n="building" s={19} /></span><h3 className="lp-h3">If you are a vendor</h3>
            <ol className="lp-numlist">{VENDOR_PATH.map(t => <li key={t}>{t}</li>)}</ol></div>
        </div>
      </div></section>

      <section className="lp-sec" data-section="trust"><div className="lp-wrap">
        <SectionHead eyebrow="Your information" title="Safe, traceable and explained." />
        <div className="lp-cards4">{TRUST.map(([ic, t, d]) => <div key={t} className="card lp-card"><span className="lp-oi"><Icon n={ic} s={19} /></span><h3 className="lp-h3">{t}</h3><p className="note">{d}</p></div>)}</div>
        <p className="note lp-disclaimer"><Icon n="alert" s={14} /> OffshoreAssure supports your decision. It does not give legal advice or certify compliance. Your own legal and compliance teams make the final call.</p>
        <div style={{ marginTop: 18 }}><StartButton /></div>
      </div></section>

      <CtaBand />
    </>
  );
}
