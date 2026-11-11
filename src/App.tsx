import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'
import './NgoMatching.css'
import RescueMap from './RescueMap'
import RunnerDispatch, { type DeliveryCompletion } from './RunnerDispatch'
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
  formatClock,
  formatDuration,
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

function urgencyOf(donation: Donation, now: number) {
  const left = minutesBetween(now, donation.safeUntil)
  if (left <= 0) return 'expired'
  if (left <= 60) return 'critical'
  if (left <= 180) return 'high'
  return 'normal'
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
const [travelMinutes, setTravelMinutes] = useState('15')
const [preparationMinutes, setPreparationMinutes] = useState('5')
const [expiryMinutes, setExpiryMinutes] = useState('60')

const rescueTotalMinutes =
  Number(travelMinutes) + Number(preparationMinutes)

const rescueBufferMinutes =
  Number(expiryMinutes) - rescueTotalMinutes

const isRescueFeasible = rescueBufferMinutes >= 0

  const [editingDonation, setEditingDonation] =
    useState<Donation | null>(null)
  const [donationToRemove, setDonationToRemove] =
    useState<Donation | null>(null)
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<DonationForm>(() => makeEmptyForm(Date.now()))

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

  // Actual impact: comes ONLY from the permanent rescue history.
  const lifetimeRescues = rescueHistory.length
  const lifetimeServings = rescueHistory.reduce((sum, r) => sum + r.servings, 0)
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

  function openNewDonationForm() {
    setEditingDonation(null)
    setForm(makeEmptyForm(Date.now()))
    setNotice('')
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
    setNotice('')
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
      setNotice('Please complete all required fields.')
      return
    }

    const submittedAt = Date.now()
    const area = findArea(location)
    const safeUntil = new Date(form.safeUntil).getTime()
    const readyAt =
      submittedAt + Math.max(0, Number(form.readyInMinutes) || 0) * MIN

    if (!Number.isFinite(safeUntil) || safeUntil <= submittedAt) {
      setNotice('The safe-use deadline must be in the future.')
      return
    }

    if (readyAt >= safeUntil) {
      setNotice('Food must be ready for pickup before its safe-use deadline.')
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

      setNotice('Donation updated successfully.')
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
      setNotice('Your food donation has been listed successfully.')
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
      setNotice(
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

    setNotice('Donation removed from the rescue board.')
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
      setNotice(`${ngo.name} is no longer eligible: ${check.failures[0]}`)
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
    setNotice(`"${item.name}" reserved for ${ngo.name} (match score ${check.score}/100).`)
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
  }

  function updateNgo(updated: Ngo) {
    setNgos((current) => current.map((n) => (n.id === updated.id ? updated : n)))
  }

  function addNgo(ngo: Ngo) {
    setNgos((current) => [...current, ngo])
    setNotice(`${ngo.name} registered. Verify it before it can receive food.`)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="Second Serve home">
          <span className="brand-mark">
            s<span>·</span>
          </span>
          <span className="brand-name">
            second<span>serve</span>
          </span>
        </a>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="side-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#home">
            <span className="nav-icon">◫</span> Overview
          </a>
          <a className="nav-link" href="#donations">
            <span className="nav-icon">♧</span> Food donations
            <span className="nav-count">{availableCount}</span>
          </a>
          <a className="nav-link" href="#ngo-network">
            <span className="nav-icon">⌂</span> NGO network
          </a>
          <a className="nav-link" href="#intelligence">
            <span className="nav-icon">✳</span> Rescue intelligence
          </a>
          <a className="nav-link" href="#impact">
            <span className="nav-icon">↗</span> Impact report
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <div className="help-spark">✳</div>
            <h3>
              Good food.
              <br />
              Better futures.
            </h3>
            <p>
              Every rescued meal is a little less waste and a little more
              hope.
            </p>
            <a href="#impact" className="help-link">
              See our mission ↗
            </a>
          </div>

          <div className="profile-row">
            <div className="profile-avatar">SS</div>
            <div className="profile-info">
              <strong>Community hub</strong>
              <span>Local coordinator</span>
            </div>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="home">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>Overview</strong>
          </div>

          <div className="topbar-right">
            <span className="live-status">
              <span /> Live overview
            </span>
            <div className="top-avatar">SS</div>
          </div>
        </header>

        <div className="page-content">
          {notice && (
            <div className="notice" role="status">
              <span>✓</span> {notice}
              <button
                className="notice-close"
                onClick={() => setNotice('')}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          )}

          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-dot" /> FOOD RESCUE NETWORK
              </div>

              <h1>
                Good food deserves
                <br />
                another <span>chance.</span>
              </h1>

              <p className="welcome-copy">
                Rescue surplus food, connect with your community, and turn
                what might go to waste into something wonderful.
              </p>

              <div className="welcome-actions">
                <button
                  className="button-primary"
                  onClick={openNewDonationForm}
                >
                  <span className="button-plus">+</span> List surplus food
                </button>
                <a className="text-link" href="#donations">
                  Explore donations <span>↗</span>
                </a>
              </div>
            </div>

            <div
              className="hero-art"
              aria-label="Illustration of food being rescued"
            >
              <div className="hero-orbit orbit-one" />
              <div className="hero-orbit orbit-two" />
              <div className="hero-leaf leaf-one">✳</div>
              <div className="hero-leaf leaf-two">✳</div>
              <div className="hero-food">🥗</div>
              <div className="hero-sticker sticker-top">
                <span>✳</span> LESS WASTE
              </div>
              <div className="hero-sticker sticker-bottom">
                <span>♥</span> MORE GOOD
              </div>
              <div className="hero-mini-card">
                <span className="mini-check">✓</span>
                <div>
                  <strong>Food rescued!</strong>
                  <small>A little goes a long way.</small>
                </div>
              </div>
            </div>
          </section>

          <section
            className="stats-grid"
            id="impact"
            aria-label="Food rescue statistics"
          >
            <article className="stat-card">
              <div className="stat-top">
                <span>Available donations</span>
                <span className="stat-icon mint">♧</span>
              </div>
              <div className="stat-value">
                {availableCount.toString().padStart(2, '0')}
                <span className="stat-unit"> listings</span>
              </div>
              <div className="stat-foot">
                <span className="tiny-dot green-dot" /> Ready to be rescued
              </div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Potential servings</span>
                <span className="stat-icon peach-bg">♡</span>
              </div>
              <div className="stat-value">
                {totalServings.toLocaleString()}
                <span className="stat-unit"> servings</span>
              </div>
              <div className="stat-foot">Listed or reserved · not yet delivered</div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Verified partners</span>
                <span className="stat-icon lilac-bg">♧</span>
              </div>
              <div className="stat-value">
                {verifiedPartners}
                <span className="stat-unit"> of {ngos.length} organisations</span>
              </div>
              <div className="stat-foot">Eligible to receive food</div>
            </article>

            <article className="stat-card stat-highlight">
              <div className="stat-top">
                <span>Lifetime rescues</span>
                <span className="stat-icon cream-bg">✳</span>
              </div>
              <div className="stat-value">
                {lifetimeRescues}
                <span className="stat-unit">
                  {' '}
                  {lifetimeRescues === 1 ? 'rescue' : 'rescues'} completed
                </span>
              </div>
              <div className="stat-foot">
                {lifetimeServings.toLocaleString()} servings delivered · actual impact
              </div>
            </article>
          </section>

          <section className="donations-section" id="donations">
            <div className="section-heading">
              <div>
                <div className="eyebrow">THE RESCUE BOARD</div>
                <h2>
                  Food looking for a home
                  <span className="heading-period">.</span>
                </h2>
                <p className="section-subtitle">
                  Fresh opportunities to make a difference in your
                  neighbourhood.
                </p>
              </div>

              <button
                className="button-outline"
                onClick={openNewDonationForm}
              >
                + Add a donation
              </button>
            </div>

            <div className="donation-controls">
              <div
                className="filter-tabs"
                role="group"
                aria-label="Filter donations"
              >
                {filters.map((filter) => (
                  <button
                    key={filter}
                    className={`filter-tab ${
                      activeFilter === filter ? 'selected' : ''
                    }`}
                    onClick={() => setActiveFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <label className="search-box">
                <span>⌕</span>
                <input
                  type="search"
                  placeholder="Search food or donor..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search donations"
                />
              </label>
            </div>

            <div className="donation-grid">
              {filteredDonations.map((donation) => {
                const expired =
                  donation.status === 'Available' && isExpired(donation, now)
                const shownStatus = expired ? 'Expired' : donation.status
                const urgency = urgencyOf(donation, now)
                const safeLeft = minutesBetween(now, donation.safeUntil)
                const destination =
                  ngos.find((n) => n.id === donation.ngoId)?.name ?? null

                return (
                <article className="donation-card" key={donation.id}>
                  <div className="donation-card-actions">
                    <button
                      className="edit-donation"
                      onClick={() => openEditDonationForm(donation)}
                      aria-label={`Edit ${donation.name}`}
                      title="Edit donation"
                    >
                      Edit
                    </button>

                    <button
                      className="remove-donation"
                      onClick={() => removeDonation(donation.id)}
                      aria-label={`Remove ${donation.name}`}
                      title="Remove donation"
                    >
                      ×
                    </button>
                  </div>

                  <div className={`food-visual ${donation.color}`}>
                    <span className="food-emoji">{donation.emoji}</span>
                    <span
                      className={`status-pill status-${shownStatus.toLowerCase()}`}
                    >
                      <span /> {shownStatus}
                    </span>
                    <span className="food-category">
                      {donation.category}
                    </span>
                  </div>

                  <div className="donation-body">
                    <div className="donor-label">
                      <span className="donor-symbol">✳</span>{' '}
                      {donation.donor}
                    </div>

                    <h3>{donation.name}</h3>

                    <div className="donation-quantity">
                      <strong>
                        {donation.quantity} {donation.unit}
                      </strong>
                      <span>≈ {donation.serves} servings</span>
                    </div>

                    <div className="donation-meta">
                      <span>⌖ {donation.location}</span>
                      <span>◷ {donation.pickup}</span>
                      <span>❄ {donation.storage}</span>
                      {donation.status !== 'Delivered' && (
                        <span className={`safe-time urgency-${urgency}`}>
                          ⏱{' '}
                          {safeLeft > 0
                            ? `Safe for ${formatDuration(safeLeft)} · until ${formatClock(donation.safeUntil)}`
                            : 'Safe-use window passed'}
                          {donation.deadlineAssumed ? ' (assumed)' : ''}
                        </span>
                      )}
                      {destination && <span>→ {destination}</span>}
                    </div>

                    <button
                      className={`donation-action ${
                        donation.status !== 'Available' || expired
                          ? 'action-reserved'
                          : ''
                      }`}
                      onClick={() => reserveDonation(donation.id)}
                      disabled={donation.status !== 'Available' || expired}
                    >
                      {expired
                        ? 'Not safe to rescue'
                        : donation.status === 'Available'
                          ? 'Reserve donation ↗'
                          : donation.status === 'Delivered'
                            ? 'Delivered ✓'
                            : 'Reserved ✓'}
                    </button>
                  </div>
                </article>
                )
              })}
            </div>

            {filteredDonations.length === 0 && (
              <div className="empty-state">
                <span>🥬</span>
                <h3>No matching donations yet</h3>
                <p>
                  Try another search or category, or add a new donation to
                  the board.
                </p>
                <button
                  className="button-primary"
                  onClick={() => {
                    setSearch('')
                    setActiveFilter('All food')
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}

            <div className="board-footer">
              <span>
                Showing {filteredDonations.length} of {donations.length}{' '}
                donations
              </span>
              <span>
                <span className="tiny-dot green-dot" /> Updated for this
                demo
              </span>
            </div>
          </section>
          <RescueMap />
          <NgoNetwork
            ngos={ngos}
            donations={donations}
            history={rescueHistory}
            now={now}
            onUpdate={updateNgo}
            onAdd={addNgo}
          />
          <RunnerDispatch
            donations={dispatchDonations}
            lifetimeRescues={lifetimeRescues}
            onDeliveryComplete={recordDelivery}
          />


          <section className="intelligence-section" id="intelligence">
            <div className="intelligence-intro">
              <div className="eyebrow">
                <span className="eyebrow-dot" /> SMARTER FOOD RESCUE
              </div>
              <h2>
                Rescue with a little
                <br />
                <span>more intelligence.</span>
              </h2>
              <p>
                Our planned Rescue Intelligence Engine is designed to help
                good food find the right place before time runs out.
              </p>
              <span className="prototype-label">
                PROJECT CONCEPT · IN DEVELOPMENT
              </span>
            </div>

            <div className="intelligence-cards">
              <article className="intelligence-card">
                <div className="intel-icon intel-mint">◷</div>
                <div className="intel-tag">01 / FEASIBILITY</div>
                <h3>Rescue Twin</h3>
                <p>
                  Explore whether food can reach a recipient in time using
                  pickup deadlines, travel estimates, and capacity.
                </p>
                
<div className="rescue-simulator">
  <label>
    Travel time (minutes)
    <input
      type="number"
      min="0"
      value={travelMinutes}
      onChange={(e) => setTravelMinutes(e.target.value)}
    />
  </label>

  <label>
    Preparation time (minutes)
    <input
      type="number"
      min="0"
      value={preparationMinutes}
      onChange={(e) => setPreparationMinutes(e.target.value)}
    />
  </label>

  <label>
    Time until expiry (minutes)
    <input
      type="number"
      min="0"
      value={expiryMinutes}
      onChange={(e) => setExpiryMinutes(e.target.value)}
    />
  </label>

  <div className="rescue-result">
    <strong>
      {isRescueFeasible ? 'Rescue looks feasible' : 'Rescue may be too late'}
    </strong>
    <p>
      {isRescueFeasible
        ? `${rescueBufferMinutes} minutes of buffer remaining`
        : `${Math.abs(rescueBufferMinutes)} minutes past expiry`}
    </p>
  </div>
</div>



<button
  type="button"
  className="rescue-explore-btn"
  onClick={() => {
    document.getElementById('donations')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }}
>
  Explore donations <span aria-hidden="true">↗</span>
</button>


              </article>

                           <RescueIntelligenceTools donations={donations} />
               
            </div>
          </section>

          <footer className="page-footer">
            <a className="footer-brand" href="#home">
              second<span>serve</span> <span className="footer-heart">♥</span>
            </a>
            <span>Rescue food. Rethink waste. Rebuild possibility.</span>
            <a href="#home" className="back-top">
              Back to top ↑
            </a>
          </footer>
        </div>
      </main>

      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDonationForm()
            }
          }}
        >
          <section
            className="donation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">
                  GIVE GOOD FOOD A SECOND CHANCE
                </div>
                <h2 id="modal-title">
                  {editingDonation ? 'Edit donation' : 'List a donation'}
                  <span className="heading-period">.</span>
                </h2>
                <p>
                  Share the details so a local partner can rescue your
                  surplus.
                </p>
              </div>

              <button
                className="modal-close"
                onClick={closeDonationForm}
                aria-label="Close form"
                type="button"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="donation-form">
              <label>
                Food name
                <input
                  required
                  maxLength={80}
                  placeholder="e.g. Fresh vegetable bowls"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>

              <label>
                Donor / business name
                <input
                  required
                  maxLength={80}
                  placeholder="e.g. The Green Kitchen"
                  value={form.donor}
                  onChange={(event) =>
                    setForm({ ...form, donor: event.target.value })
                  }
                />
              </label>

              <div className="form-row">
                <label>
                  Food category
                  <select
                    value={form.category}
                    onChange={(event) =>
                      handleCategoryChange(event.target.value)
                    }
                  >
                    <option>Meals</option>
                    <option>Bakery</option>
                    <option>Produce</option>
                  </select>
                </label>

                <label>
                  Quantity
                  <input
                    required
                    type="number"
                    min="1"
                    max="10000"
                    value={form.quantity}
                    onChange={(event) =>
                      setForm({ ...form, quantity: event.target.value })
                    }
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Pickup area
                  <select
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                  >
                    {AREAS.map((area) => (
                      <option key={area.name}>{area.name}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Storage needed
                  <select
                    value={form.storage}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        storage: event.target.value as StorageType,
                      })
                    }
                  >
                    <option value="Ambient">Room temperature</option>
                    <option value="Chilled">Chilled</option>
                    <option value="Frozen">Frozen</option>
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Ready for pickup in (minutes)
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    value={form.readyInMinutes}
                    onChange={(event) =>
                      setForm({ ...form, readyInMinutes: event.target.value })
                    }
                  />
                </label>

                <label>
                  Safe to eat until
                  <input
                    required
                    type="datetime-local"
                    value={form.safeUntil}
                    onChange={(event) =>
                      setForm({ ...form, safeUntil: event.target.value })
                    }
                  />
                </label>
              </div>

              <label>
                Pickup note
                <input
                  maxLength={100}
                  placeholder="e.g. Today before 7 PM"
                  value={form.pickup}
                  onChange={(event) =>
                    setForm({ ...form, pickup: event.target.value })
                  }
                />
              </label>

              <div className="form-note">
                <span>✳</span> Only list food that has been safely stored
                and is suitable for donation. The safe-use time is the donor's
                own judgement; SECOND-SERVE uses it for planning and does not
                certify food safety.
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button-cancel"
                  onClick={closeDonationForm}
                >
                  Cancel
                </button>
                <button type="submit" className="button-primary">
                  {editingDonation
                    ? 'Save changes'
                    : 'Publish donation ↗'}
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
          className="confirm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDonationToRemove(null)
            }
          }}
        >
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <div className="confirm-icon">×</div>

            <p className="confirm-eyebrow">RESCUE BOARD</p>

            <h2 id="confirm-title">Remove this donation?</h2>

            <p className="confirm-message">
              Are you sure you want to remove{' '}
              <strong>{donationToRemove.name}</strong>? This action cannot
              be undone.
            </p>

            <div className="confirm-actions">
              <button
                className="confirm-cancel"
                onClick={() => setDonationToRemove(null)}
                type="button"
              >
                Keep donation
              </button>

              <button
                className="confirm-delete"
                onClick={confirmRemoveDonation}
                type="button"
              >
                Remove donation
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
