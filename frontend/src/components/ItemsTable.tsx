import { Fragment, useId } from 'react'
import type { LineItem, ValidationIssue } from '../api/types'
import { groupThousands } from '../lib/format'
import { issuesForLine } from '../lib/issues'
import { AlertIcon } from './Icons'

function Cell({ value, bad, numeric = false }: { value: string | null; bad?: boolean; numeric?: boolean }) {
  const shown = value === null ? null : numeric ? groupThousands(value) : value
  return (
    <td className={`px-2 py-2.5 align-top ${numeric ? 'text-right tabular-nums' : ''} ${bad ? 'font-semibold text-bad' : ''}`}>
      {shown ?? <span className="text-muted">—</span>}
    </td>
  )
}

export function ItemsTable({ items, issues }: { items: LineItem[]; issues: ValidationIssue[] }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId} className="sr-only">
        Line items ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="border-t border-line py-4 text-sm text-muted">No line items were found in the document.</p>
      ) : (
        // tabIndex: keyboard users can focus the scroll area and scroll it with the arrow keys
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-labelledby={titleId}>
          <table className="w-full min-w-[20rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="caption px-2 py-2 font-medium">Item</th>
                <th scope="col" className="caption px-2 py-2 text-right font-medium">Qty</th>
                <th scope="col" className="caption px-2 py-2 text-right font-medium">Unit price</th>
                <th scope="col" className="caption px-2 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const rowIssues = issuesForLine(issues, index)
                const bad = (cell: string) =>
                  rowIssues.some((i) => i.field === `line_items[${index}].${cell}` && i.severity === 'error')
                const tint = rowIssues.some((i) => i.severity === 'error')
                  ? 'bg-bad/10'
                  : rowIssues.length > 0
                    ? 'bg-warn/10'
                    : ''
                return (
                  <Fragment key={index}>
                    <tr className={`border-b border-line ${tint}`}>
                      <Cell value={item.description} />
                      <Cell numeric value={item.quantity} />
                      <Cell numeric value={item.unit_price} />
                      <Cell numeric value={item.line_total} bad={bad('line_total')} />
                    </tr>
                    {rowIssues.length > 0 && (
                      <tr className={`border-b border-line ${tint}`}>
                        <td colSpan={4} className="px-2 pb-2">
                          <ul className="space-y-0.5">
                            {rowIssues.map((issue, i) => (
                              <li
                                key={i}
                                className={`flex items-start gap-1.5 text-xs font-medium ${
                                  issue.severity === 'error' ? 'text-bad' : 'text-warn'
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
