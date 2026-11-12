import { useState } from 'react'
import './NgoMatching.css'
import type { Donation, Ngo, RescueRecord } from './types'
import {
  MATCH_WEIGHTS,
  POLICY,
  formatClock,
  formatDuration,
  matchNgos,
  minutesBetween,
} from './rescueEngine'

type Props = {
  donation: Donation
  donations: Donation[]
  ngos: Ngo[]
  history: RescueRecord[]
  now: number
  onReserve: (donationId: number, ngoId: number) => void
  onClose: () => void
}

const FACTORS = [
  { key: 'travel', label: 'Travel time' },
  { key: 'need', label: 'Unmet capacity' },
  { key: 'safety', label: 'Safety margin' },
  { key: 'hours', label: 'Opening hours' },
] as const

export default function NgoMatchModal({
  donation,
  donations,
  ngos,
  history,
  now,
  onReserve,
  onClose,
}: Props) {
  const result = matchNgos(donation, ngos, donations, history, now)
  const [chosenId, setChosenId] = useState<number | null>(null)

  // Default to the top-ranked match until the coordinator picks another.
  const selectedId = chosenId ?? result.best?.ngo.id ?? null
  const safeLeft = minutesBetween(now, donation.safeUntil)

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="donation-modal match-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="match-title">Find the right home</h2>
            <p>
              <strong>{donation.name}</strong>, {donation.serves} servings, {donation.storage.toLowerCase()}.{' '}
              {safeLeft > 0
                ? `Safe for ${formatDuration(safeLeft)} (until ${formatClock(donation.safeUntil)}).`
                : 'The safe-use window has passed.'}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close" type="button">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className={`match-verdict verdict-${result.feasibility.replace(' ', '-').toLowerCase()}`}>
          <strong>
            {result.feasibility === 'Feasible'
              ? `${result.eligible.length} eligible ${result.eligible.length === 1 ? 'organisation' : 'organisations'}`
              : result.feasibility === 'Expired'
                ? 'This food is past its safe-use deadline'
                : 'No organisation can safely accept this donation right now'}
          </strong>
          <span>
            Checked {ngos.length} organisations for verification, availability, storage,
            capacity, opening hours and arrival before the deadline (with a{' '}
            {POLICY.safetyBufferMinutes}-min safety buffer).
          </span>
        </div>

        {result.eligible.length > 0 && (
          <div className="match-list" role="radiogroup" aria-label="Eligible organisations">
            {result.eligible.map((match, index) => (
              <label
                key={match.ngo.id}
                className={`match-card ${selectedId === match.ngo.id ? 'is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="ngo-match"
                  checked={selectedId === match.ngo.id}
                  onChange={() => setChosenId(match.ngo.id)}
                />
                <div className="match-card-top">
                  <div>
                    {index === 0 && <span className="match-best">Best match</span>}
                    <h3>{match.ngo.name}</h3>
                    <span className="match-sub">
                      {match.ngo.type}, {match.ngo.area}. Arrives around {formatClock(match.arrival)}
                    </span>
                  </div>
                  <div className="match-score" aria-label={`Match score ${match.score} out of 100`}>
                    <strong>{match.score}</strong>
                    <span>/ 100</span>
                  </div>
                </div>

                <div className="match-factors">
                  {FACTORS.map((factor) => (
                    <div className="match-factor" key={factor.key}>
                      <span>
                        {factor.label} <em>{Math.round(MATCH_WEIGHTS[factor.key] * 100)}%</em>
                      </span>
                      <div className="match-bar">
                        <i style={{ width: `${Math.round(match.breakdown[factor.key] * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <ul className="match-reasons">
                  {match.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                  {match.warnings.map((warning) => (
                    <li key={warning} className="match-warning">
                      {warning}
                    </li>
                  ))}
                </ul>
              </label>
            ))}
          </div>
        )}

        {result.excluded.length > 0 && (
          <details className="match-excluded" open={result.eligible.length === 0}>
            <summary>
              {result.excluded.length} excluded {result.excluded.length === 1 ? 'organisation' : 'organisations'} and why
            </summary>
            {result.excluded.map((item) => (
              <div className="match-excluded-row" key={item.ngo.id}>
                <strong>{item.ngo.name}</strong>
                <ul>
                  {item.failures.map((failure) => (
                    <li key={failure}>{failure}</li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        )}

        <p className="match-note">
          Rule-based, explainable scoring, not machine learning. Travel times are straight-line
          estimates × {POLICY.roadFactor} at {POLICY.dispatchSpeedKmh} km/h; locations are demo
          coordinates.
        </p>

        <div className="modal-actions">
          <button type="button" className="button-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={selectedId === null}
            onClick={() => selectedId !== null && onReserve(donation.id, selectedId)}
          >
            Reserve for this partner
          </button>
        </div>
      </section>
    </div>
  )
}
