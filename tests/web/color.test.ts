import { expect, test } from 'vitest'
import { hexToHsv, hsvToHex } from '../../src/web/color.js'

test.each(['#613583', '#000000', '#ffffff', '#e95420'])('round trip %s', (hex) => {
  expect(hsvToHex(hexToHsv(hex))).toBe(hex)
})

test('pure red', () => {
  expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000')
  expect(hexToHsv('#FF0000')).toEqual({ h: 0, s: 1, v: 1 })
})

test('hue 360 wraps to red', () => {
  expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000')
})
