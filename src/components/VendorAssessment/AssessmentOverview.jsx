import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  FileText,
  Globe2,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'

const assessmentSteps = [
  {
    number: '01',
    title: 'Compliance',
    description:
      'Vendor credentials, certifications, insurance, subcontracting and security controls.',
    status: 'In progress',
    progress: 72,
    route: 'compliance',
    icon: ShieldCheck,
  },
  {
    number: '02',
    title: 'Contract',
    description:
      'Review IP ownership, confidentiality, subcontracting, data-use and payment terms.',
    status: 'Ready for review',
    progress: 45,
    route: 'contract',
    icon: FileText,
  },
  {
    number: '03',
    title: 'Data transfer',
    description:
      'Review transfer safeguards, destination and relevant UK GDPR requirements.',
    status: 'Ready for review',
    progress: 35,
    route: 'data-transfer',
    icon: Globe2,
  },
  {
    number: '04',
    title: 'Delivery assurance',
    description:
      'Track vendor progress, milestone deliverables and supporting evidence.',
    status: 'Not started',
    progress: 0,
    route: 'delivery',
    icon: TrendingUp,
  },
]

function AssessmentOverview() {
  const { vendorId } = useParams()
  const vendor = vendorId || 'harborline'

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <header className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <Link
              to={`/vendors/${vendor}`}
              className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-[#64748B] transition hover:text-[#0F2747]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to vendor profile
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F2747] text-white">
                <FileCheck2 className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
                  Vendor Assessment
                </p>

                <h1 className="text-xl font-semibold text-[#172033]">
                  Assessment overview
                </h1>
              </div>
            </div>
          </div>

          <span className="hidden rounded-full bg-[#EFF6FF] px-3 py-1.5 text-xs font-semibold text-[#2563EB] sm:inline-flex">
            Phase 1 Prototype
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="mb-8 rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-sm">
          <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-medium text-[#64748B]">
                Vendor under assessment
              </p>

              <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#172033]">
                Harborline Digital
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#64748B]">
                Complete the assurance assessment before reaching the final
                buyer decision view.
              </p>
            </div>

            <div className="flex gap-8 rounded-2xl bg-[#F7F9FC] px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Overall score
                </p>

                <p className="mt-1 text-3xl font-bold text-[#0F2747]">
                  86<span className="text-base text-[#94A3B8]">/100</span>
                </p>
              </div>

              <div className="w-px bg-[#E2E8F0]" />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Assessment progress
                </p>

                <p className="mt-1 text-3xl font-bold text-[#2563EB]">
                  38%
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          {assessmentSteps.map((step, index) => (
            <Link
              key={step.title}
              to={`/vendors/${vendor}/${step.route}`}
              className="group relative"
            >
              <div
                className={`absolute left-1/2 top-5 hidden h-px w-full bg-[#E2E8F0] md:block ${
                  index === assessmentSteps.length - 1 ? 'md:hidden' : ''
                }`}
              />

              <div className="relative rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#CBD5E1] hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                    <step.icon className="h-5 w-5" />
                  </div>

                  <span className="text-xs font-semibold text-[#94A3B8]">
                    {step.number}
                  </span>
                </div>

                <h3 className="mt-5 font-semibold text-[#172033]">
                  {step.title}
                </h3>

                <p className="mt-2 min-h-[60px] text-sm leading-5 text-[#64748B]">
                  {step.description}
                </p>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-[#64748B]">
                      Progress
                    </span>

                    <span className="text-xs font-semibold text-[#172033]">
                      {step.progress}%
                    </span>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]">
                    <div
                      className="h-full rounded-full bg-[#2563EB]"
                      style={{ width: `${step.progress}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold ${
                      step.status === 'In progress'
                        ? 'text-[#2563EB]'
                        : step.status === 'Ready for review'
                          ? 'text-[#D97706]'
                          : 'text-[#64748B]'
                    }`}
                  >
                    {step.status}
                  </span>

                  <ChevronRight className="h-4 w-4 text-[#94A3B8] transition group-hover:translate-x-1 group-hover:text-[#2563EB]" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
            <div className="border-b border-[#E2E8F0] px-7 py-6">
              <h2 className="text-lg font-semibold text-[#172033]">
                Assessment journey
              </h2>

              <p className="mt-1 text-sm text-[#64748B]">
                Follow the assurance flow from operational checks through
                governance evidence and the final assessment.
              </p>
            </div>

            <div className="divide-y divide-[#E2E8F0]">
              <Link
                to={`/vendors/${vendor}/evidence`}
                className="group flex items-center justify-between px-7 py-5 transition hover:bg-[#F8FAFC]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0FDF4] text-[#16A34A]">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>

                  <div>
                    <h3 className="font-semibold text-[#172033]">
                      Governance evidence
                    </h3>

                    <p className="mt-1 text-sm text-[#64748B]">
                      Review the timestamped evidence chain generated across
                      the assessment.
                    </p>
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-[#94A3B8] transition group-hover:translate-x-1 group-hover:text-[#2563EB]" />
              </Link>

              <Link
                to={`/vendors/${vendor}/final-assessment`}
                className="group flex items-center justify-between px-7 py-5 transition hover:bg-[#F8FAFC]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                    <FileCheck2 className="h-5 w-5" />
                  </div>

                  <div>
                    <h3 className="font-semibold text-[#172033]">
                      Final assessment
                    </h3>

                    <p className="mt-1 text-sm text-[#64748B]">
                      View the unified buyer-facing assessment and outstanding
                      review flags.
                    </p>
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-[#94A3B8] transition group-hover:translate-x-1 group-hover:text-[#2563EB]" />
              </Link>
            </div>
          </section>

          <aside className="rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#D97706]">
              <CircleAlert className="h-5 w-5" />
            </div>

            <h2 className="mt-5 text-lg font-semibold text-[#92400E]">
              Review status
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#92400E]">
              Sample assessment flags remain across the assurance areas.
              Continue through the engines before reviewing the final
              assessment.
            </p>

            <Link
              to={`/vendors/${vendor}/compliance`}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#D97706] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#B45309]"
            >
              Continue assessment
              <ArrowRight className="h-4 w-4" />
            </Link>
          </aside>
        </div>
      </main>
    </div>
  )
}

export default AssessmentOverview