import type { Project } from '../core/types.js'
import { HeaderBar } from './HeaderBar.js'
import { ChevronRightIcon, PlusIcon } from './ui/icons.js'

function ProjectList({ projects, onOpen }: { projects: Project[]; onOpen(id: number): void }) {
  return (
    <div className="boxed">
      {projects.map((p) => (
        <button key={p.id} type="button" className="row row-btn" onClick={() => onOpen(p.id)}>
          <span>{p.name}</span>
          <ChevronRightIcon />
        </button>
      ))}
    </div>
  )
}

export function Home({
  projects,
  onOpen,
  onNew,
}: {
  projects: Project[] | null
  onOpen(id: number): void
  onNew(): void
}) {
  const active = projects?.filter((p) => p.status !== 'complete') ?? []
  const done = projects?.filter((p) => p.status === 'complete') ?? []
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
        {active.length > 0 && <ProjectList projects={active} onOpen={onOpen} />}
        {done.length > 0 && (
          <details className="completed">
            <summary className="group-title">
              <ChevronRightIcon />
              Completed ({done.length})
            </summary>
            <ProjectList projects={done} onOpen={onOpen} />
          </details>
        )}
      </main>
    </>
  )
}
