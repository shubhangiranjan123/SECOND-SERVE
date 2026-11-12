import { useEffect, useState } from 'react'

// Counts how many tabs or windows of the app are open right now, so the
// header can say "3 screens live". Uses BroadcastChannel (same browser).
export function useLiveScreens() {
  const [count, setCount] = useState(1)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const me = Math.random().toString(36).slice(2)
    const seen = new Map<string, number>()
    const channel = new BroadcastChannel('second-serve-presence')

    const ping = () => channel.postMessage(me)
    channel.onmessage = (event: MessageEvent<string>) => {
      seen.set(event.data, Date.now())
    }
    const timer = window.setInterval(() => {
      ping()
      const cutoff = Date.now() - 5000
      for (const [id, at] of seen) if (at < cutoff) seen.delete(id)
      setCount(seen.size + 1)
    }, 2000)
    ping()

    return () => {
      window.clearInterval(timer)
      channel.close()
    }
  }, [])

  return count
}
