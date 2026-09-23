import {
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'

function FinalCTA() {
  return (
    <section className="bg-[#0F2747]">
      <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 px-6 py-12 text-center sm:px-10 lg:px-16 lg:py-16">

          {/* Decorative elements */}
          <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full border border-white/10" />

          <div className="relative mx-auto max-w-3xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-blue-200">
              <ShieldCheck size={23} />
            </div>

            <h2 className="mt-6 text-3xl font-bold leading-tight tracking-[-0.035em] text-white sm:text-4xl lg:text-5xl">
              See the assurance journey
              <span className="block text-blue-200">
                from the buyer's view.
              </span>
            </h2>

            <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Explore how a buyer can move from vendor assessment through
              compliance, contracts, data transfer, delivery and governance
              evidence in one structured journey.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/buyer/login"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-[#0F2747] shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-xl"
              >
                Enter buyer demo

                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>

              <a
                href="#top"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Back to overview
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default FinalCTA