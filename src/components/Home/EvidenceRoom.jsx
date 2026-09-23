import { ArrowRight, FileText, ShieldCheck } from 'lucide-react'

function EvidenceRoom() {
  return (
    <section
      id="evidence"
      className="border-b border-slate-200 bg-white"
    >
      <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">

        {/* Heading */}
        <div className="max-w-2xl">

          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
            Governance evidence chain
          </p>

          <h2 className="mt-3 text-3xl font-bold text-[#0F2747] sm:text-4xl">
            Every important assessment decision has a trail.
          </h2>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            Assessment results are connected to the evidence that supports them.
          </p>

        </div>

        {/* Main content */}
        <div className="mt-10 grid gap-6 lg:grid-cols-2">

          {/* Evidence */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">

            <h3 className="text-sm font-bold text-[#0F2747]">
              Evidence timeline
            </h3>

            <p className="mt-1 text-xs text-slate-500">
              Sample assessment record
            </p>

            {/* Source */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">

              <div className="flex items-center gap-3">

                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FileText size={17} />
                </div>

                <div>
                  <p className="text-[10px] uppercase text-slate-400">
                    Source
                  </p>

                  <p className="mt-1 text-sm font-semibold text-[#0F2747]">
                    ISO 27001 Certificate
                  </p>

                  <p className="text-xs text-slate-500">
                    Vendor compliance evidence
                  </p>
                </div>

              </div>

            </div>

            {/* Finding */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">

              <div className="flex items-center gap-3">

                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <ShieldCheck size={17} />
                </div>

                <div>
                  <p className="text-[10px] uppercase text-slate-400">
                    Finding
                  </p>

                  <p className="mt-1 text-sm font-semibold text-[#0F2747]">
                    Security controls
                  </p>

                  <p className="text-xs text-slate-500">
                    Compliance assessment
                  </p>
                </div>

              </div>

            </div>

            {/* Decision */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">

              <div className="flex items-center gap-3">

                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <ShieldCheck size={17} />
                </div>

                <div>
                  <p className="text-[10px] uppercase text-slate-400">
                    Decision
                  </p>

                  <p className="mt-1 text-sm font-semibold text-[#0F2747]">
                    Compliance score updated
                  </p>

                  <p className="text-xs text-slate-500">
                    Assessment result
                  </p>
                </div>

              </div>

            </div>

          </div>

          {/* Simple explanation */}
          <div className="rounded-2xl bg-[#0F2747] p-6 text-white">

            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
              <ShieldCheck size={19} />
            </div>

            <h3 className="mt-5 text-2xl font-bold">
              Evidence stays connected to the decision.
            </h3>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              The buyer can understand where an assessment result came from
              and what evidence supports it.
            </p>

            {/* Simple flow */}
            <div className="mt-7 space-y-3">

              <div className="rounded-lg bg-white/10 p-4">
                <p className="text-sm font-semibold">
                  1. Original source
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Document or assessment input
                </p>
              </div>

              <div className="text-center text-slate-400">
                ↓
              </div>

              <div className="rounded-lg bg-white/10 p-4">
                <p className="text-sm font-semibold">
                  2. Assessment finding
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  What the assessment found
                </p>
              </div>

              <div className="text-center text-slate-400">
                ↓
              </div>

              <div className="rounded-lg bg-emerald-500/10 p-4">
                <p className="text-sm font-semibold">
                  3. Governance record
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Record of the assessment result
                </p>
              </div>

            </div>

          </div>

        </div>

        {/* Bottom message */}
        <div className="mt-8 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <p className="text-sm font-semibold text-[#0F2747]">
              Designed for traceable assurance.
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Source → finding → decision → evidence
            </p>
          </div>

          <a
            href="#buyer-view"
            className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            See the buyer view
            <ArrowRight size={14} />
          </a>

        </div>

      </div>
    </section>
  )
}

export default EvidenceRoom