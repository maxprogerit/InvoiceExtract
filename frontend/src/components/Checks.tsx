import { useId } from 'react'
import type { ExtractedInvoice, ValidationIssue } from '../api/types'
import { buildChecks, notes, type CheckState } from '../lib/checks'
import { AlertIcon, CheckIcon, InfoIcon } from './Icons'

const MARK: Record<CheckState, { tone: string; label: string }> = {
  ok: { tone: 'bg-ok/15 text-ok', label: 'Passed' },
  bad: { tone: 'bg-bad/15 text-bad', label: 'Failed' },
  unknown: { tone: 'bg-surface-2 text-muted', label: 'Could not be checked' },
}

function Mark({ state }: { state: CheckState }) {
  const Icon = state === 'ok' ? CheckIcon : state === 'bad' ? AlertIcon : InfoIcon
  return (
    <span className={`flex size-5 shrink-0 items-center justify-center rounded-full ${MARK[state].tone}`}>
      <Icon className="size-3" />
      <span className="sr-only">{MARK[state].label}: </span>
    </span>
  )
}

export function Checks({ data, issues }: { data: ExtractedInvoice; issues: ValidationIssue[] }) {
  const titleId = useId()
  const checks = buildChecks(data, issues)
  const extra = notes(issues)
  return (
    <section aria-labelledby={titleId} className="mt-6 border-t border-line pt-5">
      <h3 id={titleId} className="caption mb-3">
        Validation
      </h3>
      <ul className="space-y-2.5">
        {checks.map((check) => (
          <li key={check.id} className="flex items-start gap-3 text-sm" data-check={check.id} data-state={check.state}>
            <Mark state={check.state} />
            <div className="min-w-0">
              <span className={check.state === 'unknown' ? 'text-muted' : ''}>{check.label}</span>
              {check.messages.map((message, i) => (
                <p key={i} className="mt-0.5 text-xs font-medium text-bad">
                  {message}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {extra.length > 0 && (
        <div className="mt-4 rounded-lg bg-surface-2 p-3">
          <p className="caption mb-1.5">Notes</p>
          <ul className="space-y-1">
            {extra.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted">
                <InfoIcon className="mt-px size-3.5" />
                <span>{note.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 font-mono text-[0.68rem] text-muted">
        Checked by plain code with exact decimals (tolerance 0.01), not by the AI.
      </p>
    </section>
  )
}
