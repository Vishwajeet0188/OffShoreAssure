import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Flag,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'

function BuyerDecision() {
  return (
    <section
      id="buyer-view"
      className="border-b border-slate-200 bg-[#F7F9FC]"
    >
      <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">

        {/* Section heading */}
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
            Buyer view
          </p>

          <h2 className="mt-3 text-3xl font-bold text-[#0F2747] sm:text-4xl">
            Bring the assurance picture together.
          </h2>

          <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base">
            The buyer gets one clear view of the vendor assessment,
            assurance areas and supporting evidence.
          </p>
        </div>

        {/* Buyer assessment card */}
        <div className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">

          {/* Vendor header */}
          <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">
                Buyer assessment
              </p>

              <h3 className="mt-1 text-base font-bold text-[#0F2747]">
                Harborline Digital
              </h3>
            </div>

            <div className="flex gap-2">
              <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-500">
                Sample vendor
              </span>

              <span className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700">
                Assessment active
              </span>
            </div>
          </div>

          {/* Main content */}
          <div className="grid lg:grid-cols-2">

            {/* LEFT — Score */}
            <div className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r lg:p-8">

              <p className="text-xs text-slate-500">
                Current assurance position
              </p>

              <div className="mt-5 flex items-end gap-2">
                <span className="text-6xl font-bold text-[#0F2747]">
                  86
                </span>

                <span className="mb-2 text-sm text-slate-400">
                  / 100
                </span>
              </div>

              {/* Score bar */}
              <div className="mt-5 h-2 rounded-full bg-slate-100">
                <div className="h-full w-[86%] rounded-full bg-blue-600" />
              </div>

              {/* Sample data message */}
              <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">

                <div className="flex items-start gap-3">
                  <ShieldCheck
                    size={17}
                    className="mt-0.5 text-blue-600"
                  />

                  <div>
                    <p className="text-xs font-semibold text-[#0F2747]">
                      Structured assessment
                    </p>

                    <p className="mt-1 text-[11px] leading-5 text-slate-600">
                      This is sample Phase 1 data representing the
                      combined assessment view.
                    </p>
                  </div>
                </div>

              </div>

              {/* Evidence and flags */}
              <div className="mt-6 grid grid-cols-2 gap-3">

                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[10px] text-slate-400">
                    Evidence records
                  </p>

                  <p className="mt-1 text-lg font-bold text-[#0F2747]">
                    18
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[10px] text-slate-400">
                    Open flags
                  </p>

                  <p className="mt-1 text-lg font-bold text-[#0F2747]">
                    2
                  </p>
                </div>

              </div>
            </div>

            {/* RIGHT — Assurance areas */}
            <div className="p-6 lg:p-8">

              <div className="flex items-center justify-between">

                <div>
                  <p className="text-sm font-bold text-[#0F2747]">
                    Assurance areas
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Current assessment status
                  </p>
                </div>

                <span className="text-xs text-slate-400">
                  4 areas
                </span>

              </div>

              <div className="mt-5 space-y-3">

                {/* Compliance */}
                <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-4">

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <ShieldCheck size={17} />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#0F2747]">
                      Compliance
                    </p>

                    <p className="text-[11px] text-slate-500">
                      Assessment information available
                    </p>
                  </div>

                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                    Assessed
                  </span>

                </div>

                {/* Contract */}
                <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-4">

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <FileCheck2 size={17} />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#0F2747]">
                      Contract
                    </p>

                    <p className="text-[11px] text-slate-500">
                      Assessment information available
                    </p>
                  </div>

                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                    Reviewed
                  </span>

                </div>

                {/* Data Transfer */}
                <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-4">

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <ShieldCheck size={17} />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#0F2747]">
                      Data transfer
                    </p>

                    <p className="text-[11px] text-slate-500">
                      Assessment information available
                    </p>
                  </div>

                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                    Protected
                  </span>

                </div>

                {/* Delivery */}
                <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-4">

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <CheckCircle2 size={17} />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#0F2747]">
                      Delivery
                    </p>

                    <p className="text-[11px] text-slate-500">
                      Assessment information available
                    </p>
                  </div>

                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                    Tracked
                  </span>

                </div>

              </div>

              {/* Review warning */}
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">

                <Flag
                  size={16}
                  className="mt-0.5 text-amber-600"
                />

                <div>
                  <p className="text-xs font-semibold text-amber-900">
                    Review items remain
                  </p>

                  <p className="mt-1 text-[11px] leading-5 text-amber-800/80">
                    Some sample flags may require buyer review before
                    the assessment is considered complete.
                  </p>
                </div>

              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-center gap-2">
              <ShieldCheck
                size={15}
                className="text-blue-600"
              />

              <span className="text-xs text-slate-500">
                Assessment information connected to governance evidence.
              </span>
            </div>

            <Link
              to="/buyer/login"
              className="group inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Enter buyer demo

              <ArrowRight
                size={14}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>

          </div>

        </div>
      </div>
    </section>
  )
}

export default BuyerDecision