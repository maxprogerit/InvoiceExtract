import type { ReactNode } from 'react'
import { AlertIcon, InfoIcon } from './Icons'

type Tone = 'info' | 'warn' | 'bad'

const TONES: Record<Tone, string> = {
  info: 'border-line bg-surface-2',
  warn: 'border-warn/50 bg-warn/10',
  bad: 'border-bad/50 bg-bad/10',
}
const ICON_TONES: Record<Tone, string> = { info: 'text-accent-text', warn: 'text-warn', bad: 'text-bad' }

export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = tone === 'info' ? InfoIcon : AlertIcon
  return (
    <p role="status" className={`animate-in flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${TONES[tone]}`}>
      <Icon className={`mt-0.5 ${ICON_TONES[tone]}`} />
      <span>{children}</span>
    </p>
  )
}
