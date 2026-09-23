import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  Flag,
  LogOut,
  Plus,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

const assuranceAreas = [
  {
    title: 'Compliance',
    description: 'Vendor credentials and compliance information',
    status: 'In assessment',
    icon: ShieldCheck,
  },
  {
    title: 'Contract',
    description: 'Contract and engagement terms',
    status: 'Ready for review',
    icon: FileCheck2,
  },
  {
    title: 'Data transfer',
    description: 'Regulatory and transfer considerations',
    status: 'Ready for review',
    icon: ShieldCheck,
  },
  {
    title: 'Delivery',
    description: 'Progress and milestone assurance',
    status: 'Not started',
    icon: Truck,
  },
]

const recentActivity = [
  {
    title: 'Compliance assessment updated',
    vendor: 'Harborline Digital',
    time: '12 min ago',
    status: 'Updated',
  },
  {
    title: 'Contract assessment ready',
    vendor: 'Harborline Digital',
    time: '38 min ago',
    status: 'Review',
  },
  {
    title: 'Evidence record added',
    vendor: 'Harborline Digital',
    time: '1 hr ago',
    status: 'Recorded',
  },
]

function DashboardOverview() {
  const navigate = useNavigate()

  const handleLogout = () => {
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC]">

      {/* Top navigation */}
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

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#0F2747]"
            >
              <Bell size={17} />

              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-blue-600" />
            </button>

            <div className="hidden h-7 w-px bg-slate-200 sm:block" />

            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                JD
              </div>

              <div>
                <p className="text-xs font-semibold text-[#0F2747]">
                  Jordan Davis
                </p>

                <p className="text-[10px] text-slate-400">
                  Buyer
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-red-600"
              title="Return to website"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-7 lg:px-8 lg:py-9">

        {/* Welcome */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-600">
              Buyer dashboard
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-[#0F2747]">
              Assurance overview
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Review vendor relationships, assessment progress and supporting
              evidence from one buyer workspace.
            </p>
          </div>

          <Link
            to="/vendors"
            className="group inline-flex w-fit items-center gap-2 rounded-lg bg-[#0F2747] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#17385F] hover:shadow-md"
          >
            <Plus size={16} />
            Find a vendor
            <ArrowRight
              size={14}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>

        {/* Overview stats */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">
              Active vendors
            </p>

            <p className="mt-2 text-2xl font-bold tracking-tight text-[#0F2747]">
              4
            </p>

            <p className="mt-2 text-[11px] text-emerald-600">
              2 currently under assessment
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">
              Assessments
            </p>

            <p className="mt-2 text-2xl font-bold tracking-tight text-[#0F2747]">
              7
            </p>

            <p className="mt-2 text-[11px] text-slate-500">
              Across active relationships
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">
              Evidence records
            </p>

            <p className="mt-2 text-2xl font-bold tracking-tight text-[#0F2747]">
              42
            </p>

            <p className="mt-2 text-[11px] text-slate-500">
              Linked to assessments
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs text-amber-700">
              Review flags
            </p>

            <p className="mt-2 text-2xl font-bold tracking-tight text-amber-900">
              3
            </p>

            <p className="mt-2 text-[11px] text-amber-700">
              Require buyer attention
            </p>
          </div>
        </div>

        {/* Main content */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">

          {/* Current vendor */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">

            <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">
                  Current assessment
                </p>

                <h2 className="mt-1 text-lg font-bold text-[#0F2747]">
                  Harborline Digital
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Offshore software development · Sample vendor
                </p>
              </div>

              <Link
                to="/vendors/harborline/assessment"
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2747] transition-colors hover:bg-slate-50"
              >
                Open assessment
                <ChevronRight size={14} />
              </Link>
            </div>

            <div className="grid md:grid-cols-[190px_1fr]">

              {/* Score */}
              <div className="border-b border-slate-200 p-6 md:border-b-0 md:border-r">
                <p className="text-xs text-slate-500">
                  Assurance score
                </p>

                <div className="mt-3 flex items-end gap-1">
                  <span className="text-4xl font-bold tracking-tight text-[#0F2747]">
                    86
                  </span>

                  <span className="mb-1 text-xs text-slate-400">
                    / 100
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-[86%] rounded-full bg-blue-600" />
                </div>

                <div className="mt-4 flex items-center gap-1.5 text-[10px] text-emerald-600">
                  <CheckCircle2 size={12} />
                  Assessment active
                </div>
              </div>

              {/* Assurance areas */}
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[#0F2747]">
                    Assurance areas
                  </p>

                  <span className="text-[10px] font-medium text-slate-400">
                    4 operational engines
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {assuranceAreas.map((area) => {
                    const Icon = area.icon

                    return (
                      <div
                        key={area.title}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <Icon size={15} />
                          </div>

                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        </div>

                        <p className="mt-3 text-sm font-semibold text-[#0F2747]">
                          {area.title}
                        </p>

                        <p className="mt-1 text-[10px] leading-4 text-slate-500">
                          {area.description}
                        </p>

                        <p className="mt-3 text-[10px] font-semibold text-slate-500">
                          {area.status}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Activity */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[#0F2747]">
                  Recent activity
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Latest assessment events
                </p>
              </div>

              <button
                type="button"
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-700"
              >
                View all
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {recentActivity.map((activity) => (
                <div
                  key={activity.title}
                  className="flex gap-3"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <CheckCircle2 size={14} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#0F2747]">
                      {activity.title}
                    </p>

                    <p className="mt-1 text-[10px] text-slate-500">
                      {activity.vendor}
                    </p>

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        {activity.time}
                      </span>

                      <span
                        className={`rounded-md px-2 py-1 text-[9px] font-semibold ${
                          activity.status === 'Review'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {activity.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Attention */}
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <Flag
                  size={15}
                  className="mt-0.5 shrink-0 text-amber-600"
                />

                <div>
                  <p className="text-xs font-semibold text-amber-900">
                    3 items need review
                  </p>

                  <p className="mt-1 text-[10px] leading-5 text-amber-800/80">
                    Open the active assessment to review the current flags and
                    supporting evidence.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Bottom navigation */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">

          <Link
            to="/vendors"
            className="group rounded-xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#0F2747]">
                Vendor discovery
              </p>

              <ArrowRight
                size={15}
                className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600"
              />
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Explore vendors available for assessment.
            </p>
          </Link>

          <Link
            to="/vendors/harborline"
            className="group rounded-xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#0F2747]">
                Vendor profile
              </p>

              <ArrowRight
                size={15}
                className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600"
              />
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              View the vendor information before starting assessment.
            </p>
          </Link>

          <Link
            to="/vendors/harborline/evidence"
            className="group rounded-xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#0F2747]">
                Governance evidence
              </p>

              <ArrowRight
                size={15}
                className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600"
              />
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Review the evidence supporting the assessment trail.
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default DashboardOverview