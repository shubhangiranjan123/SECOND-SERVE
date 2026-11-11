import { useState, type FormEvent } from 'react'
import './NgoMatching.css'
import type { Donation, Ngo, RescueRecord, VerificationStatus } from './types'
import { AREAS, findArea } from './demoData'
import { capacityUsage, hoursLabel } from './rescueEngine'

type Props = {
  ngos: Ngo[]
  donations: Donation[]
  history: RescueRecord[]
  now: number
  onUpdate: (ngo: Ngo) => void
  onAdd: (ngo: Ngo) => void
}

type NgoForm = {
  name: string
  type: string
  area: string
  dailyCapacity: string
  opensHour: string
  closesHour: string
  refrigeration: boolean
  freezer: boolean
}

const emptyNgoForm: NgoForm = {
  name: '',
  type: 'Community kitchen',
  area: AREAS[0].name,
  dailyCapacity: '50',
  opensHour: '9',
  closesHour: '21',
  refrigeration: false,
  freezer: false,
}

function clampInt(value: string, min: number, max: number) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

export default function NgoNetwork({ ngos, donations, history, now, onUpdate, onAdd }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NgoForm>({ ...emptyNgoForm })
  const [formError, setFormError] = useState('')

  const verifiedCount = ngos.filter((n) => n.verification === 'Verified').length
  const pendingCount = ngos.filter((n) => n.verification === 'Pending').length

  function setVerification(ngo: Ngo, verification: VerificationStatus) {
    const notes: Record<VerificationStatus, string> = {
      Verified: 'Verified by local coordinator',
      Pending: 'Verification revoked, awaiting re-review',
      Rejected: 'Rejected by local coordinator',
    }
    onUpdate({
      ...ngo,
      verification,
      verificationNote: notes[verification],
      verifiedAt: verification === 'Verified' ? Date.now() : null,
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = form.name.trim()
    const opens = clampInt(form.opensHour, 0, 23)
    const closes = clampInt(form.closesHour, 1, 24)

    if (!name) {
      setFormError('Please enter the organisation name.')
      return
    }
    if (ngos.some((n) => n.name.toLowerCase() === name.toLowerCase())) {
      setFormError('An organisation with this name is already registered.')
      return
    }
    if (closes <= opens) {
      setFormError('Closing hour must be after opening hour.')
      return
    }

    const area = findArea(form.area)
    onAdd({
      id: Date.now(),
      name,
      type: form.type,
      area: area.name,
      lat: area.lat,
      lng: area.lng,
      // New organisations always start unverified and cannot receive food yet.
      verification: 'Pending',
      verificationNote: 'Registered, awaiting coordinator review',
      verifiedAt: null,
      refrigeration: form.refrigeration,
      freezer: form.freezer,
      dailyCapacity: clampInt(form.dailyCapacity, 0, 10000),
      accepting: true,
      opensHour: opens,
      closesHour: closes,
    })

    setForm({ ...emptyNgoForm })
    setFormError('')
    setShowForm(false)
  }

  return (
    <section className="ngo-network" id="ngo-network">
      <div className="ngo-heading">
        <div>
          <span className="ngo-eyebrow">PARTNER NETWORK / 03</span>
          <h2>Who can safely receive food.</h2>
          <p>
            Only verified organisations that are accepting, have suitable storage and have
            capacity left today are offered as matches.
          </p>
        </div>
        <button type="button" className="button-outline" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : '+ Register organisation'}
        </button>
      </div>

      <div className="ngo-stats">
        <div className="ngo-stat">
          <span>VERIFIED PARTNERS</span>
          <strong>{verifiedCount}</strong>
        </div>
        <div className="ngo-stat">
          <span>AWAITING REVIEW</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="ngo-stat">
          <span>REGISTERED</span>
          <strong>{ngos.length}</strong>
        </div>
      </div>

      {showForm && (
        <form className="ngo-form" onSubmit={handleSubmit}>
          <label>
            Organisation name
            <input
              required
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Hope Community Pantry"
            />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Community kitchen</option>
              <option>Shelter</option>
              <option>Food bank</option>
              <option>Children's home</option>
              <option>Elder care</option>
            </select>
          </label>
          <label>
            Area (demo coordinates)
            <select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
              {AREAS.map((a) => (
                <option key={a.name}>{a.name}</option>
              ))}
            </select>
          </label>
          <label>
            Daily capacity (servings)
            <input
              type="number"
              min="0"
              max="10000"
              value={form.dailyCapacity}
              onChange={(e) => setForm({ ...form, dailyCapacity: e.target.value })}
            />
          </label>
          <label>
            Opens (hour, 0–23)
            <input
              type="number"
              min="0"
              max="23"
              value={form.opensHour}
              onChange={(e) => setForm({ ...form, opensHour: e.target.value })}
            />
          </label>
          <label>
            Closes (hour, 1–24)
            <input
              type="number"
              min="1"
              max="24"
              value={form.closesHour}
              onChange={(e) => setForm({ ...form, closesHour: e.target.value })}
            />
          </label>
          <label className="ngo-check">
            <input
              type="checkbox"
              checked={form.refrigeration}
              onChange={(e) => setForm({ ...form, refrigeration: e.target.checked })}
            />
            Has refrigeration
          </label>
          <label className="ngo-check">
            <input
              type="checkbox"
              checked={form.freezer}
              onChange={(e) => setForm({ ...form, freezer: e.target.checked })}
            />
            Has a freezer
          </label>
          {formError && <p className="ngo-form-error">{formError}</p>}
          <div className="ngo-form-actions">
            <span>New organisations start as “Pending” and cannot receive food until verified.</span>
            <button type="submit" className="button-primary">
              Register ↗
            </button>
          </div>
        </form>
      )}

      <div className="ngo-grid">
        {ngos.map((ngo) => {
          const usage = capacityUsage(ngo, donations, history, now)
          const usedPct =
            ngo.dailyCapacity > 0
              ? Math.min(100, ((usage.committed + usage.deliveredToday) / ngo.dailyCapacity) * 100)
              : 100

          return (
            <article
              className={`ngo-card ${ngo.verification !== 'Verified' ? 'ngo-unverified' : ''}`}
              key={ngo.id}
            >
              <div className="ngo-card-top">
                <div>
                  <h3>{ngo.name}</h3>
                  <span className="ngo-sub">
                    {ngo.type} · {ngo.area} · {hoursLabel(ngo)}
                  </span>
                </div>
                <span className={`ngo-badge badge-${ngo.verification.toLowerCase()}`}>
                  {ngo.verification === 'Verified' ? '✓ ' : ''}
                  {ngo.verification}
                </span>
              </div>

              <p className="ngo-note">{ngo.verificationNote}</p>

              <div className="ngo-facilities">
                <span className={ngo.refrigeration ? 'has' : 'lacks'}>
                  {ngo.refrigeration ? '✓' : '×'} Refrigeration
                </span>
                <span className={ngo.freezer ? 'has' : 'lacks'}>
                  {ngo.freezer ? '✓' : '×'} Freezer
                </span>
              </div>

              <div className="ngo-capacity">
                <div className="ngo-capacity-label">
                  <span>Capacity today</span>
                  <strong>
                    {usage.remaining} / {ngo.dailyCapacity} left
                  </strong>
                </div>
                <div className="ngo-capacity-bar">
                  <i style={{ width: `${usedPct}%` }} />
                </div>
                <span className="ngo-capacity-detail">
                  {usage.committed} reserved · {usage.deliveredToday} delivered today
                </span>
              </div>

              <div className="ngo-controls">
                <label>
                  Daily capacity
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={ngo.dailyCapacity}
                    onChange={(e) =>
                      onUpdate({ ...ngo, dailyCapacity: clampInt(e.target.value, 0, 10000) })
                    }
                  />
                </label>
                <label className="ngo-check">
                  <input
                    type="checkbox"
                    checked={ngo.accepting}
                    onChange={(e) => onUpdate({ ...ngo, accepting: e.target.checked })}
                  />
                  Accepting donations
                </label>
              </div>

              {usage.committed + usage.deliveredToday > ngo.dailyCapacity && (
                <p className="ngo-warning">
                  Capacity is below what is already reserved. Existing reservations are kept;
                  no new food will be matched here today.
                </p>
              )}

              <div className="ngo-actions">
                {ngo.verification === 'Verified' ? (
                  <button type="button" className="ngo-link" onClick={() => setVerification(ngo, 'Pending')}>
                    Revoke verification
                  </button>
                ) : (
                  <>
                    <button type="button" className="ngo-verify" onClick={() => setVerification(ngo, 'Verified')}>
                      Verify
                    </button>
                    {ngo.verification !== 'Rejected' && (
                      <button type="button" className="ngo-link" onClick={() => setVerification(ngo, 'Rejected')}>
                        Reject
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <p className="ngo-disclaimer">
        Prototype verification: a coordinator marks organisations as verified in this browser.
        In production this would follow a document check stored on a server.
      </p>
    </section>
  )
}
