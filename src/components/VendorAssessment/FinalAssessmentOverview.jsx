import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  FileText,
  Globe2,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'

const assuranceAreas = [
  {
    number: '01',
    title: 'Compliance',
    score: 72,
    status: 'Review required',
    description:
      'Vendor credentials, certifications, insurance, subcontracting and security controls.',
    icon: ShieldCheck,
    route: 'compliance',
    type: 'warning',
  },
  {
    number: '02',
    title: 'Contract',
    score: 68,
    status: 'Review required',
    description:
      'Contract clauses covering IP ownership, confidentiality, subcontracting and data use.',
    icon: FileText,
    route: 'contract',
    type: 'warning',
  },
  {
    number: '03',
    title: 'Data transfer',
    score: 76,
    status: 'Review required',
    description:
      'Transfer purpose, safeguards, destination and relevant UK GDPR requirements.',
    icon: Globe2,
    route: 'data-transfer',
    type: 'warning',
  },
  {
    number: '04',
    title: 'Delivery assurance',
    score: 58,
    status: 'In progress',
    description:
      'Vendor progress, milestone deliverables and supporting delivery evidence.',
    icon: TrendingUp,
    route: 'delivery',
    type: 'warning',
  },
]

const flags = [
  {
    title: 'ISO certification approaching expiry',
    source: 'Compliance Engine',
  },
  {
    title: 'Subcontracting and data-use clauses require review',
    source: 'Contract Engine',
  },
  {
    title: 'Transfer safeguards require review',
    source: 'Data Transfer Engine',
  },
]

function FinalAssessmentOverview() {
  const { vendorId } = useParams()
  const vendor = vendorId || 'harborline'

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <header className="border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <Link
              to={`/vendors/${vendor}/evidence`}
              className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-[#64748B] transition hover:text-[#0F2747]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to governance evidence
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F2747] text-white">
                <FileCheck2 className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
                  Buyer Decision View
                </p>

                <h1 className="text-xl font-semibold text-[#172033]">
                  Final vendor assessment
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
        <section className="mb-8 rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-sm">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-[#64748B]">
                Vendor under assessment
              </p>

              <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#172033]">
                Harborline Digital
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#64748B]">
                Unified buyer view of the sample assurance assessment across
                compliance, contract, data transfer, delivery and governance
                evidence.
              </p>
            </div>

            <div className="flex items-center gap-5 rounded-2xl bg-[#F7F9FC] px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Overall sample score
                </p>

                <p className="mt-1 text-4xl font-bold text-[#0F2747]">
                  68
                  <span className="text-lg font-medium text-[#94A3B8]">
                    /100
                  </span>
                </p>
              </div>

              <div className="h-12 w-px bg-[#E2E8F0]" />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Assessment state
                </p>

                <p className="mt-1 text-sm font-semibold text-[#D97706]">
                  Review required
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {assuranceAreas.map((area) => {
            const Icon = area.icon

            return (
              <Link
                key={area.title}
                to={`/vendors/${vendor}/${area.route}`}
                className="group rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#CBD5E1] hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                    <Icon className="h-5 w-5" />
                  </div>

                  <span className="text-xs font-semibold text-[#94A3B8]">
                    {area.number}
                  </span>
                </div>

                <h3 className="mt-5 font-semibold text-[#172033]">
                  {area.title}
                </h3>

                <p className="mt-2 text-sm leading-5 text-[#64748B]">
                  {area.description}
                </p>

                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold text-[#0F2747]">
                      {area.score}
                      <span className="text-sm font-medium text-[#94A3B8]">
                        /100
                      </span>
                    </p>

                    <p className="mt-1 text-xs font-medium text-[#D97706]">
                      {area.status}
                    </p>
                  </div>

                  <ChevronRight className="h-5 w-5 text-[#94A3B8] transition group-hover:translate-x-1 group-hover:text-[#2563EB]" />
                </div>
              </Link>
            )
          })}
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
            <div className="border-b border-[#E2E8F0] px-7 py-6">
              <h2 className="text-lg font-semibold text-[#172033]">
                Assessment flags
              </h2>

              <p className="mt-1 text-sm text-[#64748B]">
                Sample issues surfaced across the assurance engines.
              </p>
            </div>

            <div className="divide-y divide-[#E2E8F0]">
              {flags.map((flag) => (
                <div
                  key={flag.title}
                  className="flex items-start gap-4 px-7 py-5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF7ED] text-[#D97706]">
                    <AlertTriangle className="h-5 w-5" />
                  </div>

                  <div>
                    <h3 className="font-semibold text-[#172033]">
                      {flag.title}
                    </h3>

                    <p className="mt-1 text-sm text-[#64748B]">
                      Source: {flag.source}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0FDF4] text-[#16A34A]">
              <CheckCircle2 className="h-5 w-5" />
            </div>

            <h2 className="mt-5 text-lg font-semibold text-[#172033]">
              Governance evidence
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#64748B]">
              The assessment has a sample evidence chain linking engine
              results, flags and source records.
            </p>

            <div className="mt-6 rounded-xl bg-[#F7F9FC] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#64748B]">
                  Evidence records
                </span>

                <span className="font-semibold text-[#172033]">
                  42
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-[#64748B]">
                  Timestamped records
                </span>

                <CheckCircle2 className="h-4 w-4 text-[#16A34A]" />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-[#64748B]">
                  Source references
                </span>

                <CheckCircle2 className="h-4 w-4 text-[#16A34A]" />
              </div>
            </div>

            <Link
              to={`/vendors/${vendor}/evidence`}
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
            >
              View evidence chain
              <ChevronRight className="h-4 w-4" />
            </Link>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#D97706]" />

            <div>
              <h3 className="font-semibold text-[#92400E]">
                Buyer review required
              </h3>

              <p className="mt-1 text-sm leading-6 text-[#92400E]">
                This sample assessment contains unresolved flags across
                multiple assurance areas. The prototype presents these items
                for buyer review rather than making an automated outsourcing
                decision.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            to={`/vendors/${vendor}/evidence`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-semibold text-[#172033] transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous: Governance evidence
          </Link>

          <Link
            to="/buyer/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1D4ED8]"
          >
            Return to buyer dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  )
}

export default FinalAssessmentOverview