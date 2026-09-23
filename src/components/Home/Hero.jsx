import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  // Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const assuranceItems = [
  {
    label: 'Compliance',
    value: 'Verified',
    icon: ShieldCheck,
  },
  {
    label: 'Contract',
    value: 'Reviewed',
    icon: FileCheck2,
  },
  {
    label: 'Data transfer',
    value: 'Protected',
    icon: LockKeyhole,
  },
  {
    label: 'Delivery',
    value: 'Assured',
    icon: CheckCircle2,
  },
]

function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-slate-200 bg-[#F7F9FC]"
    >
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-320px] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-blue-100/50 blur-3xl" />

        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #CBD5E1 1px, transparent 1px), linear-gradient(to bottom, #CBD5E1 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage:
              'linear-gradient(to bottom, black 0%, transparent 70%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 0%, transparent 70%)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-16 lg:px-8 lg:pb-24 lg:pt-20">

        {/* Heading */}
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold leading-[1.08] tracking-[-0.045em] text-[#0F2747] sm:text-5xl lg:text-7xl">
            Confidence before you
            <span className="block text-blue-600">
              outsource.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            OffshoreAssure gives UK and European buyers a structured view of
            vendor compliance, contracts, data transfers and delivery assurance
            before work moves offshore.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/buyer/login"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F2747] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#17385F] hover:shadow-xl"
            >
              Explore buyer demo

              <ArrowRight
                size={16}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </Link>

            <a
              href="#story"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-sm font-semibold text-[#0F2747] transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              See how assurance works
            </a>
          </div>
        </div>

        {/* Product preview */}
        <div className="mx-auto mt-16 max-w-6xl">
          <div className="relative">

            {/* Outer glow */}
            <div className="absolute -inset-5 rounded-[28px] bg-blue-500/10 blur-2xl" />

            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">

              {/* Browser bar */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                </div>

                <div className="hidden rounded-md border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-medium text-slate-400 sm:block">
                  app.offshoreassure.co.uk / buyer / assessment
                </div>

                <div className="w-12" />
              </div>

              {/* Dashboard preview */}
              <div className="grid min-h-[430px] lg:grid-cols-[210px_1fr]">

                {/* Sidebar */}
                <aside className="hidden border-r border-slate-200 bg-[#0F2747] p-5 lg:block">
                  <div className="flex items-center gap-2.5 text-white">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                      <ShieldCheck size={17} />
                    </div>

                    <span className="text-sm font-semibold">
                      OffshoreAssure
                    </span>
                  </div>

                  <div className="mt-10 space-y-1.5">
                    {[
                      'Overview',
                      'Vendor assessment',
                      'Compliance',
                      'Contract',
                      'Data transfer',
                      'Delivery',
                      'Evidence',
                    ].map((item, index) => (
                      <div
                        key={item}
                        className={`rounded-lg px-3 py-2.5 text-xs ${
                          index === 1
                            ? 'bg-white/10 font-semibold text-white'
                            : 'text-slate-300'
                        }`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </aside>

                {/* Main preview */}
                <div className="bg-[#F8FAFC] p-5 sm:p-7">

                  {/* Dashboard heading */}
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600">
                        Vendor assessment
                      </p>

                      <h2 className="mt-1 text-xl font-bold tracking-tight text-[#0F2747] sm:text-2xl">
                        Harborline Digital
                      </h2>

                      <p className="mt-1 text-xs text-slate-500">
                        Sample vendor assessment · Phase 1
                      </p>
                    </div>

                    <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-semibold text-emerald-700">
                        Assessment active
                      </span>
                    </div>
                  </div>

                  {/* Score + summary */}
                  <div className="mt-6 grid gap-4 md:grid-cols-[180px_1fr]">

                    {/* Score */}
                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <p className="text-xs font-medium text-slate-500">
                        Assurance score
                      </p>

                      <div className="mt-3 flex items-end gap-1">
                        <span className="text-4xl font-bold tracking-tight text-[#0F2747]">
                          86
                        </span>

                        <span className="mb-1 text-sm text-slate-400">
                          / 100
                        </span>
                      </div>

                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full w-[86%] rounded-full bg-blue-600" />
                      </div>

                      <p className="mt-3 text-[11px] leading-5 text-slate-500">
                        Based on the current assessment evidence.
                      </p>
                    </div>

                    {/* Assurance cards */}
                    <div className="grid grid-cols-2 gap-3">
                      {assuranceItems.map((item) => {
                        const Icon = item.icon

                        return (
                          <div
                            key={item.label}
                            className="rounded-xl border border-slate-200 bg-white p-4"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                                <Icon size={16} />
                              </div>

                              <CheckCircle2
                                size={15}
                                className="mt-1 text-emerald-500"
                              />
                            </div>

                            <p className="mt-3 text-xs font-medium text-slate-500">
                              {item.label}
                            </p>

                            <p className="mt-1 text-sm font-semibold text-[#0F2747]">
                              {item.value}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Evidence strip */}
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold text-[#0F2747]">
                          Governance evidence chain
                        </p>

                        <p className="mt-1 text-[11px] text-slate-500">
                          Assessment decisions linked to their source evidence.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">
                          18 records
                        </span>

                        <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
                          Audit trail ready
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Supporting statement */}
          <div className="mx-auto mt-7 flex max-w-3xl flex-col items-center justify-center gap-2 text-center sm:flex-row">
            <ShieldCheck size={17} className="text-blue-600" />

            <p className="text-xs leading-5 text-slate-500 sm:text-sm">
              A structured assurance layer for buyers managing offshore
              vendor relationships.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero