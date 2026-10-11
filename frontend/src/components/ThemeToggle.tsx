import type { Theme } from '../hooks/useTheme'
import { MoonIcon, SunIcon } from './Icons'

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={dark}
      className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-200/60 dark:ring-slate-700 dark:hover:bg-slate-800"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
      <span>{dark ? 'Light' : 'Dark'}<span className="sr-only"> theme</span></span>
    </button>
  )
}
