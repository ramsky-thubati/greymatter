import { expect, test } from 'vitest'
import { formatTaskId, parseTaskId } from '../../src/core/ids.js'

test('parseTaskId accepts loose forms', () => {
  for (const s of ['T-14', 't-14', 'T14', '14', ' 14 ']) expect(parseTaskId(s)).toBe(14)
  expect(parseTaskId(14)).toBe(14)
})

test('parseTaskId rejects junk', () => {
  for (const s of ['X-1', '', 'T-', '1.5', '-3', '0', 'T-0', '1 2'])
    expect(() => parseTaskId(s)).toThrow(expect.objectContaining({ code: 'invalid' }))
  expect(() => parseTaskId(1.5)).toThrow(expect.objectContaining({ code: 'invalid' }))
  expect(() => parseTaskId(0)).toThrow(expect.objectContaining({ code: 'invalid' }))
})

test('formatTaskId', () => {
  expect(formatTaskId(14)).toBe('T-14')
})
