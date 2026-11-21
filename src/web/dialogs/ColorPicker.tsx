import * as Popover from '@radix-ui/react-popover'
import { type KeyboardEvent, type PointerEvent, useEffect, useState } from 'react'
import { isHexColor } from '../../core/colors.js'
import { type Hsv, hexToHsv, hsvToHex } from '../color.js'

const clamp = (n: number) => Math.min(1, Math.max(0, n))

function fraction(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  return {
    x: r.width > 0 ? clamp((e.clientX - r.left) / r.width) : 0,
    y: r.height > 0 ? clamp((e.clientY - r.top) / r.height) : 0,
  }
}

function useDrag(apply: (f: { x: number; y: number }) => void) {
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      apply(fraction(e))
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) apply(fraction(e))
    },
  }
}

const STEP = 0.02

export function ColorPicker({ value, onChange }: { value: string; onChange(hex: string): void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  const [text, setText] = useState(value)

  useEffect(() => {
    setHsv((cur) => (hsvToHex(cur) === value ? cur : hexToHsv(value)))
    setText((cur) => (cur.toLowerCase() === value ? cur : value))
  }, [value])

  const pick = (next: Hsv) => {
    setHsv(next)
    onChange(hsvToHex(next))
  }
  const sv = useDrag(({ x, y }) => pick({ ...hsv, s: x, v: 1 - y }))
  const hue = useDrag(({ x }) => pick({ ...hsv, h: x * 360 }))

  const svKeys = (e: KeyboardEvent) => {
    const d = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, STEP], ArrowDown: [0, -STEP] }[e.key]
    if (!d) return
    e.preventDefault()
    pick({ ...hsv, s: clamp(hsv.s + d[0]!), v: clamp(hsv.v + d[1]!) })
  }
  const hueKeys = (e: KeyboardEvent) => {
    const d = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key]
    if (!d) return
    e.preventDefault()
    pick({ ...hsv, h: (hsv.h + d + 360) % 360 })
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="swatch" aria-label="Choose colour" style={{ background: value }} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="popover color-pop" align="end" sideOffset={6}>
          <div
            className="sv"
            role="slider"
            tabIndex={0}
            aria-label="Saturation and brightness"
            aria-valuetext={value}
            style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }}
            onKeyDown={svKeys}
            {...sv}
          >
            <span className="sv-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
          </div>
          <div
            className="hue"
            role="slider"
            tabIndex={0}
            aria-label="Hue"
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(hsv.h)}
            onKeyDown={hueKeys}
            {...hue}
          >
            <span className="hue-knob" style={{ left: `${(hsv.h / 360) * 100}%` }} />
          </div>
          <label className="hex-row">
            <span className="swatch small" style={{ background: value }} />
            <input
              aria-label="Hex"
              className="input"
              value={text}
              spellCheck={false}
              onChange={(e) => {
                const t = e.target.value.trim()
                setText(t)
                if (isHexColor(t)) onChange(t.toLowerCase())
              }}
            />
          </label>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
