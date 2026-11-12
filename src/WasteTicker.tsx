import { useEffect, useState } from 'react'

// UNEP Food Waste Index Report 2024: 1.05 billion tonnes wasted in 2022.
const KG_PER_SECOND = 1.05e12 / (365 * 24 * 60 * 60)

// Small floating counter that keeps the problem in view on the map.
export default function WasteTicker() {
  const [started] = useState(() => Date.now())
  const [now, setNow] = useState(started)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 120)
    return () => window.clearInterval(t)
  }, [])
  const kg = Math.floor(((now - started) / 1000) * KG_PER_SECOND)
  return (
    <div className="waste-ticker" aria-label="Food wasted worldwide since this screen opened">
      <span className="waste-ticker-label">Binned worldwide since you opened this</span>
      <span className="waste-ticker-num num">{kg.toLocaleString('en-IN')} kg</span>
    </div>
  )
}
