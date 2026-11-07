import { useCallback, useEffect, useRef, useState } from 'react'

const UNDO_WINDOW_MS = 5000

/**
 * One app-wide undo slot. `show({ message, undo, commit })` displays the
 * toast; `commit` (optional) runs when the window closes without an undo,
 * or immediately when another undoable action replaces this one.
 */
export function useUndo() {
  const [current, setCurrent] = useState(null)
  const currentRef = useRef(null)
  const timerRef = useRef(null)

  const settle = useCallback(() => {
    const pending = currentRef.current
    clearTimeout(timerRef.current)
    currentRef.current = null
    setCurrent(null)
    return pending?.commit?.()
  }, [])

  const show = useCallback((action) => {
    settle()
    currentRef.current = action
    setCurrent(action)
    timerRef.current = setTimeout(settle, UNDO_WINDOW_MS)
  }, [settle])

  const undo = useCallback(() => {
    const pending = currentRef.current
    clearTimeout(timerRef.current)
    currentRef.current = null
    setCurrent(null)
    pending?.undo?.()
  }, [])

  useEffect(() => {
    // Don't lose a pending delete if the page is closed during the undo window.
    window.addEventListener('pagehide', settle)
    return () => window.removeEventListener('pagehide', settle)
  }, [settle])

  return { message: current?.message, show, undo }
}
