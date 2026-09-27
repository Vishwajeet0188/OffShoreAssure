import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileSearch,
  FileText,
  ShieldCheck,
} from 'lucide-react'

const contractChecks = [
  {
    title: 'IP ownership',
    description:
      'Review whether ownership of work products and intellectual property is clearly addressed.',
    status: 'Reviewed',
    type: 'success',
  },
  {
    title: 'Confidentiality',
    description:
      'Check confidentiality obligations and protection of information shared with the vendor.',
    status: 'Reviewed',
    type: 'success',
  },
  {
    title: 'Subcontracting rights',
    description:
      'Identify whether the vendor can subcontract work and what controls apply.',
    status: 'Needs review',
    type: 'warning',
  },
  {
    title: 'Data-use limits',
    description:
      'Review restrictions on how buyer data may be accessed, processed or reused.',
    status: 'Needs review',
    type: 'warning',
  },
  {
    title: 'Milestone and payment triggers',
    description:
      'Check whether delivery milestones and payment conditions are clearly defined.',
    status: 'Pending',
    type: 'pending',
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

function ContractOverview() {
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
                <FileText className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2563EB]">
                  Contract Engine
                </p>

                <h1 className="text-xl font-semibold text-[#172033]">
                  Contract assessment
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
                  Review the vendor contract, SOW or NDA against the terms
                  relevant to an offshore engagement.
                </p>
              </div>

              <div className="rounded-2xl bg-[#F7F9FC] px-5 py-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Sample score
                </p>

                <p className="mt-1 text-3xl font-bold text-[#0F2747]">
                  68<span className="text-lg text-[#94A3B8]">/100</span>
                </p>
              </div>
            </div>

            <div className="border-t border-[#E2E8F0] pt-5">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-[#172033]">
                  Contract assessment progress
                </span>

                <span className="font-semibold text-[#2563EB]">45%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
                <div className="h-full w-[45%] rounded-full bg-[#2563EB]" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#E2E8F0] bg-[#0F2747] p-7 text-white shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <FileSearch className="h-5 w-5" />
            </div>

            <h3 className="mt-5 text-lg font-semibold">
              Contract review flow
            </h3>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              The prototype shows how uploaded contracts, SOWs and NDAs could
              be reviewed against relevant offshore contract requirements.
            </p>

            <div className="mt-6 flex items-center gap-2 text-sm font-medium text-white">
              <ShieldCheck className="h-4 w-4" />
              Clause-focused assessment
            </div>
          </section>
        </div>

        <section className="mb-6 rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                <FileText className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748B]">
                  Sample source document
                </p>

                <h2 className="mt-1 font-semibold text-[#172033]">
                  Harborline Digital — Offshore Services SOW
                </h2>

                <p className="mt-1 text-sm text-[#64748B]">
                  Sample document used to demonstrate the Phase 1 contract
                  review interface.
                </p>
              </div>
            </div>

            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#F1F5F9] px-3 py-1.5 text-xs font-medium text-[#64748B]">
              Prototype document
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
          <div className="border-b border-[#E2E8F0] px-7 py-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold text-[#172033]">
                  Contract checks
                </h2>

                <p className="mt-1 text-sm text-[#64748B]">
                  Sample clause areas that the Contract Engine can assess.
                </p>
              </div>

              <span className="rounded-full bg-[#F1F5F9] px-3 py-1.5 text-xs font-medium text-[#64748B]">
                5 clause areas
              </span>
            </div>
          </div>

          <div className="divide-y divide-[#E2E8F0]">
            {contractChecks.map((item, index) => (
              <div
                key={item.title}
                className="flex flex-col gap-4 px-7 py-5 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F7F9FC] text-xs font-semibold text-[#64748B]">
                    {String(index + 1).padStart(2, '0')}
                  </div>

                  <div>
                    <h3 className="font-semibold text-[#172033]">
                      {item.title}
                    </h3>

                    <p className="mt-1 max-w-2xl text-sm leading-5 text-[#64748B]">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 md:min-w-[160px] md:justify-end">
                  <StatusIcon type={item.type} />

                  <span
                    className={`text-sm font-medium ${
                      item.type === 'success'
                        ? 'text-[#16A34A]'
                        : item.type === 'warning'
                          ? 'text-[#D97706]'
                          : 'text-[#64748B]'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#D97706]" />

            <div>
              <h3 className="font-semibold text-[#92400E]">
                Sample contract flags
              </h3>

              <p className="mt-1 text-sm leading-6 text-[#92400E]">
                The sample assessment highlights subcontracting rights and
                data-use limits for further review. In the intended platform,
                missing, ambiguous or unfavorable terms can be surfaced for
                buyer review.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            to={`/vendors/${vendor}/compliance`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-3 text-sm font-semibold text-[#172033] transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous: Compliance
          </Link>

          <Link
            to={`/vendors/${vendor}/data-transfer`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1D4ED8]"
          >
            Continue to data transfer
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  )
}

export default ContractOverview