import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import './App.css'
import './NgoMatching.css'
import WasteCounter from './WasteCounter'
import Dial from './Dial'
import Garden from './Garden'
import RescueMap from './RescueMap'
import RunnerDispatch, { DISPATCH_STORAGE_KEY, type DeliveryCompletion } from './RunnerDispatch'
import RescueIntelligenceTools from './RescueIntelligenceTools'
import NgoMatchModal from './NgoMatchModal'
import NgoNetwork from './NgoNetwork'
import type {
  Donation,
  DonationStatus,
  Ngo,
  RescueRecord,
  StorageType,
} from './types'
import {
  AREAS,
  createInitialDonations,
  createInitialNgos,
  defaultStorage,
  findArea,
} from './demoData'
import {
  evaluateNgo,
  isExpired,
  minutesBetween,
} from './rescueEngine'

type DonationForm = {
  name: string
  donor: string
  category: string
  quantity: string
  unit: string
  location: string
  pickup: string
  storage: StorageType
  readyInMinutes: string
  safeUntil: string // value of a datetime-local input
}

const DONATIONS_KEY = 'second-serve-donations'
const NGOS_KEY = 'second-serve-ngos-v1'
const HISTORY_KEY = 'second-serve-rescue-history-v1'
const MIN = 60_000

const filters = ['All food', 'Meals', 'Bakery', 'Produce']

// datetime-local inputs use local time in the form "2026-11-11T18:30"
function toLocalInput(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function makeEmptyForm(now: number): DonationForm {
  return {
    name: '',
    donor: '',
    category: 'Meals',
    quantity: '10',
    unit: 'meals',
    location: AREAS[2].name,
    pickup: '',
    storage: 'Chilled',
    readyInMinutes: '0',
    safeUntil: toLocalInput(now + 3 * 60 * MIN),
  }
}

function getCategoryDetails(category: string) {
  if (category === 'Bakery') {
    return { color: 'yellow', emoji: '🥐', unit: 'items' }
  }

  if (category === 'Produce') {
    return { color: 'green', emoji: '🥬', unit: 'kg' }
  }

  return { color: 'peach', emoji: '🍲', unit: 'meals' }
}

// Older saved listings do not have the matching fields. Fill them in once
// with safe defaults and flag the assumed deadline so it is never hidden.
function normaliseDonation(raw: Partial<Donation>, now: number): Donation | null {
  if (typeof raw.id !== 'number' || typeof raw.name !== 'string') return null

  const location = raw.location ?? ''
  const area = findArea(location)
  const category = raw.category ?? 'Meals'
  const status: DonationStatus =
    raw.status === 'Reserved' || raw.status === 'Delivered' ? raw.status : 'Available'
  const hasDeadline = typeof raw.safeUntil === 'number'

  return {
    id: raw.id,
    name: raw.name,
    donor: raw.donor ?? 'Unknown donor',
    category,
    quantity: raw.quantity ?? 1,
    unit: raw.unit ?? 'items',
    serves: raw.serves ?? raw.quantity ?? 1,
    distance: raw.distance ?? '',
    pickup: raw.pickup ?? '',
    expires: raw.expires ?? 'Today',
    status,
    emoji: raw.emoji ?? getCategoryDetails(category).emoji,
    color: raw.color ?? getCategoryDetails(category).color,
    location,
    storage: raw.storage ?? defaultStorage(category),
    lat: raw.lat ?? area.lat,
    lng: raw.lng ?? area.lng,
    readyAt: raw.readyAt ?? now,
    safeUntil: hasDeadline ? (raw.safeUntil as number) : now + 6 * 60 * MIN,
    deadlineAssumed: hasDeadline ? raw.deadlineAssumed : true,
    ngoId: typeof raw.ngoId === 'number' ? raw.ngoId : null,
  }
}

function loadDonations(): Donation[] {
  const now = Date.now()

  try {
    const saved = localStorage.getItem(DONATIONS_KEY)

    if (saved) {
      const parsed: unknown = JSON.parse(saved)

      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => normaliseDonation(item as Partial<Donation>, now))
          .filter((item): item is Donation => item !== null)
      }
    }
  } catch {
    console.warn('Could not load saved donations.')
  }

  return createInitialDonations(now)
}

