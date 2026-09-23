import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Filter,
  MapPin,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

const vendors = [
  {
    id: 'harborline',
    name: 'Harborline Digital',
    location: 'Bengaluru, India',
    category: 'Software development',
    description:
      'Offshore software development provider with a structured compliance profile for buyer assessment.',
    score: 86,
    status: 'Assessment ready',
    certifications: ['ISO 27001', 'Data protection'],
    experience: '7 years',
  },
  {
    id: 'northstar',
    name: 'Northstar Systems',
    location: 'Pune, India',
    category: 'IT support & engineering',
    description:
      'Technology services provider with information available for compliance and delivery assessment.',
    score: 82,
    status: 'Assessment ready',
    certifications: ['ISO 27001', 'Security controls'],
    experience: '6 years',
  },
  {
    id: 'bluepeak',
    name: 'BluePeak Technologies',
    location: 'Hyderabad, India',
    category: 'Software testing',
    description:
      'Software testing and technical support provider available for buyer-side assurance review.',
    score: 78,
    status: 'Review required',
    certifications: ['Security controls'],
    experience: '5 years',
  },
]

function VendorList() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#F7F9FC]">

      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 sm:px-7 lg:px-8">

          <Link
            to="/buyer/dashboard"
            className="flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0F2747]">
              <ShieldCheck
                size={18}
                className="text-white"
              />
            </div>

            <div className="hidden sm:block">
              <p className="text-sm font-bold text-[#0F2747]">
                OffshoreAssure
              </p>

              <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-400">
                Buyer workspace
              </p>
            </div>
          </Link>

          <Link
            to="/buyer/dashboard"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition-colors hover:text-[#0F2747]"
          >
            <ArrowLeft size={14} />
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-7 lg:px-8 lg:py-10">

        {/* Page heading */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-600">
              Vendor discovery
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-[#0F2747]">
              Find a vendor to assess.
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Review available vendor information and select a relationship
              for a structured assurance assessment.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2">
            <span className="h-2 w-2 rounded-full bg-blue-600" />

            <span className="text-xs font-semibold text-slate-600">
              3 sample vendors
            </span>
          </div>
        </div>

        {/* Search and filters */}
        <div className="mt-8 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              placeholder="Search vendors by name, service or location"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-[#172033] outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F2747] transition-colors hover:bg-slate-50"
          >
            <Filter size={14} />
            Filters
          </button>
        </div>

        {/* Vendor list */}
        <div className="mt-6 space-y-4">
          {vendors.map((vendor) => (
            <article
              key={vendor.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5 sm:p-6"
            >
              <div className="flex flex-col gap-6 xl:flex-row xl:items-center">

                {/* Vendor identity */}
                <div className="flex min-w-0 flex-1 gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0F2747] text-white">
                    <ShieldCheck size={21} />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold tracking-tight text-[#0F2747]">
                        {vendor.name}
                      </h2>

                      <span
                        className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${
                          vendor.status === 'Assessment ready'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {vendor.status}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <MapPin size={12} />
                        {vendor.location}
                      </span>

                      <span>
                        {vendor.category}
                      </span>

                      <span>
                        {vendor.experience}
                      </span>
                    </div>

                    <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-500">
                      {vendor.description}
                    </p>
                  </div>
                </div>

                {/* Score */}
                <div className="flex items-center gap-5 border-t border-slate-100 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                  <div className="min-w-[105px]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Assurance score
                    </p>

                    <div className="mt-1 flex items-end gap-1">
                      <span className="text-2xl font-bold tracking-tight text-[#0F2747]">
                        {vendor.score}
                      </span>

                      <span className="mb-1 text-[10px] text-slate-400">
                        / 100
                      </span>
                    </div>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{ width: `${vendor.score}%` }}
                      />
                    </div>
                  </div>

                  <Link
                    to={`/vendors/${vendor.id}`}
                    className="group inline-flex items-center gap-1.5 rounded-lg bg-[#0F2747] px-3.5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-[#17385F]"
                  >
                    View vendor
                    <ArrowRight
                      size={13}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </div>
              </div>

              {/* Credentials */}
              <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {vendor.certifications.map((certification) => (
                    <span
                      key={certification}
                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-[10px] font-medium text-slate-600"
                    >
                      <CheckCircle2
                        size={11}
                        className="text-emerald-500"
                      />
                      {certification}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/vendors/${vendor.id}/assessment`)}
                  className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
                >
                  Start assessment
                  <ChevronRight size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>

        {/* Bottom note */}
        <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck
              size={16}
              className="mt-0.5 shrink-0 text-blue-600"
            />

            <div>
              <p className="text-xs font-semibold text-[#0F2747]">
                Assessment-led vendor selection
              </p>

              <p className="mt-1 text-[11px] leading-5 text-slate-600">
                Vendor information shown here is sample Phase 1 data. The
                prototype focuses on assurance and qualification rather than a
                public marketplace experience.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VendorList