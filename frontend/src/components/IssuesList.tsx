import type { ValidationIssue } from '../api/types'
import { AlertIcon, CheckIcon, InfoIcon } from './Icons'

export function IssuesList({ issues }: { issues: ValidationIssue[] }) {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  return (
    <section
      aria-labelledby="issues-title"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <h3 id="issues-title" className="mb-3 text-base font-semibold">
        Validation report
      </h3>

      {issues.length === 0 ? (
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
          <CheckIcon /> All checks passed. Nothing to review.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
            {errors.length} {errors.length === 1 ? 'problem' : 'problems'} · {warnings.length}{' '}
            {warnings.length === 1 ? 'note' : 'notes'}
          </p>
          <ul className="space-y-2">
            {[...errors, ...warnings].map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {issue.severity === 'error' ? (
                  <AlertIcon className="mt-0.5 text-red-700 dark:text-red-400" />
                ) : (
                  <InfoIcon className="mt-0.5 text-amber-700 dark:text-amber-400" />
                )}
                <span>
                  <span className="font-medium">
                    <span className="sr-only">{issue.severity}: </span>
                    {issue.message}
                  </span>
                  <span className="ml-2 font-mono text-xs text-slate-500 dark:text-slate-500">{issue.field}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
