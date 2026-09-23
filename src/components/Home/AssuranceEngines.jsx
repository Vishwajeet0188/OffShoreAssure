import {
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  Truck,
} from 'lucide-react'

const engines = [
  {
    number: '01',
    title: 'Compliance Engine',
    description:
      "Checks the vendor's company information, certifications, insurance and security controls.",
    icon: ShieldCheck,
    color: 'blue',
    checks: [
      'Company information',
      'Data protection certifications',
      'Insurance and ISO certifications',
      'Security controls and subcontracting',
    ],
  },
  {
    number: '02',
    title: 'Contract Engine',
    description:
      "Reviews contracts, SOWs and NDAs to identify important terms and potential gaps.",
    icon: FileCheck2,
    color: 'indigo',
    checks: [
      'Who owns the work and IP',
      'Confidentiality',
      'Subcontracting rights',
      'Data use and payment terms',
    ],
  },
  {
    number: '03',
    title: 'Data Transfer Engine',
    description:
      "Checks how data will be transferred and whether the required UK GDPR safeguards are considered.",
    icon: LockKeyhole,
    color: 'cyan',
    checks: [
      'Why the data is transferred',
      'Types of data involved',
      'Transfer safeguards',
      'UK GDPR requirements',
    ],
  },
  {
    number: '04',
    title: 'Delivery Assurance',
    description:
      "Tracks vendor progress, project updates and important milestones during the engagement.",
    icon: Truck,
    color: 'emerald',
    checks: [
      'Vendor progress',
      'Project updates',
      'Milestone deliverables',
      'Delivery status',
    ],
  },
]

const iconStyles = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
}

function AssuranceEngines() {
  return (
    <section
      id="engines"
      className="border-b border-slate-200 bg-[#F7F9FC]"
    >
      <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">

        {/* Heading */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
              Four areas we check before you outsource
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-[#0F2747] sm:text-4xl">
              Four areas we check before you outsource.           
            </h2>

            <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base">
              Each area looks at an important part of working with an offshore
              vendor — from compliance and contracts to data transfers and delivery.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-slate-600">
              Four assurance areas
            </span>
          </div>
        </div>

        {/* Engine grid */}
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {engines.map((engine) => {
            const Icon = engine.icon

            return (
              <article
                key={engine.number}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/5 sm:p-7"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-4">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border ${iconStyles[engine.color]}`}
                  >
                    <Icon size={20} />
                  </div>

                  <span className="text-[11px] font-bold tracking-[0.14em] text-slate-300">
                    {engine.number}
                  </span>
                </div>

                {/* Content */}
                <div className="mt-6">
                  <h3 className="text-xl font-bold tracking-[-0.02em] text-[#0F2747]">
                    {engine.title}
                  </h3>

                  <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                    {engine.description}
                  </p>
                </div>

                {/* Checks */}
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    What We Check
                  </p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {engine.checks.map((check) => (
                      <div
                        key={check}
                        className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5"
                      >
                        <CheckCircle2
                          size={14}
                          className="mt-0.5 shrink-0 text-emerald-500"
                        />

                        <span className="text-xs leading-5 text-slate-600">
                          {check}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                  <span className="text-xs font-medium text-slate-400">
                    Assessment area
                  </span>

                  <ArrowUpRight
                    size={17}
                    className="text-slate-300 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue-600"
                  />
                </div>
              </article>
            )
          })}
        </div>

        {/* Bottom relationship */}
        <div className="mt-8 rounded-2xl border border-[#0F2747]/10 bg-[#0F2747] p-6 sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-200">
                One clear view
              </p>

              <h3 className="mt-2 text-xl font-bold tracking-[-0.02em] text-white">
                All four areas come together in one clear view.
              </h3>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                See the vendor's compliance, contract, data transfer and delivery 
                information together, along with the evidence behind the assessment.
              </p>
            </div>

            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
              <ShieldCheck
                size={28}
                className="text-blue-200"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default AssuranceEngines