import type { ReactNode } from 'react'

export function HeaderBar({ start, center, end }: { start?: ReactNode; center?: ReactNode; end?: ReactNode }) {
  return (
    <header className="headerbar">
      <div className="hb-start">{start}</div>
      <div>{center}</div>
      <div className="hb-end">{end}</div>
    </header>
  )
}
