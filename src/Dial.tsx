import { useEffect, useState } from 'react'
import { formatClock } from './rescueEngine'

type Props = {
  readyAt: number
  safeUntil: number
  state: 'live' | 'reserved' | 'delivered' | 'expired'
  size?: number
}

const URGENT_MS = 90 * 60_000
const SCALE_MS = 12 * 60 * 60_000

function useSecondTick(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [enabled])
  return now
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// A ring that empties as the food's safe-use window runs out.
// A full ring is 12 hours or more of safe time.
export default function Dial({ readyAt, safeUntil, state, size = 132 }: Props) {
  const ticking = state === 'live' || state === 'reserved'
  const now = useSecondTick(ticking)

  const leftMs = Math.max(0, safeUntil - now)
  // Every ring uses the same 12-hour scale, so they compare at a glance.
  const share = state === 'delivered' ? 1 : Math.min(1, leftMs / SCALE_MS)
  const notReady = state === 'live' && readyAt > now
  const urgent = state === 'live' && leftMs < URGENT_MS

  const stroke = size * 0.1
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r

  const h = Math.floor(leftMs / 3_600_000)
  const m = Math.floor((leftMs % 3_600_000) / 60_000)
  const s = Math.floor((leftMs % 60_000) / 1000)

  let big: string
  let small: string
  if (state === 'delivered') {
    big = 'Done'
    small = 'delivered'
  } else if (state === 'expired' || leftMs === 0) {
    big = '0:00'
    small = 'window passed'
  } else if (h > 0) {
    big = `${h}:${pad(m)}`
    small = notReady ? `ready ${formatClock(readyAt)}` : `until ${formatClock(safeUntil)}`
  } else {
    big = `${m}:${pad(s)}`
    small = 'minutes left'
  }

  const tone = state === 'delivered' || state === 'reserved'
    ? 'calm'
    : state === 'expired'
      ? 'dead'
      : urgent
        ? 'urgent'
        : 'fresh'

  return (
    <div
      className={`dial dial-${tone}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        state === 'delivered'
          ? 'Delivered'
          : state === 'expired'
            ? 'Safe-use window has passed'
            : `${h} hours ${m} minutes of safe time left, until ${formatClock(safeUntil)}`
      }
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle className="dial-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="dial-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - share)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="dial-text">
        <span className="dial-big num">
          {big}
        </span>
        <span className="dial-small">{small}</span>
      </div>
    </div>
  )
}
