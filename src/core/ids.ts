import { DomainError } from './errors.js'

export function parseTaskId(input: string | number): number {
  if (typeof input === 'number') {
    if (Number.isInteger(input) && input > 0) return input
    throw new DomainError('invalid', `Invalid task id: ${input}`)
  }
  const m = /^(?:t-?)?(\d+)$/i.exec(input.trim())
  const n = m ? Number(m[1]) : 0
  if (n < 1) throw new DomainError('invalid', `Invalid task id: "${input}"`)
  return n
}

export function formatTaskId(n: number): string {
  return `T-${n}`
}
