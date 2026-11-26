import * as Menu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import type { Project } from '../core/types.js'
import { HeaderBar } from './HeaderBar.js'
import { loadSort, type ProjectSort, SORT_LABEL, SORTS, saveSort, sortProjects } from './projectSort.js'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon } from './ui/icons.js'

function SortMenu({ value, onChange }: { value: ProjectSort; onChange(s: ProjectSort): void }) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className="btn flat sort-btn">
          Sort: {SORT_LABEL[value]}
          <ChevronDownIcon />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="end" sideOffset={4}>
          <Menu.RadioGroup value={value} onValueChange={(v) => onChange(v as ProjectSort)}>
            {SORTS.map((s) => (
              <Menu.RadioItem key={s} value={s} className="menu-item">
                {SORT_LABEL[s]}
                <Menu.ItemIndicator className="end">
                  <CheckIcon />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

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
  const [sort, setSort] = useState(loadSort)
  const changeSort = (s: ProjectSort) => {
    setSort(s)
    saveSort(s)
  }
  const active = sortProjects(projects?.filter((p) => p.status !== 'complete') ?? [], sort)
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
        {active.length > 0 && (
          <>
            <div className="list-toolbar">
              <SortMenu value={sort} onChange={changeSort} />
            </div>
            <ProjectList projects={active} onOpen={onOpen} />
          </>
        )}
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
