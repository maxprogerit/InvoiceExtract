import type { InvoiceStatus } from '../api/types'
import { AlertIcon, CheckIcon, XIcon } from './Icons'

const STYLES: Record<InvoiceStatus, { label: string; classes: string; Icon: typeof CheckIcon }> = {
  valid: {
    label: 'Valid',
    classes: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/30',
    Icon: CheckIcon,
  },
  needs_review: {
    label: 'Needs review',
    classes: 'bg-amber-100 text-amber-900 ring-amber-600/30 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30',
    Icon: AlertIcon,
  },
  failed: {
    label: 'Failed',
    classes: 'bg-red-100 text-red-800 ring-red-600/20 dark:bg-red-950 dark:text-red-300 dark:ring-red-400/30',
    Icon: XIcon,
  },
}

// Icon + text, never colour alone: the status stays readable for colour-blind users.
export function StatusBadge({ status, large = false }: { status: InvoiceStatus; large?: boolean }) {
  const { label, classes, Icon } = STYLES[status]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset ${classes} ${
        large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <Icon />
      {label}
    </span>
  )
}
