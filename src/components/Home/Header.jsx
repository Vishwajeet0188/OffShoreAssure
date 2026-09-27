import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-6 lg:px-8">

        {/* Brand */}
        <Link
          to="/"
          className="group flex items-center gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F2747] shadow-sm transition-transform duration-200 group-hover:scale-105">
            <ShieldCheck
              size={21}
              strokeWidth={2.2}
              className="text-white"
            />
          </div>

          <div className="leading-none">
            <div className="text-[17px] font-bold tracking-[-0.02em] text-[#0F2747]">
              OffshoreAssure
            </div>

            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Offshore Vendor Assurance
            </div>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="hidden items-center gap-8 lg:flex">

          <a
            href="#story"
            className="text-sm font-medium text-slate-600 transition-colors hover:text-[#0F2747]"
          >
            How it works
          </a>

          <a
            href="#engines"
            className="text-sm font-medium text-slate-600 transition-colors hover:text-[#0F2747]"
          >
            What we check
          </a>

          <a
            href="#evidence"
            className="text-sm font-medium text-slate-600 transition-colors hover:text-[#0F2747]"
          >
            Evidence
          </a>

          <a
            href="#buyer-view"
            className="text-sm font-medium text-slate-600 transition-colors hover:text-[#0F2747]"
          >
            Buyer view
          </a>

        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">

          <Link
            to="/buyer/login"
            className="hidden text-sm font-semibold text-[#0F2747] transition-colors hover:text-blue-600 sm:inline-flex"
          >
            Buyer login
          </Link>

          <Link
            to="/buyer/login"
            className="group inline-flex items-center gap-2 rounded-lg bg-[#0F2747] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#17385F] hover:shadow-md"
          >
            See the demo

            <ArrowRight
              size={15}
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>

        </div>
      </div>
    </header>
  )
}

export default Header