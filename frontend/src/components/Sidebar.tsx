import type { ReactNode } from 'react'
import type { Theme } from '../hooks/useTheme'
import type { Route } from '../lib/route'
import { BookIcon, ClockIcon, CodeIcon, MoonIcon, ScanIcon, SunIcon } from './Icons'

interface Props {
  route: Route
  theme: Theme
  onToggleTheme: () => void
  docsUrl: string
}

interface Item {
  view: Route['view']
  href: string
  label: string
  icon: ReactNode
}

const ITEMS: Item[] = [
  { view: 'extract', href: '#/', label: 'Extract', icon: <ScanIcon /> },
  { view: 'history', href: '#/history', label: 'History', icon: <ClockIcon /> },
  { view: 'api', href: '#/api', label: 'API', icon: <CodeIcon /> },
]

export function Sidebar({ route, theme, onToggleTheme, docsUrl }: Props) {
  const dark = theme === 'dark'
  const linkBase = 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors'

  return (
    <aside className="flex flex-col gap-2 border-b border-line bg-sidebar px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:gap-6 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
      <div className="flex items-center justify-between gap-3">
        <a href="#/" className="text-xl font-bold tracking-tight">
          Invoice <span className="text-accent-text">Extract</span>
        </a>
        {/* On small screens the theme toggle sits next to the logo, on large ones at the bottom. */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-pressed={dark}
          className="btn !px-2.5 !py-1.5 lg:hidden"
        >
          {dark ? <SunIcon /> : <MoonIcon />}
          <span className="sr-only">{dark ? 'Light' : 'Dark'} theme</span>
        </button>
      </div>

      <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:flex-col">
        {ITEMS.map((item) => {
          const active = route.view === item.view
          return (
            <a
              key={item.view}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`${linkBase} ${
                active ? 'bg-surface-2 text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {item.icon}
              {item.label}
            </a>
          )
        })}
        <a
          href={docsUrl}
          target="_blank"
          rel="noreferrer"
          className={`${linkBase} text-muted hover:bg-surface-2 hover:text-fg`}
        >
          <BookIcon />
          Docs<span className="sr-only"> (opens the API documentation in a new tab)</span>
        </a>
      </nav>

      <div className="mt-auto hidden lg:block">
        <button type="button" onClick={onToggleTheme} aria-pressed={dark} className="btn w-full justify-start">
          {dark ? <SunIcon /> : <MoonIcon />}
          {dark ? 'Light' : 'Dark'}
          <span className="sr-only"> theme</span>
        </button>
        <p className="mt-3 font-mono text-[0.68rem] text-muted">Personal portfolio project</p>
      </div>
    </aside>
  )
}
