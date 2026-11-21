import type { ReactNode } from 'react'

export function TextField({
  label,
  value,
  onChange,
  multiline,
  placeholder,
  autoFocus,
  end,
}: {
  label: string
  value: string
  onChange(v: string): void
  multiline?: boolean
  placeholder?: string
  autoFocus?: boolean
  end?: ReactNode
}) {
  return (
    <label className={multiline ? 'row area' : 'row'}>
      <span className="field">
        <span className="field-label">{label}</span>
        {multiline ? (
          <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={4} />
        ) : (
          <input
            value={value}
            placeholder={placeholder}
            autoFocus={autoFocus}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </span>
      {end}
    </label>
  )
}
