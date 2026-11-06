import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Icon } from '../../components/common/Icon.jsx';
import HeroScene from './HeroScene.jsx';
import { SectionHead, StartButton, CtaBand, FeedbackForm, ReviewsMarquee } from './parts.jsx';

const PARTIES = [
  [
    'users',
    'Buyer',
    'The UK organisation that wants to outsource a service. It describes what it needs, chooses a vendor and receives the report.',
  ],
  [
    'building',
    'Offshore vendor',
    'The company that will deliver the service. It answers questions and shares certificates and policies.',
  ],
  [
    'scale',
    'OffshoreAssure',
    'Checks the answers against clear rules and shows what is fine, what is missing and what needs action.',
  ],
  [
    'folder',
    'Evidence record',
    'Keeps every answer, decision and document, with the date and the person, so each result can be traced.',
  ],
];

const DOES = [
  [
    'clipboard',
    'Understand what you need',
    'Describe the service once. We check it, spot gaps and give you an early risk level.',
  ],
  [
    'users',
    'Choose the right vendor',
    'Find verified vendors and compare them against your needs, with the reasons shown.',
  ],
  [
    'shield',
    'Check compliance and contracts',
    'Review the vendor’s evidence, the contract terms and where your data will go.',
  ],
  [
    'report',
    'Fix gaps and keep proof',
    'Track actions until they are closed, and keep a clear report you can show to auditors.',
  ],
];

const STEPS = [
  [
    'Tell us what you need',
    'Answer simple questions about the service, the data and the countries involved.',
  ],
  ['Choose a vendor', 'Search verified vendors or invite your own, compare them and record your choice.'],
  [
    'Check the vendor and the contract',
    'The vendor shares evidence; we review it together with the contract and data transfers.',
  ],
  ['Fix gaps and get your report', 'Agree actions, close them, and receive a report backed by evidence.'],
];

const WHY = [
  [
    'layers',
    'Everything in one place',
    'No more spreadsheets and email chains. Each step builds on the one before.',
  ],
  [
    'target',
    'Clear reasons',
    'Every result explains why, in plain words, so you can make your own decision.',
  ],
  [
    'folder',
    'Evidence you can show',
    'Answers and decisions are saved as versions. Nothing is changed without a record.',
  ],
  ['scale', 'Fair to both sides', 'Vendors see what is asked of them and can build a verified track record.'],
];

export const FAQ = [
  [
    'Who is OffshoreAssure for?',
    'UK organisations that outsource services such as IT support, software development or back-office work to companies in other countries, and the vendors that deliver those services.',
  ],
  [
    'Does OffshoreAssure give legal advice?',
    'No. It gives clear risk indicators and the evidence behind them to support your decision. Your own legal and compliance teams make the final call.',
  ],
  [
    'How do vendors join?',
    'A vendor registers its company, and our team checks its identity and registration. Only verified vendors appear in buyers’ searches. Buyers can also invite a vendor by email.',
  ],
  [
    'What happens to my information?',
    'It is used only for your assessment. Each answer and decision is saved with a date and version, and uploaded documents are encrypted.',
  ],
  [
    'Can I change my answers later?',
    'Yes. A correction creates a new version of your answers. The earlier version is kept, so you can always see what changed and why.',
  ],
];

