import type { Project } from '../core/types.js'

export type ProjectSort = 'updated' | 'created' | 'name'

export const SORTS: ProjectSort[] = ['updated', 'created', 'name']

export const SORT_LABEL: Record<ProjectSort, string> = {
  updated: 'Last updated',
  created: 'Created',
  name: 'Name',
}

const KEY = 'greymatter.projectSort'

export function loadSort(): ProjectSort {
  try {
    const v = localStorage.getItem(KEY)
    if (SORTS.includes(v as ProjectSort)) return v as ProjectSort
  } catch {}
  return 'updated'
}

export function saveSort(sort: ProjectSort): void {
  try {
    localStorage.setItem(KEY, sort)
  } catch {}
}

export function sortProjects(projects: Project[], sort: ProjectSort): Project[] {
  const out = [...projects]
  if (sort === 'name') return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  const key = sort === 'updated' ? 'updatedAt' : 'createdAt'
  return out.sort((a, b) => b[key].localeCompare(a[key]) || b.id - a.id)
}
