import {
  ArrowRight,
  ClipboardCheck,
  FileSearch,
  ShieldCheck,
  Workflow,
} from 'lucide-react'
import { useState } from 'react'

const stages = [
  {
    id: 'vendor',
    number: '01',
    label: 'Vendor',
    title: 'Know who you are working with.',
    description:
      'Start by looking at the vendor, their company information, certifications and security details.',
    icon: ShieldCheck,
    points: [
      'Company information',
      'Certifications',
      'Security controls',
      'Insurance',
    ],
  },
  {
    id: 'assessment',
    number: '02',
    label: 'Assessment',
    title: 'Check the important parts of the relationship.',
    description:
      'Review the vendor across four important areas: compliance, contracts, data transfers and delivery.',
    icon: ClipboardCheck,
    points: [
      'Compliance',
      'Contract terms',
      'Data transfers',
      'Delivery expectations',
    ],
  },
  {
    id: 'evidence',
    number: '03',
    label: 'Evidence',
    title: 'See the information behind the assessment.',
    description:
      'Keep the documents, findings and important decisions connected so the buyer can see where the assessment information comes from.',
    icon: FileSearch,
    points: [
      'Source documents',
      'Assessment findings',
      'Flags and decisions',
      'Recorded evidence',
    ],
  },
  {
    id: 'governance',
    number: '04',
    label: 'Governance',
    title: 'Get a clear view before making a decision.',
    description:
      'Bring the assessment information together so buyers can understand the current position of the vendor relationship.',
    icon: Workflow,
    points: [
      'Overall assessment',
      'Current flags',
      'Evidence history',
      'Buyer decision support',
    ],
  },
]

function AssuranceJourney() {
  const [activeStage, setActiveStage] = useState(stages[0])

  const ActiveIcon = activeStage.icon

  return (
    <section
      id="story"
      className="border-b border-slate-200 bg-white"
    >
      <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">

        {/* Section heading */}
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
            How it works
          </p>

          <h2 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-[#0F2747] sm:text-4xl">
            From finding a vendor to making a decision.
          </h2>

          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
            OffshoreAssure helps buyers review an offshore vendor step by
            step, from understanding the vendor to reviewing evidence and
            making an informed decision.
          </p>
        </div>

        {/* Journey */}
        <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">

          {/* Stage navigation */}
          <div className="space-y-3">
            {stages.map((stage) => {
              const Icon = stage.icon
              const isActive = activeStage.id === stage.id

              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setActiveStage(stage)}
                  className={`group w-full rounded-xl border p-4 text-left transition-all duration-200 ${
                    isActive
                      ? 'border-[#0F2747] bg-[#0F2747] shadow-lg shadow-slate-900/10'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600'
                      }`}
                    >
                      <Icon size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold tracking-[0.12em] ${
                            isActive
                              ? 'text-blue-200'
                              : 'text-slate-400'
                          }`}
                        >
                          {stage.number}
                        </span>

                        <span
                          className={`text-sm font-semibold ${
                            isActive
                              ? 'text-white'
                              : 'text-[#0F2747]'
                          }`}
                        >
                          {stage.label}
                        </span>
                      </div>

                      <p
                        className={`mt-1 text-xs ${
                          isActive
                            ? 'text-slate-300'
                            : 'text-slate-500'
                        }`}
                      >
                        {stage.title}
                      </p>
                    </div>

                    <ArrowRight
                      size={16}
                      className={`shrink-0 transition-transform duration-200 ${
                        isActive
                          ? 'translate-x-0 text-white'
                          : 'text-slate-300 group-hover:translate-x-0.5 group-hover:text-slate-500'
                      }`}
                    />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Active stage detail */}
          <div className="relative overflow-hidden rounded-2xl bg-[#0F2747] p-7 text-white shadow-xl shadow-slate-900/10 sm:p-9">

            {/* Decorative shapes */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full border border-white/10" />

            <div className="relative">
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
                  <ActiveIcon size={22} />
                </div>

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                  Step {activeStage.number}
                </span>
              </div>

              <h3 className="mt-8 max-w-lg text-2xl font-bold leading-tight tracking-[-0.025em] sm:text-3xl">
                {activeStage.title}
              </h3>

              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
                {activeStage.description}
              </p>

              <div className="mt-8 border-t border-white/10 pt-6">
                <p className="text-[12px] font-bold uppercase tracking-[0.15em] text-blue-200">
                  What we look at
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {activeStage.points.map((point) => (
                    <div
                      key={point}
                      className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/10">
                        <ShieldCheck
                          size={13}
                          className="text-emerald-300"
                        />
                      </span>

                      <span className="text-xs text-slate-200">
                        {point}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom flow */}
        <div className="mt-8 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#0F2747]">
              A simple step-by-step process
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Vendor → Assessment → Evidence → Governance
            </p>
          </div>

          <a
            href="#engines"
            className="inline-flex w-fit items-center gap-2 text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700"
          >
            See what we check
            <ArrowRight size={14} />
          </a>
        </div>
      </div>
    </section>
  )
}

export default AssuranceJourney