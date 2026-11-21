import { expect, test } from 'vitest'
import { BRANCH_COLORS, isHexColor } from '../../src/core/colors.js'

test('rotation avoids status colours', () => {
  const reserved = ['#26a269', '#3584e4', '#77767b', '#e5a50a', '#c0bfbc', '#c01c28', '#e95420']
  for (const c of BRANCH_COLORS) {
    expect(reserved).not.toContain(c)
    expect(isHexColor(c)).toBe(true)
  }
})

test('isHexColor', () => {
  expect(isHexColor('#abcdef')).toBe(true)
  expect(isHexColor('#ABCDEF')).toBe(true)
  expect(isHexColor('#12')).toBe(false)
  expect(isHexColor('abcdef')).toBe(false)
  expect(isHexColor('#abcdeg')).toBe(false)
})
