import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

// State that is saved to localStorage and kept in step across every open
// tab and window of the app. When another tab writes the same key, the
// browser fires a "storage" event here and we reload from it.
//
// Swapping this for a real database later (Supabase, Firebase) only means
// changing this one hook: everything else reads and writes through it.
export function useSyncedState<T>(
  key: string,
  load: () => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(load)

  useEffect(() => {
    try {
      const next = JSON.stringify(value)
      if (localStorage.getItem(key) !== next) localStorage.setItem(key, next)
    } catch {
      console.warn(`Could not save ${key}.`)
    }
  }, [key, value])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === key && event.newValue !== null) setValue(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, load])

  return [value, setValue]
}

export function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}