/* Public home page: an overview of OffshoreAssure, short previews of the other pages, FAQ and feedback. */
export default function Home() {
  const auth = useAuth();
  return (
    <>
      <section className="lp-hero lp-hero2" id="lp-top">
        <div className="lp-wrap lp-herogrid">
          <div className="lp-herotext">
            <h1 className="lp-h1">
              Confidence in every <span className="lp-accent">outsourced</span> relationship.
            </h1>
            <p className="lp-lead">
              Check an offshore vendor before and during the work: what you need, who you choose, what the
              contract says and where your data goes. Every result is backed by evidence.
            </p>
            <div className="row" style={{ gap: 12, marginTop: 4 }}>
              <StartButton />
              {!auth.user ? (
                <Link className="btn outline lp-cta" to="/how-it-works">
                  See how it works
                </Link>
              ) : null}
            </div>
            <ul className="lp-trust">
              <li>
                <Icon n="check" s={14} />
                Verified vendors only
              </li>
              <li>
                <Icon n="check" s={14} />
                Evidence for every result
              </li>
              <li>
                <Icon n="check" s={14} />
                Built for UK organisations
              </li>
            </ul>
          </div>
          <HeroScene />
        </div>
        <div className="lp-wrap">
          <p className="note lp-herofoot">
            Results are risk indicators that support your decision. They are not legal advice or a compliance
            certificate.
          </p>
        </div>
      </section>

      <section className="lp-partstrip" data-section="parties">
        <div className="lp-wrap">
          <span className="eyebrow lp-partstrip-h">Who takes part</span>
          <ol className="lp-parties4 lp-flow">
            {PARTIES.map(([ic, name, text], i) => (
              <li key={name} className="card lp-card lp-party4">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="lp-oi">
                    <Icon n={ic} s={19} />
                  </span>
                  <span className="lp-flow-n">0{i + 1}</span>
                </div>
                <b>{name}</b>
                <span className="note">{text}</span>
                {!auth.user && i === 0 ? (
                  <Link className="link lp-party-cta" to="/signup?role=buyer">
                    Register as a buyer <Icon n="arrow" s={13} />
                  </Link>
                ) : null}
                {!auth.user && i === 1 ? (
                  <Link className="link lp-party-cta" to="/signup?role=vendor">
                    Register your company <Icon n="arrow" s={13} />
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-riskband" data-section="statement">
        <div className="lp-wrap lp-riskin">
          <div>
            <span className="eyebrow" style={{ color: '#E7A596' }}>
              The challenge
            </span>
            <p className="lp-risk-t">
              Outsourcing to another country brings risks to data, contracts, compliance and delivery.
            </p>
            <p className="lp-risk-s">
              OffshoreAssure brings all those checks together into one clear, traceable assessment.
            </p>
          </div>
          <div
            className="lp-riskflow"
            aria-label="Data, contracts, compliance and delivery checks lead to one traceable assessment"
          >
            <ul>
              {[
                ['globe', 'Data'],
                ['file', 'Contracts'],
                ['shield', 'Compliance'],
                ['pulse', 'Delivery'],
              ].map(([ic, t], i) => (
                <li key={t} style={{ animationDelay: `${i * 0.15}s` }}>
                  <Icon n={ic} s={16} />
                  {t}
                </li>
              ))}
            </ul>
            <span className="lp-riskarrow" aria-hidden="true" />
            <div className="lp-riskout">
              <Icon n="check" s={18} />
              <span>
                <b>One traceable assessment</b>
                <small>Every result with its evidence</small>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" data-section="what-we-do">
        <div className="lp-wrap">
          <SectionHead
            eyebrow="What OffshoreAssure does"
            title="From the first question to the final report."
            sub="Four things OffshoreAssure helps you do, all in one place."
          />
          <div className="lp-bento">
            {DOES.map(([ic, t, d], i) => (
              <div key={t} className={'card lp-card lp-bento-' + (i + 1)}>
                <span className="lp-oi">
                  <Icon n={ic} s={i === 0 ? 22 : 19} />
                </span>
                <h3 className="lp-h3">{t}</h3>
                <p className="note">{d}</p>
                {i === 0 ? (
                  <Link className="lp-bento-link" to="/how-it-works">
                    See the nine stages <Icon n="arrow" s={14} />
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
          <Link className="link lp-more" to="/solutions">
            See all solutions <Icon n="arrow" s={14} />
          </Link>
        </div>
      </section>

      <section className="lp-sec lp-alt" data-section="steps">
        <div className="lp-wrap">
          <SectionHead
            eyebrow="How it works"
            title="Four simple steps."
            sub="Behind these steps are nine stages that follow the life of an outsourcing arrangement."
          />
          <ol className="lp-timeline">
            {STEPS.map(([t, d], i) => (
              <li key={t}>
                <span className="lp-tl-n">{i + 1}</span>
                <h3 className="lp-h3">{t}</h3>
                <p className="note">{d}</p>
              </li>
            ))}
          </ol>
          <Link className="link lp-more" to="/how-it-works">
            How OffshoreAssure works, step by step <Icon n="arrow" s={14} />
          </Link>
        </div>
      </section>

      <section className="lp-sec" data-section="who-for">
        <div className="lp-wrap">
          <SectionHead eyebrow="Who it is for" title="Built for both sides of the arrangement." />
          <div className="lp-split2">
            <div className="card lp-who lp-who-dark">
              <span className="lp-who-bg" aria-hidden="true">
                <Icon n="users" s={160} />
              </span>
              <span className="lp-oi">
                <Icon n="users" s={19} />
              </span>
              <h3 className="lp-h3">For buyers</h3>
              <ul className="lp-ticks">
                <li>Know the risks before you sign</li>
                <li>Choose vendors with clear reasons</li>
                <li>Show auditors and regulators what you checked</li>
              </ul>
              {!auth.user ? (
                <Link className="btn primary sm" to="/signup?role=buyer">
                  Register as a buyer <Icon n="arrow" s={13} />
                </Link>
              ) : null}
            </div>
            <div className="card lp-who lp-who-light">
              <span className="lp-who-bg" aria-hidden="true">
                <Icon n="building" s={160} />
              </span>
              <span className="lp-oi">
                <Icon n="building" s={19} />
              </span>
              <h3 className="lp-h3">For vendors</h3>
              <ul className="lp-ticks">
                <li>Hold one verified company profile</li>
                <li>Be found by UK buyers looking for your services</li>
                <li>Answer once and build a trusted track record</li>
              </ul>
              {!auth.user ? (
                <Link className="btn outline sm" to="/signup?role=vendor">
                  Register your company <Icon n="arrow" s={13} />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec lp-alt" data-section="why">
        <div className="lp-wrap lp-splitsec">
          <div className="lp-split-l">
            <SectionHead
              left
              eyebrow="Why OffshoreAssure"
              title="Clear, fair and traceable."
              sub="Built around the way outsourcing decisions are made and checked, so you can trust every result."
            />
            <StartButton />
          </div>
          <ol className="lp-why">
            {WHY.map(([ic, t, d], i) => (
              <li key={t} className="card lp-card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="lp-oi">
                    <Icon n={ic} s={19} />
                  </span>
                  <span className="lp-why-n">0{i + 1}</span>
                </div>
                <h3 className="lp-h3">{t}</h3>
                <p className="note">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-sec" id="faq" data-section="faq">
        <div className="lp-wrap lp-splitsec">
          <div className="lp-split-l">
            <SectionHead
              left
              eyebrow="Questions"
              title="Frequently asked questions."
              sub="Short answers to what people ask most."
            />
            <div className="card lp-askbox">
              <b>Still have a question?</b>
              <span className="note">Sign in and send it to us. We will reply to your account email.</span>
              <Link className="link" to="/#feedback">
                Ask a question <Icon n="arrow" s={13} />
              </Link>
            </div>
          </div>
          <div className="lp-faq">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card">
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <ReviewsMarquee />

      <section className="lp-sec lp-fbsec" id="feedback" data-section="feedback">
        <div className="lp-wrap lp-splitsec">
          <div className="lp-split-l">
            <SectionHead
              left
              eyebrow="Feedback"
              title="Tell us what you think."
              sub="OffshoreAssure is being built step by step. Your feedback, questions and ideas help us shape it."
            />
            <ul className="lp-fbpoints">
              <li>
                <Icon n="clock" s={16} />
                It only takes a minute
              </li>
              <li>
                <Icon n="bell" s={16} />
                Our team reads every message
              </li>
              <li>
                <Icon n="shield" s={16} />
                Shown on the website only if you agree
              </li>
            </ul>
          </div>
          <FeedbackForm />
        </div>
      </section>

      <CtaBand />
    </>
  );
}
