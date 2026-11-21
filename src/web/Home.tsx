import type { Project } from '../core/types.js'
import { HeaderBar } from './HeaderBar.js'
import { ChevronRightIcon, PlusIcon } from './ui/icons.js'

export function Home({
  projects,
  onOpen,
  onNew,
}: {
  projects: Project[] | null
  onOpen(id: number): void
  onNew(): void
}) {
  return (
    <>
      <HeaderBar
        start={
          <button type="button" className="btn" onClick={onNew}>
            <PlusIcon /> New project
          </button>
        }
        center={<span className="hb-title">greymatter</span>}
      />
      <main className="home">
        {projects !== null && projects.length === 0 && <p className="hint">No projects yet.</p>}
        {projects !== null && projects.length > 0 && (
          <div className="boxed">
            {projects.map((p) => (
              <button key={p.id} type="button" className="row row-btn" onClick={() => onOpen(p.id)}>
                <span>{p.name}</span>
                <ChevronRightIcon />
              </button>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
