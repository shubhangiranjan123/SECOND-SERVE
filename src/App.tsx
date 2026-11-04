
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'
import RescueMap from './RescueMap'
import RunnerDispatch from './RunnerDispatch'
import RescueIntelligenceTools from './RescueIntelligenceTools'
type Donation = {
  id: number
  name: string
  donor: string
  category: string
  quantity: number
  unit: string
  serves: number
  distance: string
  pickup: string
  expires: string
  status: 'Available' | 'Reserved'
  emoji: string
  color: string
  location: string
}

type DonationForm = {
  name: string
  donor: string
  category: string
  quantity: string
  unit: string
  location: string
  pickup: string
}

const initialDonations: Donation[] = [
  {
    id: 1,
    name: 'Freshly prepared rice bowls',
    donor: 'The Green Kitchen',
    category: 'Meals',
    quantity: 24,
    unit: 'meals',
    serves: 24,
    distance: '1.2 km',
    pickup: 'Before 6:30 PM',
    expires: 'Today',
    status: 'Available',
    emoji: '🍱',
    color: 'peach',
    location: 'Sector 35',
  },
  {
    id: 2,
    name: 'Fresh bakery assortment',
    donor: 'Sunday Bakehouse',
    category: 'Bakery',
    quantity: 30,
    unit: 'items',
    serves: 15,
    distance: '2.4 km',
    pickup: 'Before 7:00 PM',
    expires: 'Today',
    status: 'Available',
    emoji: '🥐',
    color: 'yellow',
    location: 'Sector 34',
  },
  {
    id: 3,
    name: 'Seasonal fresh produce',
    donor: 'Harvest Market',
    category: 'Produce',
    quantity: 8,
    unit: 'kg',
    serves: 20,
    distance: '3.1 km',
    pickup: 'Before 5:45 PM',
    expires: 'Today',
    status: 'Reserved',
    emoji: '🥬',
    color: 'green',
    location: 'Sector 22',
  },
  {
    id: 4,
    name: 'Fresh sandwich boxes',
    donor: 'Daily Grind Cafe',
    category: 'Meals',
    quantity: 18,
    unit: 'boxes',
    serves: 18,
    distance: '1.8 km',
    pickup: 'Before 6:15 PM',
    expires: 'Today',
    status: 'Available',
    emoji: '🥪',
    color: 'lavender',
    location: 'Sector 36',
  },
]

const filters = ['All food', 'Meals', 'Bakery', 'Produce']

const emptyForm: DonationForm = {
  name: '',
  donor: '',
  category: 'Meals',
  quantity: '10',
  unit: 'meals',
  location: '',
  pickup: '',
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

function loadDonations(): Donation[] {
  try {
    const saved = localStorage.getItem('second-serve-donations')

    if (saved) {
      const parsed: unknown = JSON.parse(saved)

      if (Array.isArray(parsed)) {
        return parsed as Donation[]
      }
    }
  } catch {
    console.warn('Could not load saved donations.')
  }

  return initialDonations
}

function App() {
  const [donations, setDonations] = useState<Donation[]>(loadDonations)
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
  const [form, setForm] = useState<DonationForm>({ ...emptyForm })

  useEffect(() => {
    try {
      localStorage.setItem(
        'second-serve-donations',
        JSON.stringify(donations),
      )
    } catch {
      console.warn('Could not save donations.')
    }
  }, [donations])

  const availableCount = donations.filter(
    (item) => item.status === 'Available',
  ).length

  const totalServings = donations.reduce(
    (total, item) => total + item.serves,
    0,
  )

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
    setForm({ ...emptyForm })
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
      location: donation.location,
      pickup: donation.pickup,
    })
    setNotice('')
    setShowForm(true)
  }

  function closeDonationForm() {
    setShowForm(false)
    setEditingDonation(null)
    setForm({ ...emptyForm })
  }

  function handleCategoryChange(category: string) {
    const details = getCategoryDetails(category)

    setForm((current) => ({
      ...current,
      category,
      unit: details.unit,
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

  function reserveDonation(id: number) {
    const item = donations.find((donation) => donation.id === id)

    if (!item || item.status !== 'Available') return

    setDonations((current) =>
      current.map((donation) =>
        donation.id === id
          ? { ...donation, status: 'Reserved' }
          : donation,
      ),
    )

    setNotice(`"${item.name}" has been marked as reserved.`)
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
              <div className="stat-foot">Across current listings</div>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Community partners</span>
                <span className="stat-icon lilac-bg">♧</span>
              </div>
              <div className="stat-value">
                12<span className="stat-unit"> partners</span>
              </div>
              <div className="stat-foot">Local rescue network</div>
            </article>

            <article className="stat-card stat-highlight">
              <div className="stat-top">
                <span>Our shared mission</span>
                <span className="stat-icon cream-bg">✳</span>
              </div>
              <div className="stat-value">
                Zero<span className="stat-unit"> good food wasted</span>
              </div>
              <div className="stat-foot">Small actions, real impact.</div>
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
              {filteredDonations.map((donation) => (
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
                      className={`status-pill ${
                        donation.status === 'Available'
                          ? 'status-available'
                          : 'status-reserved'
                      }`}
                    >
                      <span /> {donation.status}
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
                    </div>

                    <button
                      className={`donation-action ${
                        donation.status === 'Reserved'
                          ? 'action-reserved'
                          : ''
                      }`}
                      onClick={() => reserveDonation(donation.id)}
                      disabled={donation.status === 'Reserved'}
                    >
                      {donation.status === 'Available'
                        ? 'Reserve donation ↗'
                        : 'Reserved ✓'}
                    </button>
                  </div>
                </article>
              ))}
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
          <RunnerDispatch donations={donations} />


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

              <label>
                Pickup location
                <input
                  required
                  maxLength={100}
                  placeholder="e.g. Sector 35, Chandigarh"
                  value={form.location}
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value })
                  }
                />
              </label>

              <label>
                Pickup deadline
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
                and is suitable for donation.
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
