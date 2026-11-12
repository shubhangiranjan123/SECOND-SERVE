import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Camera, Check, Copy, Minus, Plus, X } from 'lucide-react'
import Dial from './Dial'
import { AREAS } from './demoData'
import { photoToDataUrl } from './photo'
import { isExpired } from './rescueEngine'
import type { Donation, StorageType } from './types'
import type { RescueData } from './useRescueData'
import type { DispatchApi } from './useDispatch'
import './Roles.css'

type Props = {
  data: RescueData
  dispatch: DispatchApi
  now: number
  say: (msg: string) => void
}

const CATEGORIES = ['Meals', 'Bakery', 'Produce']
const HOURS = [1, 2, 4, 8]
const STORAGE: { value: StorageType; label: string }[] = [
  { value: 'Ambient', label: 'Room temp' },
  { value: 'Chilled', label: 'Chilled' },
  { value: 'Frozen', label: 'Frozen' },
]
// Plain-language checks the donor confirms before posting. They are the
// donor's own judgement; the app does not certify food safety.
const SAFETY = [
  'Kept at the right temperature since it was made',
  'Covered or packed, not from customers’ plates',
  'I’d be happy to eat it myself',
]

const DONOR_KEY = 'second-serve-me-donor'
const KG_PER_SERVING = 0.42
const CO2E_PER_KG = 2.5

type Step = { label: string; done: boolean }

function stepsFor(d: Donation, jobStatus: string | undefined): Step[] {
  const offered = d.status !== 'Available'
  const accepted = !!d.accepted || d.status === 'Delivered'
  const moving = jobStatus === 'Assigned' || jobStatus === 'Picked up' || d.status === 'Delivered'
  return [
    { label: 'Posted', done: true },
    { label: 'Partner found', done: offered },
    { label: 'Accepted', done: accepted },
    { label: 'Runner on the way', done: moving },
    { label: 'Eaten, not binned', done: d.status === 'Delivered' },
  ]
}

