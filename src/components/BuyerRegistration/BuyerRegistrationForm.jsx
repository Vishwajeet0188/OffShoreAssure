import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe2,
  ShieldCheck,
} from 'lucide-react'

function BuyerRegistrationForm() {
  const navigate = useNavigate()

  const handleSubmit = (event) => {
    event.preventDefault()
    navigate('/buyer/login')
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* LEFT — STICKY INFORMATION PANEL */}
      <section className="hidden bg-[#0F2747] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[42%] lg:shrink-0 lg:flex-col lg:justify-between lg:overflow-hidden">
        <div className="px-10 py-10 xl:px-14">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <ShieldCheck className="h-5 w-5" />
            </span>

            OffshoreAssure
          </Link>

          <div className="mt-24 max-w-lg">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
              Buyer onboarding
            </p>

            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              Build confidence before you outsource.
            </h1>

            <p className="mt-6 text-base leading-7 text-slate-300">
              Tell us about your organisation and outsourcing requirements.
              This information forms the starting point for your buyer
              workspace.
            </p>

            <div className="mt-10 space-y-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#4ADE80]" />

                <div>
                  <p className="text-sm font-semibold text-white">
                    Vendor assurance
                  </p>

                  <p className="mt-1 text-sm leading-5 text-slate-400">
                    Review offshore vendors across the assurance engines.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#4ADE80]" />

                <div>
                  <p className="text-sm font-semibold text-white">
                    Contract protection
                  </p>

                  <p className="mt-1 text-sm leading-5 text-slate-400">
                    Identify important contract terms and review flags.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#4ADE80]" />

                <div>
                  <p className="text-sm font-semibold text-white">
                    Governance evidence
                  </p>

                  <p className="mt-1 text-sm leading-5 text-slate-400">
                    Follow the evidence chain behind assessment decisions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 px-10 py-6 xl:px-14">
          <p className="text-xs leading-5 text-slate-400">
            Phase 1 interactive prototype · All registration information shown
            in this prototype is sample interface data.
          </p>
        </div>
      </section>

      {/* RIGHT — SCROLLABLE REGISTRATION AREA */}
      <section className="min-h-screen flex-1 bg-[#F7F9FC] lg:h-screen lg:overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-10 lg:px-12 lg:py-12">
          {/* Mobile header */}
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link
              to="/"
              className="flex items-center gap-2 text-lg font-semibold text-[#0F2747]"
            >
              <ShieldCheck className="h-5 w-5" />
              OffshoreAssure
            </Link>

            <Link
              to="/buyer/login"
              className="text-sm font-semibold text-[#2563EB]"
            >
              Sign in
            </Link>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
              <Building2 className="h-6 w-6" />
            </div>

            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
              Buyer registration
            </p>

            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#172033]">
              Tell us about your organisation
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#64748B]">
              Set up your buyer workspace by providing some basic information
              about your organisation and offshore outsourcing activity.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-sm sm:p-8"
          >
            {/* ORGANISATION */}
            <div>
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                  <Building2 className="h-4 w-4" />
                </div>

                <div>
                  <h3 className="font-semibold text-[#172033]">
                    Organisation details
                  </h3>

                  <p className="text-xs text-[#64748B]">
                    Basic information about the buyer organisation.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="companyName"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Organisation name
                  </label>

                  <input
                    id="companyName"
                    type="text"
                    placeholder="e.g. Acme Digital Ltd"
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="website"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Organisation website
                  </label>

                  <input
                    id="website"
                    type="url"
                    placeholder="https://www.example.co.uk"
                    className="w-full rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="organisationType"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Organisation type
                  </label>

                  <select
                    id="organisationType"
                    defaultValue=""
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="" disabled>
                      Select type
                    </option>
                    <option>Private company</option>
                    <option>Public company</option>
                    <option>Professional services</option>
                    <option>Non-profit organisation</option>
                    <option>Other</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="industry"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Industry
                  </label>

                  <select
                    id="industry"
                    defaultValue=""
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="" disabled>
                      Select industry
                    </option>
                    <option>Software & Technology</option>
                    <option>Financial Services</option>
                    <option>Healthcare</option>
                    <option>Professional Services</option>
                    <option>Retail & E-commerce</option>
                    <option>Manufacturing</option>
                    <option>Other</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="country"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Organisation country
                  </label>

                  <select
                    id="country"
                    defaultValue=""
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="" disabled>
                      Select country
                    </option>
                    <option>United Kingdom</option>
                    <option>Ireland</option>
                    <option>Germany</option>
                    <option>France</option>
                    <option>Netherlands</option>
                    <option>Other European country</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="companySize"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Organisation size
                  </label>

                  <select
                    id="companySize"
                    defaultValue=""
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="" disabled>
                      Select size
                    </option>
                    <option>1–10 employees</option>
                    <option>11–50 employees</option>
                    <option>51–250 employees</option>
                    <option>251–500 employees</option>
                    <option>500+ employees</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="my-8 border-t border-[#E2E8F0]" />

            {/* OUTSOURCING */}
            <div>
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                  <Globe2 className="h-4 w-4" />
                </div>

                <div>
                  <h3 className="font-semibold text-[#172033]">
                    Outsourcing requirements
                  </h3>

                  <p className="text-xs text-[#64748B]">
                    Tell us about the type of offshore work you are considering.
                  </p>
                </div>
              </div>

              <div className="grid gap-5">
                <div>
                  <label
                    htmlFor="outsourcingArea"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    What do you typically outsource?
                  </label>

                  <select
                    id="outsourcingArea"
                    defaultValue=""
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="" disabled>
                      Select an area
                    </option>
                    <option>Software development</option>
                    <option>Software testing / QA</option>
                    <option>IT support</option>
                    <option>Data and analytics</option>
                    <option>Multiple IT services</option>
                    <option>Other</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="vendorRegion"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Where are your offshore vendors typically based?
                  </label>

                  <select
                    id="vendorRegion"
                    defaultValue=""
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="" disabled>
                      Select region
                    </option>
                    <option>India</option>
                    <option>Eastern Europe</option>
                    <option>South Asia</option>
                    <option>Multiple regions</option>
                    <option>Not decided yet</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="vendorExperience"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    What matters most when selecting a vendor?
                  </label>

                  <select
                    id="vendorExperience"
                    defaultValue=""
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="" disabled>
                      Select priority
                    </option>
                    <option>Compliance and security</option>
                    <option>Relevant experience</option>
                    <option>Delivery capability</option>
                    <option>Cost efficiency</option>
                    <option>Combination of these</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="my-8 border-t border-[#E2E8F0]" />

            {/* CONTACT */}
            <div>
              <div className="mb-5">
                <h3 className="font-semibold text-[#172033]">
                  Your contact details
                </h3>

                <p className="mt-1 text-xs text-[#64748B]">
                  Information for the person managing the buyer workspace.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="firstName"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    First name
                  </label>

                  <input
                    id="firstName"
                    type="text"
                    placeholder="First name"
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="lastName"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Last name
                  </label>

                  <input
                    id="lastName"
                    type="text"
                    placeholder="Last name"
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="jobRole"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Job role
                  </label>

                  <select
                    id="jobRole"
                    defaultValue=""
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="" disabled>
                      Select role
                    </option>
                    <option>Director / Owner</option>
                    <option>Procurement</option>
                    <option>Technology / IT</option>
                    <option>Operations</option>
                    <option>Compliance / Risk</option>
                    <option>Other</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="workEmail"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Work email
                  </label>

                  <input
                    id="workEmail"
                    type="email"
                    placeholder="you@company.co.uk"
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  />
                </div>
              </div>
            </div>

            <div className="my-8 border-t border-[#E2E8F0]" />

            {/* ACCOUNT */}
            <div>
              <div className="mb-5">
                <h3 className="font-semibold text-[#172033]">
                  Account security
                </h3>

                <p className="mt-1 text-xs text-[#64748B]">
                  Create credentials for the buyer workspace.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Password
                  </label>

                  <input
                    id="password"
                    type="password"
                    placeholder="Create a password"
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="mb-2 block text-sm font-semibold text-[#172033]"
                  >
                    Confirm password
                  </label>

                  <input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm password"
                    required
                    className="w-full rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-4 focus:ring-blue-50"
                  />
                </div>
              </div>
            </div>

            <label className="mt-7 flex items-start gap-3">
              <input
                type="checkbox"
                required
                className="mt-1 h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]"
              />

              <span className="text-xs leading-5 text-[#64748B]">
                I understand that this is a Phase 1 interactive prototype and
                that the information entered here is not stored or used to
                create a real account.
              </span>
            </label>

            <button
              type="submit"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#1D4ED8]"
            >
              Continue to buyer account registration
              <ArrowRight className="h-4 w-4" />
            </button>

            <p className="mt-5 text-center text-sm text-[#64748B]">
              Already have a buyer workspace?{' '}
              <Link
                to="/buyer/login"
                className="font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
              >
                Sign in
              </Link>
            </p>
          </form>

          <p className="py-6 text-center text-xs leading-5 text-[#94A3B8]">
            OffshoreAssure Phase 1 · Sample registration interface
          </p>
        </div>
      </section>
    </div>
  )
}

export default BuyerRegistrationForm