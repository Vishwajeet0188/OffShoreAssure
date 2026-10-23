import { Icon } from '../../components/common/Icon.jsx';
import { PageHero, SectionHead, CtaBand, Available } from './parts.jsx';

const PROBLEMS = [
  'Requirements are unclear, so risks are found too late',
  'Vendors are chosen without a clear, recorded reason',
  'Certificates and policies are missing or out of date',
  'Contracts miss key terms on data, security or audit rights',
  'Data leaves the UK without the right protection',
  'Evidence is spread across emails and spreadsheets'
];

/* What OffshoreAssure provides, how it helps, and whether it is live in this build. */
const SOLUTIONS = [
  ['clipboard', 'Requirement and risk screening', true, 'Describe the service once. OffshoreAssure checks your answers, sets an early risk level, picks the rules that apply and lists what is still missing.', ['A clear starting point for every assessment', 'Gaps found on day one, not after signing']],
  ['users', 'Vendor selection', true, 'Search verified vendors or invite your own. Each vendor is compared with your needs on service, location and countries, and your final choice is saved with its reason.', ['Fair, explained comparisons', 'A recorded decision you can show later']],
  ['shield', 'Vendor compliance assessment', true, 'A questionnaire built from the checks that apply to you. The vendor answers it and uploads certificates and policies, and gets a first score.', ['No generic, oversized questionnaires', 'Evidence checked, not just collected']],
  ['file', 'Contract and obligation review', false, 'Upload the contract. OffshoreAssure finds the important clauses and turns them into a clear list of who must do what, and by when.', ['Key terms are not missed', 'Obligations are easy to track']],
  ['globe', 'Data transfer assessment', false, 'See where your data goes, who can access it and what protects it in each country.', ['Clear view of every transfer route', 'Questions to ask where protection is weak']],
  ['flow', 'Risk, remediation and monitoring', false, 'All findings in one risk list, actions to close the gaps, and a report backed by evidence, kept up to date over time.', ['Gaps are closed, not just noted', 'An audit-ready report at any time']]
];

const SERVICES = ['IT support', 'Software development', 'Cloud and infrastructure operations', 'HR', 'Payroll', 'Finance and accounting', 'Customer support', 'Data processing and back office'];

export default function Solutions() {
  return (
    <>
      <PageHero eyebrow="Solutions" title="Everything you need to outsource with confidence."
        lead="OffshoreAssure brings the checks that usually sit in different teams and tools into one connected service, so you can see the full picture of an outsourcing arrangement." 
        points={[['clipboard', 'Clear requirements'], ['users', 'The right vendor'], ['shield', 'Checked evidence'], ['report', 'An audit-ready report']]}/>

      <section className="lp-sec" data-section="problems"><div className="lp-wrap lp-probwrap">
        <SectionHead eyebrow="The problem" title="Outsourcing offshore is hard to check well." sub="Most organisations face the same issues:" />
        <ul className="lp-problems">{PROBLEMS.map(p => <li key={p}><Icon n="alert" s={16} />{p}</li>)}</ul>
      </div></section>

      <section className="lp-sec lp-alt" data-section="solutions"><div className="lp-wrap">
        <SectionHead eyebrow="What we provide" title="Six connected solutions." sub="Each one uses the results of the one before, so you only enter information once." />
        <div className="lp-solgrid">{SOLUTIONS.map(([ic, t, live, d, helps]) => (
          <div key={t} className="card lp-sol">
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><span className="lp-oi"><Icon n={ic} s={19} /></span><Available now={live} /></div>
            <h3 className="lp-h3">{t}</h3>
            <p className="note">{d}</p>
            <div className="lp-helps"><b>How it helps</b><ul className="lp-ticks">{helps.map(h => <li key={h}>{h}</li>)}</ul></div>
          </div>))}</div>
      </div></section>

      <section className="lp-sec" data-section="benefits"><div className="lp-wrap">
        <SectionHead eyebrow="Benefits" title="Helpful for buyers and vendors." />
        <div className="lp-split2">
          <div className="card lp-who"><span className="lp-oi"><Icon n="users" s={19} /></span><h3 className="lp-h3">For buyers</h3>
            <ul className="lp-ticks"><li>Spend less time chasing documents and answers</li><li>Make decisions with clear reasons and evidence</li><li>Be ready for auditors, regulators and your board</li><li>Spot risks early, before they become problems</li></ul></div>
          <div className="card lp-who"><span className="lp-oi"><Icon n="building" s={19} /></span><h3 className="lp-h3">For vendors</h3>
            <ul className="lp-ticks"><li>One verified profile for every UK buyer</li><li>Know exactly what is being asked, and why</li><li>Fix gaps quickly with clear actions</li><li>Show a track record that helps you win more work</li></ul></div>
        </div>
      </div></section>

      <section className="lp-sec lp-alt" data-section="services"><div className="lp-wrap">
        <SectionHead eyebrow="Services covered" title="For the services organisations most often outsource." />
        <div className="lp-chips">{SERVICES.map(s => <span key={s} className="lp-chip">{s}</span>)}</div>
      </div></section>

      <CtaBand title="See it working on your own outsourcing." />
    </>
  );
}
