import { Link } from 'react-router-dom';
import { Icon } from '../../components/common/Icon.jsx';
import { PageHero, SectionHead, CtaBand } from './parts.jsx';

const VALUES = [
  ['target', 'Clear', 'We use plain words and explain every result, so anyone can follow it.'],
  ['folder', 'Traceable', 'Every answer, decision and document can be traced back to its source.'],
  ['scale', 'Fair', 'Buyers and vendors both know what is asked, why it is asked and what happens next.'],
  [
    'shield',
    'Careful with data',
    'Information is used only for the assessment it belongs to, and documents are encrypted.',
  ],
];

export default function About() {
  return (
    <>
      <PageHero
        eyebrow="About Us"
        title="About OffshoreAssure."
        lead="OffshoreAssure is an assurance platform for UK organisations that outsource services to companies in other countries, and for the vendors that deliver those services."
        points={[
          ['users', 'For buyers and vendors'],
          ['globe', 'Outsourcing to other countries'],
          ['folder', 'Evidence behind every result'],
        ]}
      />

      <section className="lp-sec" data-section="story">
        <div className="lp-wrap lp-about">
          <div>
            <span className="eyebrow">Why we exist</span>
            <h2 className="lp-h2">Outsourcing should be checked properly, not just quickly.</h2>
          </div>
          <div className="stack" style={{ gap: 14 }}>
            <p className="lp-sub" style={{ margin: 0 }}>
              When an organisation outsources work abroad, many checks are needed: about the vendor, the
              contract, the data and the risks. These checks are often spread across different teams, emails
              and spreadsheets, which makes them slow and hard to prove later.
            </p>
            <p className="lp-sub" style={{ margin: 0 }}>
              OffshoreAssure brings them together into one clear, step-by-step assessment. Each result is
              explained and saved with its evidence, so organisations can make confident decisions and show
              how they made them.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-sec lp-alt" data-section="mission">
        <div className="lp-wrap">
          <div className="lp-mission card">
            <span className="eyebrow">Our mission</span>
            <p>
              To give every UK organisation a clear, fair and traceable way to check its offshore vendors, and
              to help good vendors prove they can be trusted.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-sec" data-section="values">
        <div className="lp-wrap">
          <SectionHead eyebrow="What we believe" title="Our values." />
          <div className="lp-cards4">
            {VALUES.map(([ic, t, d]) => (
              <div key={t} className="card lp-card">
                <span className="lp-oi">
                  <Icon n={ic} s={19} />
                </span>
                <h3 className="lp-h3">{t}</h3>
                <p className="note">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-alt" data-section="what-we-are-not">
        <div className="lp-wrap lp-about">
          <div>
            <span className="eyebrow">Good to know</span>
            <h2 className="lp-h2">What OffshoreAssure is not.</h2>
          </div>
          <ul className="lp-ticks lp-nots">
            <li>It is not a law firm and does not give legal advice.</li>
            <li>
              It does not certify that a vendor is compliant. It shows risk indicators and the evidence behind
              them.
            </li>
            <li>It does not make the decision for you. Your own teams stay in control.</li>
          </ul>
        </div>
      </section>

      <section className="lp-sec" data-section="contact">
        <div className="lp-wrap lp-about">
          <div>
            <span className="eyebrow">Get in touch</span>
            <h2 className="lp-h2">Questions or ideas?</h2>
          </div>
          <div className="stack" style={{ gap: 14 }}>
            <p className="lp-sub" style={{ margin: 0 }}>
              We would like to hear from you. Send us a question, a problem you have noticed or an idea for
              the platform.
            </p>
            <div>
              <Link className="btn primary" to="/#feedback" data-act="go-feedback">
                Send us feedback <Icon n="arrow" s={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
