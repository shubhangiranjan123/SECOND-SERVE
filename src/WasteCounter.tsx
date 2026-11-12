import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import './WasteCounter.css'

// UNEP Food Waste Index Report 2024: 1.05 billion tonnes wasted in 2022.
// 1.05e12 kg / 31,536,000 s ≈ 33,295 kg every second.
const KG_PER_SECOND = 1.05e12 / (365 * 24 * 60 * 60)

const DRIPS = [
  { at: 0.1, r: 14, dur: 2.8, delay: 0 },
  { at: 0.28, r: 18, dur: 3.1, delay: 0.7 },
  { at: 0.5, r: 13, dur: 2.7, delay: 1.4 },
  { at: 0.7, r: 17, dur: 3.4, delay: 0.3 },
  { at: 0.9, r: 14, dur: 2.9, delay: 2 },
]

type Geometry = { w: number; h: number; barX: number; barY: number; barW: number }

type Props = {
  ctaHref: string
  ctaLabel: string
}

export default function WasteCounter({ ctaHref, ctaLabel }: Props) {
  const [started] = useState(() => Date.now())
  const [now, setNow] = useState(started)
  const [cursor, setCursor] = useState({ x: -200, y: -200 })
  const [geo, setGeo] = useState<Geometry | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const numberRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 90)
    return () => window.clearInterval(timer)
  }, [])

  // Measure where the number sits, so the drips fall from its real edge
  // at every screen size.
  useLayoutEffect(() => {
    const section = sectionRef.current
    const number = numberRef.current
    if (!section || !number) return
    const measure = () => {
      const s = section.getBoundingClientRect()
      const n = number.getBoundingClientRect()
      const inset = n.width * 0.06
      setGeo({
        w: s.width,
        h: s.height,
        barX: n.left - s.left + inset,
        barY: n.bottom - s.top - n.height * 0.12,
        barW: n.width - inset * 2,
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(section)
    observer.observe(number)
    return () => observer.disconnect()
  }, [])

  const seconds = (now - started) / 1000
  const kg = Math.floor(seconds * KG_PER_SECOND)

  function track(event: MouseEvent<HTMLElement>) {
    const r = event.currentTarget.getBoundingClientRect()
    setCursor({ x: event.clientX - r.left, y: event.clientY - r.top })
  }

  const poolH = geo ? Math.min(geo.h * 0.28, 30 + seconds * 2) : 0
  const fall = geo ? geo.h - geo.barY : 0

  return (
    <section
      className="waste"
      ref={sectionRef}
      onMouseMove={track}
      onMouseLeave={() => setCursor({ x: -200, y: -200 })}
      aria-labelledby="waste-title"
    >
      {geo && (
        <svg
          className="waste-goo"
          width={geo.w}
          height={geo.h}
          viewBox={`0 0 ${geo.w} ${geo.h}`}
          aria-hidden="true"
        >
          <defs>
            <filter id="goo">
              <feGaussianBlur in="SourceGraphic" stdDeviation="11" />
              <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11" />
            </filter>
          </defs>
          <g filter="url(#goo)" style={{ '--fall': `${fall}px` } as CSSProperties}>
            <rect x={geo.barX} y={geo.barY} width={geo.barW} height={16} rx={8} />
            {DRIPS.map((d) => (
              <circle
                key={d.at}
                className="drip"
                cx={geo.barX + geo.barW * d.at}
                cy={geo.barY + 10}
                r={d.r}
                style={{ animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }}
              />
            ))}
            <rect className="pool" x={-40} y={geo.h - poolH} width={geo.w + 80} height={poolH + 40} />
            <circle className="bob" cx={geo.w * 0.2} cy={geo.h - poolH} r={40} />
            <circle className="bob b2" cx={geo.w * 0.8} cy={geo.h - poolH} r={48} />
            <circle className="chase" cx={cursor.x} cy={cursor.y} r={32} />
          </g>
        </svg>
      )}

      <div className="waste-copy">
        <p className="waste-lead" id="waste-title">
          Since you opened this page, the world has thrown away
        </p>
        <p className="waste-number num" ref={numberRef}>
          {kg.toLocaleString('en-IN')} kg
        </p>
        <p className="waste-lead waste-after">
          of food. About 33 tonnes a second, while 783 million people go hungry.
        </p>
        <a className="waste-cta" href={ctaHref}>
          {ctaLabel}
        </a>
      </div>

      <p className="waste-source">
        UNEP Food Waste Index Report 2024: 1.05 billion tonnes wasted in 2022.
      </p>
    </section>
  )
}