function loadNgos(): Ngo[] {
  try {
    const saved = localStorage.getItem(NGOS_KEY)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (n): n is Ngo =>
            !!n &&
            typeof n === 'object' &&
            typeof (n as Ngo).id === 'number' &&
            typeof (n as Ngo).name === 'string' &&
            typeof (n as Ngo).dailyCapacity === 'number',
        )
      }
    }
  } catch {
    console.warn('Could not load saved organisations.')
  }
  return createInitialNgos()
}

function loadHistory(): RescueRecord[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        // Keep only well-formed records, and only one per donation.
        const seen = new Set<number>()
        return parsed.filter((r): r is RescueRecord => {
          const ok =
            !!r &&
            typeof r === 'object' &&
            typeof (r as RescueRecord).donationId === 'number' &&
            typeof (r as RescueRecord).deliveredAt === 'number' &&
            !seen.has((r as RescueRecord).donationId)
          if (ok) seen.add((r as RescueRecord).donationId)
          return ok
        })
      }
    }
  } catch {
    console.warn('Could not load rescue history.')
  }
  return []
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    console.warn(`Could not save ${key}.`)
  }
}

// Re-renders every 30 seconds so countdowns and deadline checks stay current.
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

function App() {
  const [donations, setDonations] = useState<Donation[]>(loadDonations)
  const [ngos, setNgos] = useState<Ngo[]>(loadNgos)
  const [rescueHistory, setRescueHistory] = useState<RescueRecord[]>(loadHistory)
  const [matchingDonationId, setMatchingDonationId] = useState<number | null>(null)
  const now = useNow()
  const [activeFilter, setActiveFilter] = useState('All food')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  // Rescue Twin: a quick "will it make it in time?" check.
  const [travelMinutes, setTravelMinutes] = useState('15')
  const [preparationMinutes, setPreparationMinutes] = useState('5')
  const [expiryMinutes, setExpiryMinutes] = useState('60')
  const rescueTotalMinutes = Number(travelMinutes) + Number(preparationMinutes)
  const rescueBufferMinutes = Number(expiryMinutes) - rescueTotalMinutes
  const isRescueFeasible = rescueBufferMinutes >= 0

  const [editingDonation, setEditingDonation] =
    useState<Donation | null>(null)
  const [donationToRemove, setDonationToRemove] =
    useState<Donation | null>(null)
  const [notice, setNotice] = useState('')
  const [noticeLink, setNoticeLink] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  // Bumped on "Reset demo" so Runner Dispatch remounts with fresh state.
  const [dispatchKey, setDispatchKey] = useState(0)
  const [form, setForm] = useState<DonationForm>(() => makeEmptyForm(Date.now()))

  function say(message: string, link: string | null = null) {
    setNotice(message)
    setNoticeLink(link)
  }

  function dismissNotice() {
    say('')
  }

  useEffect(() => saveToStorage(DONATIONS_KEY, donations), [donations])
  useEffect(() => saveToStorage(NGOS_KEY, ngos), [ngos])
  useEffect(() => saveToStorage(HISTORY_KEY, rescueHistory), [rescueHistory])

  const availableCount = donations.filter(
    (item) => item.status === 'Available' && !isExpired(item, now),
  ).length

  // Potential impact: listed or reserved, not yet delivered, not expired.
  const totalServings = donations
    .filter(
      (item) =>
        item.status === 'Reserved' ||
        (item.status === 'Available' && !isExpired(item, now)),
    )
    .reduce((total, item) => total + item.serves, 0)

  const verifiedPartners = ngos.filter((n) => n.verification === 'Verified').length

  const matchingDonation =
    donations.find((item) => item.id === matchingDonationId) ?? null

  // Donations handed to Runner Dispatch carry the destination organisation.
  const dispatchDonations = useMemo(() => {
    const ngoNames = new Map(ngos.map((n) => [n.id, n.name]))
    return donations.map((d) => ({
      ...d,
      destination: d.ngoId !== null ? ngoNames.get(d.ngoId) ?? null : null,
    }))
  }, [donations, ngos])

  const filteredDonations = useMemo(() => {
    const query = search.trim().toLowerCase()

    return donations.filter((item) => {
      const matchesFilter =
        activeFilter === 'All food' || item.category === activeFilter

      const searchableText =
        `${item.name} ${item.donor} ${item.category} ${item.location}`.toLowerCase()

      const matchesSearch = !query || searchableText.includes(query)

      return matchesFilter && matchesSearch
    })
  }, [donations, activeFilter, search])

  // Most urgent first: live food by deadline, then reserved, delivered, expired.
  const orderedDonations = useMemo(() => {
    const rank = (d: Donation) =>
      d.status === 'Available' && !isExpired(d, now)
        ? 0
        : d.status === 'Reserved'
          ? 1
          : d.status === 'Delivered'
            ? 2
            : 3
    return [...filteredDonations].sort(
      (a, b) => rank(a) - rank(b) || a.safeUntil - b.safeUntil,
    )
  }, [filteredDonations, now])

  const featuredId =
    orderedDonations[0] &&
    orderedDonations[0].status === 'Available' &&
    !isExpired(orderedDonations[0], now)
      ? orderedDonations[0].id
      : null

  function openNewDonationForm() {
    setEditingDonation(null)
    setForm(makeEmptyForm(Date.now()))
    say('')
    setShowForm(true)
  }

  function openEditDonationForm(donation: Donation) {
    setEditingDonation(donation)
    setForm({
      name: donation.name,
      donor: donation.donor,
      category: donation.category,
      quantity: String(donation.quantity),
      unit: donation.unit,
      location: findArea(donation.location).name,
      pickup: donation.pickup,
      storage: donation.storage,
      readyInMinutes: String(
        Math.max(0, minutesBetween(now, donation.readyAt)),
      ),
      safeUntil: toLocalInput(donation.safeUntil),
    })
    say('')
    setShowForm(true)
  }

  function closeDonationForm() {
    setShowForm(false)
    setEditingDonation(null)
    setForm(makeEmptyForm(Date.now()))
  }

  function handleCategoryChange(category: string) {
    const details = getCategoryDetails(category)

    setForm((current) => ({
      ...current,
      category,
      unit: details.unit,
      storage: defaultStorage(category),
    }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const quantity = Math.max(1, Number(form.quantity) || 1)
    const categoryDetails = getCategoryDetails(form.category)

    const name = form.name.trim()
    const donor = form.donor.trim()
    const location = form.location.trim()
    const pickup = form.pickup.trim() || 'Time to be confirmed'

    if (!name || !donor || !location) {
      say('Add the food name, donor and pickup area.')
      return
    }

    const submittedAt = Date.now()
    const area = findArea(location)
    const safeUntil = new Date(form.safeUntil).getTime()
    const readyAt =
      submittedAt + Math.max(0, Number(form.readyInMinutes) || 0) * MIN

    if (!Number.isFinite(safeUntil) || safeUntil <= submittedAt) {
      say('The safe-use deadline must be in the future.')
      return
    }

    if (readyAt >= safeUntil) {
      say('Food must be ready for pickup before its safe-use deadline.')
      return
    }

    const matchingFields = {
      storage: form.storage,
      lat: area.lat,
      lng: area.lng,
      readyAt,
      safeUntil,
      deadlineAssumed: false,
    }

    if (editingDonation) {
      setDonations((current) =>
        current.map((donation) =>
          donation.id === editingDonation.id
            ? {
                ...donation,
                name,
                donor,
                category: form.category,
                quantity,
                unit: form.unit,
                serves:
                  form.category === 'Produce' ? quantity * 2 : quantity,
                pickup,
                location,
                color: categoryDetails.color,
                emoji: categoryDetails.emoji,
                ...matchingFields,
              }
            : donation,
        ),
      )

      say('Changes saved.')
    } else {
      const newDonation: Donation = {
        id: Date.now(),
        name,
        donor,
        category: form.category,
        quantity,
        unit: form.unit,
        serves: form.category === 'Produce' ? quantity * 2 : quantity,
        distance: 'New listing',
        pickup,
        expires: 'Today',
        status: 'Available',
        emoji: categoryDetails.emoji,
        color: categoryDetails.color,
        location,
        ...matchingFields,
        ngoId: null,
      }

      setDonations((current) => [newDonation, ...current])
      say('Donation published to the rescue board.')
    }

    setActiveFilter('All food')
    setSearch('')
    closeDonationForm()
  }

  function removeDonation(id: number) {
    const donation = donations.find((item) => item.id === id)

    if (donation?.status === 'Reserved') {
      // A reserved donation has a rescue job (and maybe a busy runner).
      // Removing it would leave the dispatch side inconsistent.
      say(
        `"${donation.name}" is reserved for a rescue and cannot be removed until it is delivered.`,
      )
      return
    }

    if (donation) {
      setDonationToRemove(donation)
    }
  }

  function confirmRemoveDonation() {
    if (!donationToRemove) return

    setDonations((current) =>
      current.filter((item) => item.id !== donationToRemove.id),
    )

    say('Donation removed from the rescue board.')
    setDonationToRemove(null)
  }

  // "Reserve donation" now opens Smart NGO Matching first.
  function reserveDonation(id: number) {
    const item = donations.find((donation) => donation.id === id)

    if (!item || item.status !== 'Available') return

    setMatchingDonationId(id)
  }

  function confirmReservation(donationId: number, ngoId: number) {
    const item = donations.find((d) => d.id === donationId)
    const ngo = ngos.find((n) => n.id === ngoId)

    if (!item || !ngo || item.status !== 'Available') return

    // Re-check eligibility at the moment of confirming, in case time has
    // passed or capacity changed while the modal was open.
    const check = evaluateNgo(item, ngo, donations, rescueHistory, Date.now())

    if (!check.eligible) {
      say(`${ngo.name} is no longer eligible: ${check.failures[0]}`)
      return
    }

    setDonations((current) =>
      current.map((donation) =>
        donation.id === donationId && donation.status === 'Available'
          ? { ...donation, status: 'Reserved', ngoId }
          : donation,
      ),
    )

    setMatchingDonationId(null)
    say(`"${item.name}" is going to ${ngo.name} (match score ${check.score}/100). Send a runner from Dispatch.`, '#dispatch')
  }

  // Called by Runner Dispatch when a job reaches "Delivered".
  // This is the ONLY place a rescue record is created, and it is keyed by
  // donation id, so the same rescue can never be counted twice.
  function recordDelivery(completion: DeliveryCompletion) {
    const donation = donations.find((d) => d.id === completion.donationId)

    if (!donation) return

    const ngo = ngos.find((n) => n.id === donation.ngoId)
    const deliveredAt = Date.now()

    setRescueHistory((current) => {
      if (current.some((r) => r.donationId === completion.donationId)) {
        return current
      }

      const record: RescueRecord = {
        rescueId: `R-${completion.donationId}`,
        donationId: completion.donationId,
        food: donation.name,
        donor: donation.donor,
        pickupArea: donation.location,
        ngoId: donation.ngoId,
        ngoName: ngo?.name ?? completion.destination,
        runnerName: completion.runnerName,
        quantity: donation.quantity,
        unit: donation.unit,
        servings: donation.serves,
        deliveredAt,
      }

      return [record, ...current]
    })

    setDonations((current) =>
      current.map((d) =>
        d.id === completion.donationId && d.status === 'Reserved'
          ? { ...d, status: 'Delivered' }
          : d,
      ),
    )
    say(`${donation.name} delivered by ${completion.runnerName}. A new flower is in the garden.`, '#garden')
  }

  // Sample deadlines are relative to first load, so after a day every
  // listing has expired. This puts the demo back to a fresh state.
  function resetDemo() {
    const fresh = Date.now()
    try {
      localStorage.removeItem(DISPATCH_STORAGE_KEY)
    } catch {
      /* storage unavailable: state reset below still works */
    }
    setDonations(createInitialDonations(fresh))
    setNgos(createInitialNgos())
    setRescueHistory([])
    setDispatchKey((k) => k + 1)
    setConfirmReset(false)
    say('Demo data reset. Every countdown starts fresh.')
  }

  function updateNgo(updated: Ngo) {
    setNgos((current) => current.map((n) => (n.id === updated.id ? updated : n)))
  }

  function addNgo(ngo: Ngo) {
    setNgos((current) => [...current, ngo])
    say(`${ngo.name} registered. Verify it before it can receive food.`)
  }

  const liveCount = availableCount
  const urgentCount = donations.filter(
    (d) =>
      d.status === 'Available' &&
      !isExpired(d, now) &&
      minutesBetween(now, d.safeUntil) < 90,
  ).length

  return (
    <div className="app">
      <header className="topnav">
        <a className="brand" href="#top" aria-label="Second Serve, back to top">
          <span className="brand-blob" aria-hidden="true" />
          second serve
        </a>
        <nav aria-label="Sections">
          <a href="#board">Board</a>
          <a href="#map">Map</a>
          <a href="#partners">Partners</a>
          <a href="#dispatch">Dispatch</a>
          <a href="#tools">Planning</a>
          <a href="#garden">Impact</a>
        </nav>
        <button type="button" className="topnav-cta" onClick={openNewDonationForm}>
          <Plus size={17} strokeWidth={2.4} /> List food
        </button>
      </header>

      <main id="top">
        <WasteCounter onList={openNewDonationForm} />

        <div className="page">
          {notice && !showForm && (
            <div className="notice" role="status">
              <span>{notice}</span>
              {noticeLink && (
                <a className="notice-link" href={noticeLink} onClick={dismissNotice}>
                  {noticeLink === '#garden' ? 'See the garden' : 'Go to dispatch'}
                </a>
              )}
              <button className="notice-close" onClick={dismissNotice} aria-label="Dismiss">
                <X size={18} />
              </button>
            </div>
          )}

          <section className="turn" aria-labelledby="turn-title">
            <h2 id="turn-title">
              Some of it is perfectly good food, ten minutes away from someone who needs it.
            </h2>
            <p className="turn-copy">
              A café lists what it can't sell. Second Serve finds a verified partner that can
              store it and still has room today, then sends a runner before it spoils.
            </p>
            <p className="turn-live">
              <span className="live-dot" aria-hidden="true" />
              Right now: <b className="num">{liveCount}</b> {liveCount === 1 ? 'listing' : 'listings'} waiting
              {urgentCount > 0 && (
                <>
                  , <b className="num pink">{urgentCount}</b> under 90 minutes
                </>
              )}
              , <b className="num">{totalServings}</b> servings on the board,{' '}
              <b className="num">{verifiedPartners}</b> of {ngos.length} partners verified.
            </p>
          </section>

          <section className="board" id="donations" aria-labelledby="board-title">
            <span id="board" className="anchor" />
            <div className="section-head">
              <div>
                <h2 id="board-title">Before it spoils</h2>
                <p>
                  A full ring is 12 hours of safe time. Rings drain live and turn pink under 90
                  minutes. Most urgent first.
                </p>
              </div>
              <div className="board-tools">
                <div className="filter-tabs" role="group" aria-label="Filter by category">
                  {filters.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={activeFilter === filter ? 'is-on' : ''}
                      aria-pressed={activeFilter === filter}
                      onClick={() => setActiveFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={17} aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="Food, donor or area"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-label="Search listings"
                  />
                </label>
              </div>
            </div>

            <div className="dial-grid">
              {orderedDonations.map((donation) => {
                const expired = donation.status === 'Available' && isExpired(donation, now)
                const state = expired
                  ? 'expired'
                  : donation.status === 'Available'
                    ? 'live'
                    : donation.status === 'Reserved'
                      ? 'reserved'
                      : 'delivered'
                const featured = donation.id === featuredId
                const destination = ngos.find((n) => n.id === donation.ngoId)?.name ?? null
                const urgent = state === 'live' && minutesBetween(now, donation.safeUntil) < 90

                return (
                  <article
                    key={donation.id}
                    className={`food is-${state} ${featured ? 'is-featured' : ''} ${urgent ? 'is-urgent' : ''}`}
                  >
                    <Dial
                      readyAt={donation.readyAt}
                      safeUntil={donation.safeUntil}
                      state={state}
                      size={featured ? 184 : 124}
                    />

                    <div className="food-body">
                      <p className="food-tags">
                        <span className={`tag tag-${state}`}>
                          {state === 'live'
                            ? urgent
                              ? 'Hurry'
                              : 'Waiting'
                            : state === 'reserved'
                              ? 'Reserved'
                              : state === 'delivered'
                                ? 'Delivered'
                                : 'Expired'}
                        </span>
                        <span className="tag tag-plain">{donation.category}</span>
                        <span className="tag tag-plain">{donation.storage}</span>
                      </p>
                      <h3>{donation.name}</h3>
                      <p className="food-meta">
                        {donation.donor}, {donation.location}
                      </p>
                      <p className="food-meta">
                        <b>
                          {donation.quantity} {donation.unit}
                        </b>
                        , about {donation.serves} servings. {donation.pickup}
                        {donation.deadlineAssumed ? '. Deadline assumed' : ''}
                      </p>
                      {destination && (
                        <p className="food-dest">
                          {donation.status === 'Delivered' ? 'Went to' : 'Going to'} {destination}
                        </p>
                      )}

                      <div className="food-actions">
                        {state === 'live' ? (
                          <button
                            type="button"
                            className="button-primary"
                            onClick={() => reserveDonation(donation.id)}
                          >
                            Find it a home
                          </button>
                        ) : (
                          <span className="food-status">
                            {state === 'reserved'
                              ? 'Waiting for a runner'
                              : state === 'delivered'
                                ? 'Eaten, not binned'
                                : 'Not safe to rescue'}
                          </span>
                        )}
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => openEditDonationForm(donation)}
                          aria-label={`Edit ${donation.name}`}
                          title="Edit"
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-danger"
                          onClick={() => removeDonation(donation.id)}
                          aria-label={`Remove ${donation.name}`}
                          title="Remove"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            {orderedDonations.length === 0 && (
              <div className="empty">
                <p className="empty-title">Nothing matches that</p>
                <p>Try another category, or clear the search to see every listing.</p>
                <button
                  type="button"
                  className="button-outline"
                  onClick={() => {
                    setSearch('')
                    setActiveFilter('All food')
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </section>

          <RescueMap donations={donations} ngos={ngos} now={now} />

          <NgoNetwork
            ngos={ngos}
            donations={donations}
            history={rescueHistory}
            now={now}
            onUpdate={updateNgo}
            onAdd={addNgo}
          />

          <RunnerDispatch
            key={dispatchKey}
            donations={dispatchDonations}
            now={now}
            onDeliveryComplete={recordDelivery}
          />

          <section className="tools" id="tools" aria-labelledby="tools-title">
            <div className="section-head">
              <div>
                <h2 id="tools-title">Planning tools</h2>
                <p>
                  Quick simulators for the questions coordinators ask most. Simple rules, not
                  trained models.
                </p>
              </div>
            </div>

            <div className="tool-grid">
              <article className="tool">
                <h3>Will it make it?</h3>
                <p className="tool-sub">Travel plus prep time against the safe-use window.</p>
                <div className="tool-fields">
                  <label className="field">
                    Travel (min)
                    <input type="number" min="0" value={travelMinutes} onChange={(e) => setTravelMinutes(e.target.value)} />
                  </label>
                  <label className="field">
                    Prep (min)
                    <input type="number" min="0" value={preparationMinutes} onChange={(e) => setPreparationMinutes(e.target.value)} />
                  </label>
                  <label className="field">
                    Safe for (min)
                    <input type="number" min="0" value={expiryMinutes} onChange={(e) => setExpiryMinutes(e.target.value)} />
                  </label>
                </div>
                <div className={`verdict ${isRescueFeasible ? 'is-good' : 'is-bad'}`} aria-live="polite">
                  <strong>{isRescueFeasible ? 'Makes it' : 'Too late'}</strong>
                  <span>
                    {isRescueFeasible
                      ? `${rescueBufferMinutes} minutes to spare`
                      : `${Math.abs(rescueBufferMinutes)} minutes past the window`}
                  </span>
                </div>
              </article>

              <RescueIntelligenceTools
                donations={donations.filter(
                  (d) => d.status !== 'Delivered' && !isExpired(d, now),
                )}
              />
            </div>
          </section>

          <Garden history={rescueHistory} />

          <footer className="footer">
            <span className="footer-brand">second serve</span>
            <p>
              Food loss and waste is 8 to 10% of global greenhouse gas emissions (UNEP).
              Rescuing it is climate action.
            </p>
            <button type="button" className="footer-reset" onClick={() => setConfirmReset(true)}>
              Reset demo data
            </button>
          </footer>
        </div>
      </main>

      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDonationForm()
          }}
        >
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-head">
              <div>
                <h2 id="modal-title">{editingDonation ? 'Edit listing' : 'List surplus food'}</h2>
                <p>Share the details so a nearby partner can take it in time.</p>
              </div>
              <button className="modal-close" onClick={closeDonationForm} aria-label="Close" type="button">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="form">
              <label className="field">
                Food
                <input
                  required
                  maxLength={80}
                  placeholder="Vegetable biryani"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </label>
              <label className="field">
                Donor or business
                <input
                  required
                  maxLength={80}
                  placeholder="The Green Kitchen"
                  value={form.donor}
                  onChange={(event) => setForm({ ...form, donor: event.target.value })}
                />
              </label>
              <div className="form-row">
                <label className="field">
                  Category
                  <select value={form.category} onChange={(event) => handleCategoryChange(event.target.value)}>
                    <option>Meals</option>
                    <option>Bakery</option>
                    <option>Produce</option>
                  </select>
                </label>
                <label className="field">
                  Quantity ({form.unit})
                  <input
                    required
                    type="number"
                    min="1"
                    max="10000"
                    value={form.quantity}
                    onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                  />
                </label>
              </div>
              <div className="form-row">
                <label className="field">
                  Pickup area
                  <select value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })}>
                    {AREAS.map((area) => (
                      <option key={area.name}>{area.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Storage
                  <select
                    value={form.storage}
                    onChange={(event) => setForm({ ...form, storage: event.target.value as StorageType })}
                  >
                    <option value="Ambient">Room temperature</option>
                    <option value="Chilled">Chilled</option>
                    <option value="Frozen">Frozen</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label className="field">
                  Ready in (minutes)
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    value={form.readyInMinutes}
                    onChange={(event) => setForm({ ...form, readyInMinutes: event.target.value })}
                  />
                </label>
                <label className="field">
                  Safe to eat until
                  <input
                    required
                    type="datetime-local"
                    value={form.safeUntil}
                    onChange={(event) => setForm({ ...form, safeUntil: event.target.value })}
                  />
                </label>
              </div>
              <label className="field">
                Pickup note
                <input
                  maxLength={100}
                  placeholder="Before 7 PM, back door"
                  value={form.pickup}
                  onChange={(event) => setForm({ ...form, pickup: event.target.value })}
                />
              </label>

              <p className="form-note">
                Only list food that has been stored safely. The safe-use time is your own judgement;
                Second Serve uses it for planning and doesn't certify food safety.
              </p>

              {notice && (
                <p className="form-error" role="alert">
                  {notice}
                </p>
              )}

              <div className="modal-actions">
                <button type="button" className="button-ghost" onClick={closeDonationForm}>
                  Cancel
                </button>
                <button type="submit" className="button-primary">
                  {editingDonation ? 'Save changes' : 'Publish listing'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {matchingDonation && (
        <NgoMatchModal
          donation={matchingDonation}
          donations={donations}
          ngos={ngos}
          history={rescueHistory}
          now={now}
          onReserve={confirmReservation}
          onClose={() => setMatchingDonationId(null)}
        />
      )}

      {donationToRemove && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDonationToRemove(null)
          }}
        >
          <section className="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="remove-title">
            <h2 id="remove-title">Remove this listing?</h2>
            <p className="modal-text">
              <b>{donationToRemove.name}</b> will come off the board. This can't be undone.
            </p>
            <div className="modal-actions">
              <button className="button-ghost" onClick={() => setDonationToRemove(null)} type="button">
                Keep it
              </button>
              <button className="button-danger" onClick={confirmRemoveDonation} type="button">
                Remove listing
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmReset && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmReset(false)
          }}
        >
          <section className="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <h2 id="reset-title">Reset the demo?</h2>
            <p className="modal-text">
              Listings, partners, dispatch and the garden go back to the sample data with fresh
              countdowns. Use this before presenting.
            </p>
            <div className="modal-actions">
              <button className="button-ghost" onClick={() => setConfirmReset(false)} type="button">
                Cancel
              </button>
              <button className="button-danger" onClick={resetDemo} type="button">
                Reset demo data
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
