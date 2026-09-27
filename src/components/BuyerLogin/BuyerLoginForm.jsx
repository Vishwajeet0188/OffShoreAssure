import {
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

function BuyerLoginForm() {
  const navigate = useNavigate()

  const handleSubmit = (event) => {
    event.preventDefault()
    navigate('/buyer/dashboard')
  }

  return (
    <div className="flex min-h-screen flex-col">

      {/* Top navigation */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">

          <Link
            to="/"
            className="flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0F2747]">
              <ShieldCheck
                size={18}
                className="text-white"
              />
            </div>

            <span className="text-sm font-bold text-[#0F2747]">
              OffshoreAssure
            </span>
          </Link>

          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition-colors hover:text-[#0F2747]"
          >
            <ArrowLeft size={14} />
            Back to website
          </Link>
        </div>
      </header>

      {/* Login area */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">

          {/* Intro */}
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <LockKeyhole size={21} />
            </div>

            <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
              Buyer access
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-[#0F2747]">
              Welcome back
            </h1>

            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
              Sign in to explore the OffshoreAssure buyer assessment
              experience.
            </p>
          </div>

          {/* Form card */}
          <form
            onSubmit={handleSubmit}
            className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"
          >
            <div className="space-y-5">

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="text-xs font-semibold text-[#0F2747]"
                >
                  Work email
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@company.co.uk"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-[#172033] outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-xs font-semibold text-[#0F2747]"
                  >
                    Password
                  </label>

                  <button
                    type="button"
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Forgot password?
                  </button>
                </div>

                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-[#172033] outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  required
                />
              </div>

              {/* Remember */}
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />

                <span className="text-xs text-slate-500">
                  Keep me signed in
                </span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                className="group flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F2747] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#17385F] hover:shadow-md"
              >
                Continue to buyer dashboard

                <ArrowRight
                  size={15}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </button>
            </div>
          </form>

          {/* Registration link */}
          <p className="mt-6 text-center text-sm text-slate-500">
            Don't have a buyer workspace?{' '}
            <Link
              to="/buyer/register"
              className="font-semibold text-blue-600 transition-colors hover:text-blue-700"
            >
              Create one
            </Link>
          </p>

          {/* Footer text */}
          <p className="mt-6 text-center text-[11px] text-slate-400">
            OffshoreAssure · Buyer assurance platform
          </p>
        </div>
      </div>
    </div>
  )
}

export default BuyerLoginForm