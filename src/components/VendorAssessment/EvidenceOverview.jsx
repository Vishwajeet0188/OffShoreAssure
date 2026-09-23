import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  GitBranch,
  ShieldCheck,
} from 'lucide-react'

const evidenceRecords = [
  {
    time: '09:42',
    date: '22 Sep 2026',
    title: 'Compliance assessment recorded',
    engine: 'Compliance Engine',
    description:
      'Sample compliance inputs and assessment result recorded for the vendor.',
    status: 'Verified',
    icon: ShieldCheck,
  },
  {
    time: '10:08',
    date: '22 Sep 2026',
    title: 'Contract review flag created',
    engine: 'Contract Engine',
    description:
      'Sample flag recorded for subcontracting rights and data-use limits.',
    status: 'Flagged',
    icon: FileText,
  },
  {
    time: '10:26',
    date: '22 Sep 2026',
    title: 'Transfer assessment updated',
    engine: 'Data Transfer Engine',
    description:
      'Sample transfer safeguards review recorded against the vendor assessment.',
    status: 'Under review',
    icon: GitBranch,
  },
  {
    time: '10:51',
    date: '22 Sep 2026',
    title: 'Delivery milestone updated',
    engine: 'Delivery Assurance',
    description:
      'Sample progress and milestone evidence recorded for the engagement.',
    status: 'Verified',
    icon: FileCheck2,
  },
]

const evidenceSummary = [
  {
    label: 'Assessment inputs',
    value: '12',
    description: 'Sample inputs recorded',
  },
  {
    label: 'Decision rules',
    value: '8',
    description: 'Sample rules evaluated',
  },
  {
    label: 'Flags',
    value: '3',
    description: 'Items requiring review',
  },
  {
    label: 'Evidence records',
    value: '42',
    description: 'Sample audit records',
  },
]

function GovernanceEvidenceOverview() {
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
                <GitBranch className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
                  Governance Evidence
                </p>

                <h1 className="text-xl font-semibold text-[#172033]">
                  Evidence chain
                </h1>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <span className="rounded-full bg-[#EFF6FF] px-3 py-1.5 text-xs font-semibold text-[#2563EB]">
              Phase 1 Prototype
            </span>

            <span className="text-sm text-[#64748B]">
              Sample evidence
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="mb-8 rounded-2xl border border-[#E2E8F0] bg-[#0F2747] p-7 text-white shadow-sm">
          <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
                Harborline Digital
              </p>

              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                AI governance evidence chain
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-300">
                A sample chronological record showing how assessment inputs,
                decision rules, scores, flags and access decisions can be
                retained as governance evidence.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3 rounded-2xl bg-white/10 px-5 py-4">
              <CheckCircle2 className="h-5 w-5 text-[#4ADE80]" />

              <div>
                <p className="text-xs text-slate-300">
                  Evidence status
                </p>
                <p className="font-semibold">
                  Chain maintained
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {evidenceSummary.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm"
            >
              <p className="text-sm font-medium text-[#64748B]">
                {item.label}
              </p>

              <p className="mt-2 text-3xl font-bold text-[#0F2747]">
                {item.value}
              </p>

              <p className="mt-1 text-xs text-[#94A3B8]">
                {item.description}
              </p>
            </div>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_0.5fr]">
          <section className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
            <div className="border-b border-[#E2E8F0] px-7 py-6">
              <h2 className="text-lg font-semibold text-[#172033]">
                Evidence timeline
              </h2>

              <p className="mt-1 text-sm text-[#64748B]">
                Sample timestamped records created across the assurance engines.
              </p>
            </div>

            <div className="divide-y divide-[#E2E8F0]">
              {evidenceRecords.map((record) => {
                const Icon = record.icon

                return (
                  <div
                    key={`${record.date}-${record.time}-${record.title}`}
                    className="flex gap-4 px-7 py-6"
                  >
                    <div className="relative">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-[#172033]">
                              {record.title}
                            </h3>

                            <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[11px] font-semibold text-[#64748B]">
                              {record.engine}
                            </span>
                          </div>

                          <p className="mt-2 text-sm leading-5 text-[#64748B]">
                            {record.description}
                          </p>
                        </div>

                        <div className="shrink-0 text-left sm:text-right">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] sm:justify-end">
                            <Clock3 className="h-3.5 w-3.5" />
                            {record.time}
                          </div>

                          <p className="mt-1 text-xs text-[#94A3B8]">
                            {record.date}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${
                            record.status === 'Verified'
                              ? 'bg-[#F0FDF4] text-[#16A34A]'
                              : record.status === 'Flagged'
                                ? 'bg-[#FFF7ED] text-[#D97706]'
                                : 'bg-[#EFF6FF] text-[#2563EB]'
                          }`}
                        >
                          {record.status}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
              <FileCheck2 className="h-5 w-5" />
            </div>

            <h2 className="mt-5 text-lg font-semibold text-[#172033]">
              Source evidence
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#64748B]">
              Governance records can be linked back to the source documents
              and assessment information that produced them.
            </p>

            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Source
                </p>

                <p className="mt-1 text-sm font-medium text-[#172033]">
                  Vendor compliance record
                </p>
              </div>

              <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Source
                </p>

                <p className="mt-1 text-sm font-medium text-[#172033]">
                  Offshore Services SOW
                </p>
              </div>

              <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Source
                </p>

                <p className="mt-1 text-sm font-medium text-[#172033]">
                  Transfer assessment
                </p>
              </div>
            </div>
          </aside>
        </div>

        <section className="mt-6 rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] p-6">
          <div className="flex items-start gap-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#2563EB]" />

            <div>
              <h3 className="font-semibold text-[#1E3A8A]">
                Governance record
              </h3>

              <p className="mt-1 text-sm leading-6 text-[#1E40AF]">
                This Phase 1 interface demonstrates the concept of maintaining
                timestamped evidence around assessment decisions. All records
                shown here are sample prototype data and are not generated by
                a live compliance engine.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            to={`/vendors/${vendor}/delivery`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-semibold text-[#172033] transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous: Delivery assurance
          </Link>

          <Link
            to={`/vendors/${vendor}/final-assessment`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1D4ED8]"
          >
            Continue to final assessment
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  )
}

export default GovernanceEvidenceOverview