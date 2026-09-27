import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  Globe2,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

const vendor = {
  name: 'Harborline Digital',
  location: 'Bengaluru, India',
  category: 'Software development',
  experience: '7 years',
  score: 86,
  status: 'Assessment ready',
  description:
    'Offshore software development provider available for a structured buyer-side assurance assessment.',
}

const profileItems = [
  {
    label: 'Company information',
    status: 'Available',
    icon: Building2,
  },
  {
    label: 'Compliance credentials',
    status: 'Available',
    icon: ShieldCheck,
  },
  {
    label: 'Data protection',
    status: 'Available',
    icon: LockKeyhole,
  },
  {
    label: 'Delivery information',
    status: 'Available',
    icon: Truck,
  },
]

const certifications = [
  'ISO 27001',
  'Data protection controls',
  'Security controls',
]

function ProfileOverview() {
  const { vendorId } = useParams()

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
            to="/vendors"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition-colors hover:text-[#0F2747]"
          >
            <ArrowLeft size={14} />
            Vendor discovery
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-7 lg:px-8 lg:py-10">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400">
          <Link
            to="/buyer/dashboard"
            className="hover:text-[#0F2747]"
          >
            Dashboard
          </Link>

          <ChevronRight size={11} />

          <Link
            to="/vendors"
            className="hover:text-[#0F2747]"
          >
            Vendors
          </Link>

          <ChevronRight size={11} />

          <span className="text-slate-500">
            {vendor.name}
          </span>
        </div>

        {/* Vendor heading */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">

          <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">

            <div className="flex min-w-0 gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0F2747] text-white">
                <Building2 size={24} />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-[-0.03em] text-[#0F2747]">
                    {vendor.name}
                  </h1>

                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-semibold text-emerald-700">
                    {vendor.status}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <MapPin size={12} />
                    {vendor.location}
                  </span>

                  <span className="flex items-center gap-1.5">
                    <Globe2 size={12} />
                    {vendor.category}
                  </span>

                  <span>
                    {vendor.experience}
                  </span>
                </div>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                  {vendor.description}
                </p>
              </div>
            </div>

            <Link
              to={`/vendors/${vendorId || 'harborline'}/assessment`}
              className="group inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0F2747] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#17385F] hover:shadow-md"
            >
              Start assessment
              <ArrowRight
                size={15}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </section>

        {/* Main content */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">

          {/* Profile information */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">
                Vendor information
              </p>

              <h2 className="mt-2 text-xl font-bold tracking-tight text-[#0F2747]">
                Available assurance information
              </h2>

              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
                Review the information available for this vendor before
                entering the structured assessment.
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {profileItems.map((item) => {
                const Icon = item.icon

                return (
                  <div
                    key={item.label}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Icon size={17} />
                      </div>

                      <CheckCircle2
                        size={15}
                        className="text-emerald-500"
                      />
                    </div>

                    <p className="mt-4 text-sm font-semibold text-[#0F2747]">
                      {item.label}
                    </p>

                    <p className="mt-1 text-[11px] text-slate-500">
                      {item.status}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Certifications */}
            <div className="mt-7 border-t border-slate-100 pt-6">
              <div className="flex items-center gap-2">
                <FileCheck2
                  size={16}
                  className="text-blue-600"
                />

                <p className="text-sm font-bold text-[#0F2747]">
                  Listed credentials
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {certifications.map((certification) => (
                  <span
                    key={certification}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600"
                  >
                    <CheckCircle2
                      size={12}
                      className="text-emerald-500"
                    />
                    {certification}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Assessment summary */}
          <aside className="space-y-6">

            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Current assurance score
              </p>

              <div className="mt-4 flex items-end gap-2">
                <span className="text-5xl font-bold tracking-[-0.05em] text-[#0F2747]">
                  {vendor.score}
                </span>

                <span className="mb-2 text-xs text-slate-400">
                  / 100
                </span>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${vendor.score}%` }}
                />
              </div>

              <p className="mt-3 text-[10px] leading-5 text-slate-500">
                Sample Phase 1 assessment value. It represents the type of
                information the buyer may see during the prototype journey.
              </p>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
              <ShieldCheck
                size={20}
                className="text-blue-600"
              />

              <h3 className="mt-4 text-sm font-bold text-[#0F2747]">
                Ready for structured assessment
              </h3>

              <p className="mt-2 text-xs leading-5 text-slate-600">
                Continue to the assessment to review the vendor across the
                assurance areas.
              </p>

              <Link
                to={`/vendors/${vendorId || 'harborline'}/assessment`}
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Continue
                <ArrowRight size={13} />
              </Link>
            </div>
          </aside>
        </div>

        {/* Bottom navigation */}
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to="/vendors"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#0F2747]"
          >
            <ArrowLeft size={13} />
            Back to vendors
          </Link>

          <Link
            to={`/vendors/${vendorId || 'harborline'}/assessment`}
            className="group inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            Start vendor assessment
            <ArrowRight
              size={13}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ProfileOverview