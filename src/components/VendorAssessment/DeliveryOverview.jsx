import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Flag,
  Milestone,
//   PackageCheck,
  TrendingUp,
} from 'lucide-react'

const milestones = [
  {
    title: 'Project kickoff',
    description:
      'Initial engagement setup and delivery expectations recorded.',
    status: 'Completed',
    type: 'success',
    progress: '100%',
  },
  {
    title: 'Requirements and planning',
    description:
      'Project requirements and planned delivery activities documented.',
    status: 'Completed',
    type: 'success',
    progress: '100%',
  },
  {
    title: 'Development milestone',
    description:
      'Vendor progress and supporting delivery evidence are being reviewed.',
    status: 'In progress',
    type: 'warning',
    progress: '65%',
  },
  {
    title: 'Milestone deliverable',
    description:
      'Expected deliverable and supporting evidence are awaiting review.',
    status: 'Pending',
    type: 'pending',
    progress: '0%',
  },
]

const deliveryEvidence = [
  {
    title: 'Progress report',
    description: 'Sample vendor progress update.',
    status: 'Received',
  },
  {
    title: 'Milestone evidence',
    description: 'Sample evidence linked to the current milestone.',
    status: 'Received',
  },
  {
    title: 'Deliverable review',
    description: 'Buyer review of the expected milestone deliverable.',
    status: 'Pending',
  },
]

function StatusIcon({ type }) {
  if (type === 'success') {
    return <CheckCircle2 className="h-5 w-5 text-[#16A34A]" />
  }

  if (type === 'warning') {
    return <AlertTriangle className="h-5 w-5 text-[#D97706]" />
  }

  return <Clock3 className="h-5 w-5 text-[#64748B]" />
}

function DeliveryOverview() {
  const { vendorId } = useParams()
  const vendor = vendorId || 'harborline'

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <header className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <Link
              to={`/vendors/${vendor}/assessment`}
              className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-[#64748B] transition hover:text-[#0F2747]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to assessment
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F2747] text-white">
                <TrendingUp className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
                  Delivery Assurance
                </p>

                <h1 className="text-xl font-semibold text-[#172033]">
                  Delivery assurance
                </h1>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <span className="rounded-full bg-[#EFF6FF] px-3 py-1.5 text-xs font-semibold text-[#2563EB]">
              Phase 1 Prototype
            </span>

            <span className="text-sm text-[#64748B]">
              Sample assessment
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-sm">
            <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div>
                <p className="mb-2 text-sm font-medium text-[#64748B]">
                  Vendor
                </p>

                <h2 className="text-2xl font-semibold tracking-tight text-[#172033]">
                  Harborline Digital
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">
                  Track offshore vendor progress, milestone delivery and the
                  evidence supporting the engagement.
                </p>
              </div>

              <div className="rounded-2xl bg-[#F7F9FC] px-5 py-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Sample status
                </p>

                <p className="mt-1 text-xl font-bold text-[#0F2747]">
                  In progress
                </p>
              </div>
            </div>

            <div className="border-t border-[#E2E8F0] pt-5">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-[#172033]">
                  Delivery assurance progress
                </span>

                <span className="font-semibold text-[#2563EB]">58%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
                <div className="h-full w-[58%] rounded-full bg-[#2563EB]" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#E2E8F0] bg-[#0F2747] p-7 text-white shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <Milestone className="h-5 w-5" />
            </div>

            <h3 className="mt-5 text-lg font-semibold">
              Delivery monitoring
            </h3>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              The prototype brings progress updates, milestone deliverables
              and supporting evidence into one buyer-facing view.
            </p>

            <div className="mt-6 flex items-center gap-2 text-sm font-medium text-white">
              <Flag className="h-4 w-4" />
              1 milestone requires review
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
          <div className="border-b border-[#E2E8F0] px-7 py-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold text-[#172033]">
                  Delivery milestones
                </h2>

                <p className="mt-1 text-sm text-[#64748B]">
                  Sample milestones demonstrating vendor progress and delivery
                  tracking.
                </p>
              </div>

              <span className="rounded-full bg-[#F1F5F9] px-3 py-1.5 text-xs font-medium text-[#64748B]">
                4 milestones
              </span>
            </div>
          </div>

          <div className="divide-y divide-[#E2E8F0]">
            {milestones.map((milestone, index) => (
              <div
                key={milestone.title}
                className="px-7 py-6"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F7F9FC] text-xs font-semibold text-[#64748B]">
                      {String(index + 1).padStart(2, '0')}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-semibold text-[#172033]">
                          {milestone.title}
                        </h3>

                        <div className="flex items-center gap-2">
                          <StatusIcon type={milestone.type} />

                          <span
                            className={`text-sm font-medium ${
                              milestone.type === 'success'
                                ? 'text-[#16A34A]'
                                : milestone.type === 'warning'
                                  ? 'text-[#D97706]'
                                  : 'text-[#64748B]'
                            }`}
                          >
                            {milestone.status}
                          </span>
                        </div>
                      </div>

                      <p className="mt-2 max-w-2xl text-sm leading-5 text-[#64748B]">
                        {milestone.description}
                      </p>
                    </div>
                  </div>

                  <div className="w-full lg:w-48">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-[#64748B]">
                        Progress
                      </span>

                      <span className="font-semibold text-[#172033]">
                        {milestone.progress}
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
                      <div
                        className="h-full rounded-full bg-[#2563EB]"
                        style={{ width: milestone.progress }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
          <div className="border-b border-[#E2E8F0] px-7 py-6">
            <div>
              <h2 className="text-lg font-semibold text-[#172033]">
                Delivery evidence
              </h2>

              <p className="mt-1 text-sm text-[#64748B]">
                Sample evidence records associated with vendor delivery.
              </p>
            </div>
          </div>

          <div className="divide-y divide-[#E2E8F0]">
            {deliveryEvidence.map((item) => (
              <div
                key={item.title}
                className="flex flex-col gap-4 px-7 py-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                    <FileCheck2 className="h-5 w-5" />
                  </div>

                  <div>
                    <h3 className="font-semibold text-[#172033]">
                      {item.title}
                    </h3>

                    <p className="mt-1 text-sm text-[#64748B]">
                      {item.description}
                    </p>
                  </div>
                </div>

                <span
                  className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${
                    item.status === 'Received'
                      ? 'bg-[#F0FDF4] text-[#16A34A]'
                      : 'bg-[#F8FAFC] text-[#64748B]'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#D97706]" />

            <div>
              <h3 className="font-semibold text-[#92400E]">
                Sample delivery flag
              </h3>

              <p className="mt-1 text-sm leading-6 text-[#92400E]">
                The current development milestone is still in progress and its
                expected deliverable requires review. This sample flag
                demonstrates how delivery concerns can be surfaced alongside
                supporting evidence.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            to={`/vendors/${vendor}/data-transfer`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-semibold text-[#172033] transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous: Data transfer
          </Link>

          <Link
            to={`/vendors/${vendor}/evidence`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1D4ED8]"
          >
            Continue to governance evidence
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  )
}

export default DeliveryOverview