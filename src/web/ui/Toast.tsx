import * as T from '@radix-ui/react-toast'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'

interface ToastApi {
  error(message: string, retry?: () => void): void
}

interface Item {
  id: number
  message: string
  retry?: () => void
}

const Ctx = createContext<ToastApi>({ error: () => {} })

export const useToast = (): ToastApi => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const next = useRef(1)
  const drop = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), [])
  const value = useMemo<ToastApi>(
    () => ({
      error: (message, retry) => setItems((xs) => [...xs, { id: next.current++, message, retry }]),
    }),
    [],
  )
  return (
    <Ctx.Provider value={value}>
      <T.Provider duration={6000}>
        {children}
        {items.map((t) => (
          <T.Root key={t.id} className="toast" onOpenChange={(open) => !open && drop(t.id)}>
            <T.Description>{t.message}</T.Description>
            {t.retry && (
              <T.Action className="btn" altText="Retry" onClick={t.retry}>
                Retry
              </T.Action>
            )}
            <T.Close className="btn" aria-label="Dismiss">
              ✕
            </T.Close>
          </T.Root>
        ))}
        <T.Viewport className="toast-viewport" />
      </T.Provider>
    </Ctx.Provider>
  )
}
