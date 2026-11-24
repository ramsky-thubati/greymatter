import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = (p: P): P => ({
  width: '1em',
  height: '1em',
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
  ...p,
})

export const PadlockIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" stroke="none" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
)

export const FlagIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 14V2.5" />
    <path d="M4 3h7.5l-1.8 2.75L11.5 8.5H4z" fill="currentColor" />
  </svg>
)

export const BranchIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="4.5" cy="3.5" r="1.5" />
    <circle cx="4.5" cy="12.5" r="1.5" />
    <circle cx="11.5" cy="5.5" r="1.5" />
    <path d="M4.5 5v6M11.5 7c0 3-7 2-7 4" />
  </svg>
)

export const PlusIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M8 3v10M3 8h10" />
  </svg>
)

export const CloseIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={1.8}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)

export const WarnIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={0}>
    <circle cx="8" cy="8" r="7" fill="currentColor" />
    <rect x="7.1" y="3.5" width="1.8" height="6" rx="0.9" fill="#fff" />
    <circle cx="8" cy="12" r="1.05" fill="#fff" />
  </svg>
)

export const ChevronDownIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 6.5L8 10l3.5-3.5" />
  </svg>
)

export const ChevronLeftIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 3.5L5.5 8l4.5 4.5" />
  </svg>
)

export const ChevronRightIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 3.5L10.5 8 6 12.5" />
  </svg>
)

export const CheckIcon = (p: P) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
)

export const MoreIcon = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <circle cx="3.5" cy="8" r="1.3" />
    <circle cx="8" cy="8" r="1.3" />
    <circle cx="12.5" cy="8" r="1.3" />
  </svg>
)