export default function DonorView({ data, dispatch, now, say }: Props) {
  const donors = useMemo(
    () => [...new Set([...data.donations.map((d) => d.donor), ...data.history.map((h) => h.donor)])].sort(),
    [data.donations, data.history],
  )
  const [me, setMe] = useState(() => sessionStorage.getItem(DONOR_KEY) ?? 'Daily Grind Cafe')
  const [custom, setCustom] = useState('')

  const [name, setName] = useState('')
  const [category, setCategory] = useState('Meals')
  const [servings, setServings] = useState(12)
  const [hours, setHours] = useState(2)
  const [storage, setStorage] = useState<StorageType>('Chilled')
  const [area, setArea] = useState(AREAS[7].name)
  const [pickup, setPickup] = useState('')
  const [photo, setPhoto] = useState<string | undefined>()
  const [checks, setChecks] = useState<boolean[]>(SAFETY.map(() => false))
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function chooseMe(value: string) {
    setMe(value)
    sessionStorage.setItem(DONOR_KEY, value)
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return
    try {
      setPhoto(await photoToDataUrl(file))
    } catch {
      setError('That photo could not be read. Try another one, or post without a photo.')
    }
  }

  function post(event: FormEvent) {
    event.preventDefault()
    const donor = me === '__new' ? custom.trim() : me
    if (!donor) return setError('Add your business name first.')
    if (!name.trim()) return setError('Say what the food is, like "veg biryani".')
    if (!checks.every(Boolean)) return setError('Tick the three safety checks before posting.')
    setError('')
    data.addQuick({ name: name.trim(), donor, category, servings, hoursGood: hours, storage, area, pickup: pickup.trim(), photo })
    if (me === '__new') chooseMe(donor)
    setName('')
    setPhoto(undefined)
    setPickup('')
    setChecks(SAFETY.map(() => false))
    say('Posted. We are finding it a home now.')
  }

  const donorName = me === '__new' ? custom.trim() : me
  const mine = data.donations
    .filter((d) => d.donor === donorName)
    .sort((a, b) => b.id - a.id)
  const myRescues = data.history.filter((h) => h.donor === donorName)
  const myServings = myRescues.reduce((s, r) => s + r.servings, 0)
  const myKg = Math.round(myServings * KG_PER_SERVING)
  const myCo2 = Math.round(myKg * CO2E_PER_KG)

  function copyCard() {
    const text = `${donorName} has rescued ${myServings} servings with Second Serve: about ${myKg} kg of food kept out of landfill and ${myCo2} kg of CO2e avoided.`
    navigator.clipboard?.writeText(text).then(
      () => say('Impact summary copied. Paste it anywhere.'),
      () => say(text),
    )
  }

  return (
    <div className="role role-donor">
      <header className="role-head">
        <div>
          <p className="role-hello">You're posting as</p>
          <select className="who" value={me} onChange={(e) => chooseMe(e.target.value)} aria-label="Your business">
            {donors.map((d) => (
              <option key={d}>{d}</option>
            ))}
            <option value="__new">A new business…</option>
          </select>
          {me === '__new' && (
            <input className="who-new" placeholder="Your business name" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Your business name" />
          )}
        </div>
      </header>

      <div className="role-grid">
        <form className="quick" onSubmit={post} noValidate>
          <h1>What's left today?</h1>

          <button type="button" className={`snap ${photo ? 'has-photo' : ''}`} onClick={() => fileRef.current?.click()} style={photo ? { backgroundImage: `url(${photo})` } : undefined}>
            {photo ? (
              <span className="snap-retake">Retake photo</span>
            ) : (
              <>
                <Camera size={30} aria-hidden="true" />
                <b>Snap a photo</b>
                <span>Optional, but partners love seeing it</span>
              </>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
          {photo && (
            <button type="button" className="link-button" onClick={() => setPhoto(undefined)}>
              <X size={14} /> Remove photo
            </button>
          )}

          <label className="field">
            What is it?
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Veg biryani" maxLength={60} />
          </label>

          <fieldset className="chips">
            <legend>Kind of food</legend>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className={category === c ? 'is-on' : ''} aria-pressed={category === c} onClick={() => { setCategory(c); setStorage(c === 'Meals' ? 'Chilled' : 'Ambient') }}>
                {c}
              </button>
            ))}
          </fieldset>

          <div className="stepper" role="group" aria-label="Servings">
            <span className="stepper-label">Servings</span>
            <button type="button" onClick={() => setServings((s) => Math.max(1, s - (s > 20 ? 5 : 1)))} aria-label="Fewer servings">
              <Minus size={20} />
            </button>
            <b className="num">{servings}</b>
            <button type="button" onClick={() => setServings((s) => s + (s >= 20 ? 5 : 1))} aria-label="More servings">
              <Plus size={20} />
            </button>
          </div>

          <fieldset className="chips">
            <legend>Good to eat for</legend>
            {HOURS.map((h) => (
              <button key={h} type="button" className={hours === h ? 'is-on' : ''} aria-pressed={hours === h} onClick={() => setHours(h)}>
                {h} h
              </button>
            ))}
          </fieldset>

          <fieldset className="chips">
            <legend>Kept</legend>
            {STORAGE.map((s) => (
              <button key={s.value} type="button" className={storage === s.value ? 'is-on' : ''} aria-pressed={storage === s.value} onClick={() => setStorage(s.value)}>
                {s.label}
              </button>
            ))}
          </fieldset>

          <div className="form-row">
            <label className="field">
              Pickup area
              <select value={area} onChange={(e) => setArea(e.target.value)}>
                {AREAS.map((a) => (
                  <option key={a.name}>{a.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Pickup note
              <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Back door" maxLength={60} />
            </label>
          </div>

          <fieldset className="checks">
            <legend>Quick safety check</legend>
            {SAFETY.map((s, i) => (
              <label key={s} className={checks[i] ? 'is-on' : ''}>
                <input type="checkbox" checked={checks[i]} onChange={() => setChecks((c) => c.map((v, j) => (j === i ? !v : v)))} />
                <span className="check-box">{checks[i] && <Check size={14} strokeWidth={3} />}</span>
                {s}
              </label>
            ))}
          </fieldset>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="post-button">
            Post it
          </button>
        </form>

        <section className="mine" aria-label="Your food">
          <div className="impact-card">
            <p className="impact-card-label">Your impact with Second Serve</p>
            <div className="impact-card-nums">
              <div>
                <b className="num">{myServings}</b>
                <span>servings eaten</span>
              </div>
              <div>
                <b className="num">{myKg}</b>
                <span>kg not binned</span>
              </div>
              <div>
                <b className="num">{myCo2}</b>
                <span>kg CO₂e avoided</span>
              </div>
            </div>
            <button type="button" className="impact-card-copy" onClick={copyCard}>
              <Copy size={15} /> Copy to share
            </button>
          </div>

          <h2>Your food today</h2>
          {mine.length === 0 && <p className="muted">Nothing posted yet. Whatever you post shows up here with a live countdown.</p>}
          {mine.map((d) => {
            const job = dispatch.jobs.find((j) => j.id === d.id)
            const ngo = data.ngos.find((n) => n.id === d.ngoId)
            const state = d.status === 'Available' ? (isExpired(d, now) ? 'expired' : 'live') : d.status === 'Reserved' ? 'reserved' : 'delivered'
            const steps = stepsFor(d, job?.status)
            return (
              <article key={d.id} className="mine-card">
                <Dial readyAt={d.readyAt} safeUntil={d.safeUntil} state={state} size={96} photo={d.photo} category={d.category} />
                <div className="mine-body">
                  <h3>
                    {d.serves} servings, {d.name.toLowerCase()}
                  </h3>
                  <p className="muted">
                    {state === 'expired'
                      ? 'The safe window passed before anyone could take it.'
                      : ngo
                        ? `${d.status === 'Delivered' ? 'Went to' : d.accepted ? 'Going to' : 'Offered to'} ${ngo.name}`
                        : 'Looking for the best partner'}
                  </p>
                  <ol className="steps">
                    {steps.map((s) => (
                      <li key={s.label} className={s.done ? 'is-done' : ''}>
                        {s.label}
                      </li>
                    ))}
                  </ol>
                  {d.thanks && <p className="thanks-note">"{d.thanks}", {ngo?.name}</p>}
                </div>
              </article>
            )
          })}
        </section>
      </div>
    </div>
  )
}
