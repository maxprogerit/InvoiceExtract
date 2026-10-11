import { Fragment } from 'react'
import type { LineItem, ValidationIssue } from '../api/types'
import { groupThousands } from '../lib/format'
import { issuesForLine } from '../lib/issues'
import { AlertIcon } from './Icons'

interface Props {
  items: LineItem[]
  issues: ValidationIssue[]
}

function Cell({ value, bad, numeric = false }: { value: string | null; bad?: boolean; numeric?: boolean }) {
  const shown = value === null ? null : numeric ? groupThousands(value) : value
  return (
    <td
      className={`px-2 py-2 align-top ${numeric ? 'text-right tabular-nums' : ''} ${
        bad ? 'font-semibold text-red-700 dark:text-red-400' : ''
      }`}
    >
      {shown ?? <span className="italic text-slate-400 dark:text-slate-500">—</span>}
    </td>
  )
}

export function LineItemsTable({ items, issues }: Props) {
  return (
    <section
      aria-labelledby="lines-title"
      className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <h3 id="lines-title" className="px-5 pt-5 text-base font-semibold">
        Line items <span className="font-normal text-slate-600 dark:text-slate-400">({items.length})</span>
      </h3>

      {items.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-sm text-slate-600 dark:text-slate-400">No line items were found in the document.</p>
      ) : (
        // tabIndex: keyboard users can focus the scroll area and scroll it with the arrow keys
        <div className="overflow-x-auto px-2 pb-3 pt-2" tabIndex={0} role="region" aria-labelledby="lines-title">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                <th scope="col" className="px-2 py-2 font-medium">#</th>
                <th scope="col" className="px-2 py-2 font-medium">Description</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Qty</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Unit price</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Line total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const rowIssues = issuesForLine(issues, index)
                const bad = (cell: string) => rowIssues.some((i) => i.field === `line_items[${index}].${cell}` && i.severity === 'error')
                const rowError = rowIssues.some((i) => i.severity === 'error')
                const tint = rowError
                  ? 'bg-red-50 dark:bg-red-950/30'
                  : rowIssues.length > 0
                    ? 'bg-amber-50 dark:bg-amber-950/20'
                    : ''
                return (
                  <Fragment key={index}>
                    <tr className={`border-b border-slate-100 dark:border-slate-800 ${tint}`}>
                      <td className="px-2 py-2 align-top text-slate-500">{index + 1}</td>
                      <Cell value={item.description} />
                      <Cell numeric value={item.quantity} />
                      <Cell numeric value={item.unit_price} />
                      <Cell numeric value={item.line_total} bad={bad('line_total')} />
                    </tr>
                    {rowIssues.length > 0 && (
                      <tr className={`border-b border-slate-100 dark:border-slate-800 ${tint}`}>
                        <td />
                        <td colSpan={4} className="px-2 pb-2">
                          <ul className="space-y-0.5">
                            {rowIssues.map((issue, i) => (
                              <li
                                key={i}
                                className={`flex items-start gap-1.5 text-xs font-medium ${
                                  issue.severity === 'error' ? 'text-red-700 dark:text-red-400' : 'text-amber-800 dark:text-amber-400'
                                }`}
                              >
                                <AlertIcon className="mt-px size-3.5" />
                                <span>
                                  <span className="sr-only">Row {index + 1} {issue.severity}: </span>
                                  {issue.message}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
