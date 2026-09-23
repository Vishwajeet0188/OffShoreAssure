import {
  ArrowUp,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">

        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">

          {/* Brand */}
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0F2747]">
              <ShieldCheck
                size={18}
                className="text-white"
              />
            </div>

            <div>
              <Link
                to="/"
                className="text-sm font-bold text-[#0F2747]"
              >
                OffshoreAssure
              </Link>

              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                Helps UK and European businesses review offshore vendors
                before working with them.
              </p>
            </div>
          </div>

          {/* Links */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">

            <a
              href="#story"
              className="text-xs font-medium text-slate-500 transition-colors hover:text-[#0F2747]"
            >
              How it works
            </a>

            <a
              href="#engines"
              className="text-xs font-medium text-slate-500 transition-colors hover:text-[#0F2747]"
            >
              What we check
            </a>

            <a
              href="#evidence"
              className="text-xs font-medium text-slate-500 transition-colors hover:text-[#0F2747]"
            >
              Evidence
            </a>

            <a
              href="#buyer-view"
              className="text-xs font-medium text-slate-500 transition-colors hover:text-[#0F2747]"
            >
              Buyer view
            </a>

            <Link
              to="/buyer/login"
              className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700"
            >
              See the buyer demo
            </Link>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 flex flex-col gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <p className="text-[11px] font-medium text-slate-400">
              Phase 1 interactive prototype
            </p>

            <p className="mt-1 text-[10px] text-slate-400">
              Sample data shown for demonstration purposes.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: 'smooth',
              })
            }
            className="group inline-flex w-fit items-center gap-2 text-[11px] font-semibold text-slate-500 transition-colors hover:text-[#0F2747]"
          >
            Back to top

            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 transition-colors group-hover:border-slate-300">
              <ArrowUp size={12} />
            </span>
          </button>

        </div>
      </div>
    </footer>
  )
}

export default Footer