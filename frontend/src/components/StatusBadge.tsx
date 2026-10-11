import type { InvoiceStatus } from '../api/types'
import { AlertIcon, CheckIcon, XIcon } from './Icons'

const STYLES: Record<InvoiceStatus, { label: string; classes: string; Icon: typeof CheckIcon }> = {
  valid: { label: 'Valid', classes: 'border-ok/60 text-ok', Icon: CheckIcon },
  needs_review: { label: 'Needs review', classes: 'border-warn/60 text-warn', Icon: AlertIcon },
  failed: { label: 'Failed', classes: 'border-bad/60 text-bad', Icon: XIcon },
}

// Icon + text, never colour alone: the status stays readable for colour-blind users.
export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, classes, Icon } = STYLES[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-[0.7rem] font-semibold uppercase tracking-wider ${classes}`}
    >
      <Icon className="size-3" />
      {label}
    </span>
  )
}
