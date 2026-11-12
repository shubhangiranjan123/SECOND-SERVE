import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { AREAS, defaultStorage, findArea } from './demoData'
import { UNITS, type FullListing } from './useRescueData'
import type { Donation, StorageType } from './types'

const MIN = 60_000

// datetime-local inputs use local time in the form "2026-11-11T18:30"
function toLocalInput(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Props = {
  editing: Donation | null
  onSave: (input: FullListing) => void
  onClose: () => void
}

// The full listing form, for the coordinator adding or fixing a listing.
// Donors use the 3-tap form on their own screen instead.
export default function ListingModal({ editing, onSave, onClose }: Props) {
  const [now] = useState(() => Date.now())
  const [name, setName] = useState(editing?.name ?? '')
  const [donor, setDonor] = useState(editing?.donor ?? '')
  const [category, setCategory] = useState(editing?.category ?? 'Meals')
  const [quantity, setQuantity] = useState(String(editing?.quantity ?? 10))
  const [location, setLocation] = useState(editing ? findArea(editing.location).name : AREAS[2].name)
  const [storage, setStorage] = useState<StorageType>(editing?.storage ?? 'Chilled')
  const [readyIn, setReadyIn] = useState(editing ? String(Math.max(0, Math.round((editing.readyAt - now) / MIN))) : '0')
  const [safeUntil, setSafeUntil] = useState(toLocalInput(editing?.safeUntil ?? now + 3 * 60 * MIN))
  const [pickup, setPickup] = useState(editing?.pickup ?? '')
  const [error, setError] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const at = Date.now()
    const deadline = new Date(safeUntil).getTime()
    const readyAt = at + Math.max(0, Number(readyIn) || 0) * MIN
    if (!name.trim() || !donor.trim()) return setError('Add the food name and the donor.')
    if (!Number.isFinite(deadline) || deadline <= at) return setError('The safe-use deadline must be in the future.')
    if (readyAt >= deadline) return setError('Food must be ready for pickup before its safe-use deadline.')
    onSave({
      name: name.trim(),
      donor: donor.trim(),
      category,
      quantity: Math.max(1, Number(quantity) || 1),
      location,
      pickup: pickup.trim(),
      storage,
      readyAt,
      safeUntil: deadline,
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="listing-title">
        <div className="modal-head">
          <div>
            <h2 id="listing-title">{editing ? 'Edit listing' : 'Add a listing'}</h2>
            <p>For listings phoned in or fixed by the coordinator.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close" type="button">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} className="form" noValidate>
          <label className="field">
            Food
            <input required maxLength={80} placeholder="Vegetable biryani" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Donor or business
            <input required maxLength={80} placeholder="The Green Kitchen" value={donor} onChange={(e) => setDonor(e.target.value)} />
          </label>
          <div className="form-row">
            <label className="field">
              Category
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value)
                  setStorage(defaultStorage(e.target.value))
                }}
              >
                <option>Meals</option>
                <option>Bakery</option>
                <option>Produce</option>
              </select>
            </label>
            <label className="field">
              Quantity ({UNITS[category]})
              <input type="number" min="1" max="10000" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
          </div>
          <div className="form-row">
            <label className="field">
              Pickup area
              <select value={location} onChange={(e) => setLocation(e.target.value)}>
                {AREAS.map((a) => (
                  <option key={a.name}>{a.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Storage
              <select value={storage} onChange={(e) => setStorage(e.target.value as StorageType)}>
                <option value="Ambient">Room temperature</option>
                <option value="Chilled">Chilled</option>
                <option value="Frozen">Frozen</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label className="field">
              Ready in (minutes)
              <input type="number" min="0" max="1440" value={readyIn} onChange={(e) => setReadyIn(e.target.value)} />
            </label>
            <label className="field">
              Safe to eat until
              <input type="datetime-local" value={safeUntil} onChange={(e) => setSafeUntil(e.target.value)} />
            </label>
          </div>
          <label className="field">
            Pickup note
            <input maxLength={100} placeholder="Before 7 PM, back door" value={pickup} onChange={(e) => setPickup(e.target.value)} />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="button-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button-primary">
              {editing ? 'Save changes' : 'Publish listing'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
