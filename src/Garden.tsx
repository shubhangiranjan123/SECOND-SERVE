import type { RescueRecord } from './types'
import './Garden.css'

// Estimates, shown on the page next to the numbers:
// WRAP meal-equivalent guidance uses 420 g per meal (the lowest common factor),
// FAO "Food wastage footprint" (2013): 3.3 Gt CO2e for 1.3 Gt of food ≈ 2.5 kg per kg.
const KG_PER_SERVING = 0.42
const CO2E_PER_KG = 2.5

const PETALS = ['#e2447f', '#ff8fbc', '#ffc2da', '#ff7daf']

// A stable pseudo-random number from a string, so each rescue's flower
// keeps the same spot and height every time the page loads.
function seeded(text: string, salt: number) {
  let h = 2166136261 ^ salt
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10_000) / 10_000
}

type Props = {
  history: RescueRecord[]
}

export default function Garden({ history }: Props) {
  const servings = history.reduce((sum, r) => sum + r.servings, 0)
  const samples = history.filter((r) => r.sample).length
  const kgFood = Math.round(servings * KG_PER_SERVING)
  const kgCo2 = Math.round(servings * KG_PER_SERVING * CO2E_PER_KG)

  // Oldest first, so new flowers are drawn on top.
  const flowers = [...history].reverse().map((r) => ({
    key: r.rescueId,
    left: 3 + seeded(r.rescueId, 1) * 88,
    height: 130 + seeded(r.rescueId, 2) * 110,
    petal: PETALS[Math.floor(seeded(r.rescueId, 3) * PETALS.length)],
    title: `${r.food} to ${r.ngoName}, ${r.servings} servings`,
  }))

  return (
    <section className="garden" id="garden" aria-labelledby="garden-title">
      <div className="garden-top">
        <div>
          <h2 id="garden-title">Every rescue grows something</h2>
          <p className="garden-sub">
            One flower for each delivery a runner completes. They stay, so the garden is your
            running climate record.
          </p>
        </div>
        <div className="garden-stats">
          <div>
            <span className="garden-num num" style={{ color: 'var(--mint)' }}>
              {servings.toLocaleString()}
            </span>
            <span>servings eaten, not binned</span>
          </div>
          <div>
            <span className="garden-num num">{kgFood.toLocaleString()}</span>
            <span>kg of food rescued</span>
          </div>
          <div>
            <span className="garden-num num" style={{ color: 'var(--pink-bright)' }}>
              {kgCo2.toLocaleString()}
            </span>
            <span>kg CO₂e kept out of the air</span>
          </div>
        </div>
      </div>

      <div className="garden-bed">
        {flowers.length === 0 && (
          <p className="garden-empty">
            Nothing planted yet. Mark a delivery done in Dispatch and the first flower appears
            here.
          </p>
        )}
        {flowers.map((f) => (
          <div
            className="flower"
            key={f.key}
            style={{ left: `${f.left}%`, height: f.height }}
            title={f.title}
          >
            <svg
              className="flower-sway"
              viewBox="0 0 90 220"
              preserveAspectRatio="xMidYMax meet"
              aria-hidden="true"
            >
              <path d="M45 220 C45 170 40 120 46 60" fill="none" stroke="#20b26b" strokeWidth="7" strokeLinecap="round" />
              <path d="M44 160 C24 150 14 132 16 116 C34 120 44 136 44 160 Z" fill="#20b26b" />
              <path d="M46 130 C66 122 76 104 74 88 C56 92 46 108 46 130 Z" fill="#5fe0a0" />
              <g className="flower-head">
                <circle cx="46" cy="40" r="17" fill={f.petal} />
                <circle cx="28" cy="52" r="15" fill={f.petal} />
                <circle cx="64" cy="52" r="15" fill={f.petal} />
                <circle cx="34" cy="70" r="14" fill={f.petal} />
                <circle cx="58" cy="70" r="14" fill={f.petal} />
                <circle cx="46" cy="56" r="11" fill="#ffe27a" />
              </g>
            </svg>
          </div>
        ))}
        <div className="garden-ground" />
      </div>

      <p className="garden-note">
        {samples > 0 && `Includes ${samples} sample rescues from earlier today. `}
        Estimates: 420 g per serving (WRAP meal equivalent), 2.5 kg CO₂e per kg of food wasted
        (FAO, Food wastage footprint).
      </p>
    </section>
  )
}
