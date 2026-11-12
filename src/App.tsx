import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import './App.css'
import './NgoMatching.css'
import CoordinatorView from './CoordinatorView'
import DonorView from './DonorView'
import PartnerView from './PartnerView'
import RunnerView from './RunnerView'
import StoryPage from './StoryPage'
import ListingModal from './ListingModal'
import NgoMatchModal from './NgoMatchModal'
import { href, useRoute, type Role } from './route'
import { useLiveScreens } from './presence'
import { useNow, useRescueData } from './useRescueData'
import { useDispatch } from './useDispatch'
import { isExpired, minutesBetween } from './rescueEngine'
import type { Donation } from './types'

const ROLES: { id: Role; label: string }[] = [
  { id: 'coordinator', label: 'Coordinator' },
  { id: 'donor', label: 'Donor' },
  { id: 'partner', label: 'Partner' },
  { id: 'runner', label: 'Runner' },
]

const OFFER_TIMEOUT_MS = 2 * 60_000
const NEW_LISTING_GRACE_MS = 20_000
const RUNNER_GRACE_MS = 20_000

export default function App() {
  const route = useRoute()
  const now = useNow(5_000)
  const data = useRescueData()
  const dispatch = useDispatch(data.donations, data.ngos, now, data.recordDelivery)
  const screens = useLiveScreens()

  const [toast, setToast] = useState('')
  const [matchingId, setMatchingId] = useState<number | null>(null)
  const [listing, setListing] = useState<{ editing: Donation | null } | null>(null)
  const [toRemove, setToRemove] = useState<Donation | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 4200)
    return () => window.clearTimeout(t)
  }, [toast])

  // Tell this screen when something it cares about happens in another tab.
  const lastEvent = useRef(data.events[0]?.id)
  useEffect(() => {
    const top = data.events[0]
    if (top && top.id !== lastEvent.current && route.page === 'app') {
      lastEvent.current = top.id
      setToast(top.text)
    }
  }, [data.events, route.page])

  // ---------- Autopilot (runs only on the coordinator's screen) ----------
  const isCoordinator = route.page === 'app' && route.role === 'coordinator'
  useEffect(() => {
    if (!isCoordinator || !data.autopilot) return
    const at = Date.now()

    // 1. Offers nobody answered in time move on to the next partner.
    const stale = data.donations.find(
      (d) => d.status === 'Reserved' && !d.accepted && d.offeredAt && at - d.offeredAt > OFFER_TIMEOUT_MS,
    )
    if (stale) return data.decline(stale.id, 'timed out')

    // 2. Urgent food, or anything posted more than a few seconds ago, gets offered.
    const needsHome = data.donations
      .filter((d) => d.status === 'Available' && !isExpired(d, at))
      .filter((d) => minutesBetween(at, d.safeUntil) < 90 || (d.id > 1e12 && at - d.id > NEW_LISTING_GRACE_MS))
      .sort((a, b) => a.safeUntil - b.safeUntil)[0]
    if (needsHome) {
      const best = data.bestMatch(needsHome, at)
      if (best) {
        data.offer(needsHome.id, best.ngo.id, 'autopilot')
        return
      }
    }

    // 3. Accepted food with no runner gets the nearest free one.
    const job = dispatch.jobs.find(
      (j) => j.status === 'Awaiting runner' && (!j.acceptedAt || at - j.acceptedAt > RUNNER_GRACE_MS),
    )
    if (job) {
      const runner = dispatch.nearestFree(job)
      if (runner && dispatch.assign(job.id, runner.id)) {
        data.log(`Autopilot sent ${runner.name} to collect ${job.food.toLowerCase()}`, 'warn')
      }
    }
    // Runs again on every clock tick and every data change.
  }, [isCoordinator, now, data, dispatch])

  const matching = data.donations.find((d) => d.id === matchingId) ?? null

  function resetDemo() {
    data.reset()
    dispatch.reset()
    setConfirmReset(false)
    setToast('Demo reset. Every countdown starts fresh.')
  }

  return (
    <div className="app">
      <header className="topnav">
        <a className="brand" href="#/" aria-label="Second Serve, story page">
          <span className="brand-blob" aria-hidden="true" />
          <span className="brand-name">second serve</span>
        </a>

        {route.page === 'app' ? (
          <nav className="roles" aria-label="Switch role">
            {ROLES.map((r) => (
              <a key={r.id} href={href(r.id)} className={route.role === r.id ? 'is-on' : ''} aria-current={route.role === r.id ? 'page' : undefined}>
                {r.label}
              </a>
            ))}
          </nav>
        ) : (
          <nav className="story-nav" aria-label="Story">
            <a href="#how-title">How it works</a>
            <a href="#garden">Impact</a>
          </nav>
        )}

        <div className="topnav-end">
          {screens > 1 && (
            <span className="screens" title="Other tabs or windows of Second Serve open right now">
              <i aria-hidden="true" /> {screens} screens live
            </span>
          )}
          {route.page === 'story' ? (
            <a className="topnav-cta" href={href('coordinator')}>
              Open the app
            </a>
          ) : (
            <button type="button" className="topnav-reset" onClick={() => setConfirmReset(true)}>
              Reset demo
            </button>
          )}
        </div>
      </header>

      <main>
        {route.page === 'story' && <StoryPage data={data} now={now} />}
        {route.page === 'app' && route.role === 'coordinator' && (
          <CoordinatorView
            tab={route.tab}
            data={data}
            dispatch={dispatch}
            now={now}
            say={setToast}
            onOpenMatch={setMatchingId}
            onNewListing={() => setListing({ editing: null })}
            onEditListing={(d) => setListing({ editing: d })}
            onRemoveListing={(d) => {
              if (d.status === 'Reserved') setToast(`${d.name} is mid-rescue, so it can't be removed until it's delivered.`)
              else setToRemove(d)
            }}
          />
        )}
        {route.page === 'app' && route.role === 'donor' && <DonorView data={data} dispatch={dispatch} now={now} say={setToast} />}
        {route.page === 'app' && route.role === 'partner' && <PartnerView data={data} dispatch={dispatch} now={now} say={setToast} />}
        {route.page === 'app' && route.role === 'runner' && <RunnerView data={data} dispatch={dispatch} say={setToast} />}
      </main>

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast('')} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {matching && (
        <NgoMatchModal
          donation={matching}
          donations={data.donations}
          ngos={data.ngos.filter((n) => !(matching.declinedBy ?? []).includes(n.id))}
          history={data.history}
          now={now}
          onReserve={(donationId, ngoId) => {
            const r = data.offer(donationId, ngoId)
            setMatchingId(null)
            setToast(r.ok ? 'Offer sent. Their screen just lit up.' : `Couldn't offer: ${r.reason}`)
          }}
          onClose={() => setMatchingId(null)}
        />
      )}

      {listing && (
        <ListingModal
          editing={listing.editing}
          onClose={() => setListing(null)}
          onSave={(input) => {
            if (listing.editing) data.editFull(listing.editing.id, input)
            else data.addFull(input)
            setListing(null)
            setToast(listing.editing ? 'Changes saved.' : 'Listing published.')
          }}
        />
      )}

      {toRemove && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setToRemove(null)}>
          <section className="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="remove-title">
            <h2 id="remove-title">Remove this listing?</h2>
            <p className="modal-text">
              <b>{toRemove.name}</b> will come off the board. This can't be undone.
            </p>
            <div className="modal-actions">
              <button className="button-ghost" onClick={() => setToRemove(null)} type="button">
                Keep it
              </button>
              <button
                className="button-danger"
                type="button"
                onClick={() => {
                  data.remove(toRemove.id)
                  setToRemove(null)
                  setToast('Listing removed.')
                }}
              >
                Remove listing
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmReset && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirmReset(false)}>
          <section className="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <h2 id="reset-title">Reset the demo?</h2>
            <p className="modal-text">
              Listings, partners, runners and the garden go back to the sample data with fresh countdowns, on every open
              screen. Do this right before presenting.
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
