if (typeof window !== 'undefined') {
  if (!('ResizeObserver' in window)) {
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.assign(window, { ResizeObserver })
    Object.assign(globalThis, { ResizeObserver })
  }
  const proto = window.Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
  if (!('DOMRect' in window)) {
    Object.assign(window, {
      DOMRect: class {
        constructor(
          public x = 0,
          public y = 0,
          public width = 0,
          public height = 0,
        ) {}
        static fromRect() {
          return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
        }
      },
    })
  }
}
