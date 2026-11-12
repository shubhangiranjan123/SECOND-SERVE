import { useState } from 'react'
import { Bot, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Dial from './Dial'
import LiveMap from './LiveMap'
import Garden from './Garden'
import NgoNetwork from './NgoNetwork'
import RunnerDispatch from './RunnerDispatch'
import RescueIntelligenceTools from './RescueIntelligenceTools'
import WasteTicker from './WasteTicker'
import { href, type CoordTab } from './route'
import type { Donation } from './types'
import type { RescueData } from './useRescueData'
import type { DispatchApi } from './useDispatch'
import { formatClock, formatDuration, isExpired, minutesBetween } from './rescueEngine'
import './Coordinator.css'

type Props = {
  tab: CoordTab
  data: RescueData
  dispatch: DispatchApi
  now: number
  onOpenMatch: (id: number) => void
  onNewListing: () => void
  onEditListing: (d: Donation) => void
  onRemoveListing: (d: Donation) => void
  say: (msg: string) => void
}

const TABS: { id: CoordTab; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'food', label: 'All food' },
  { id: 'partners', label: 'Partners' },
  { id: 'runners', label: 'Runners' },
  { id: 'planning', label: 'Planning' },
  { id: 'impact', label: 'Impact' },
]

function stateOf(d: Donation, now: number) {
  if (d.status === 'Available') return isExpired(d, now) ? 'expired' : 'live'
  return d.status === 'Reserved' ? 'reserved' : 'delivered'
}

function ago(from: number | undefined, now: number) {
  if (!from) return ''
  const s = Math.max(0, Math.round((now - from) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function CoordinatorView(props: Props) {
  const { tab } = props
  return (
    <div className="coord">
      <nav className="coord-tabs" aria-label="Coordinator sections">
        {TABS.map((t) => (
          <a key={t.id} href={href('coordinator', t.id)} className={tab === t.id ? 'is-on' : ''} aria-current={tab === t.id ? 'page' : undefined}>
            {t.label}
            {t.id === 'live' && <NeedsBadge {...props} />}
          </a>
        ))}
      </nav>
      {tab === 'live' && <LiveTab {...props} />}
      {tab === 'food' && <FoodTab {...props} />}
      {tab === 'partners' && (
        <div className="coord-page">
          <NgoNetwork
            ngos={props.data.ngos}
            donations={props.data.donations}
            history={props.data.history}
            now={props.now}
            onUpdate={props.data.updateNgo}
            onAdd={props.data.addNgo}
          />
        </div>
      )}
      {tab === 'runners' && (
        <div className="coord-page">
          <RunnerDispatch dispatch={props.dispatch} />
        </div>
      )}
      {tab === 'planning' && <PlanningTab {...props} />}
      {tab === 'impact' && (
        <div className="coord-page">
          <Garden history={props.data.history} />
          <ActivityFeed {...props} limit={40} />
        </div>
      )}
    </div>
  )
}

function useNeeds({ data, dispatch, now }: Props) {
  const findHome = data.donations
    .filter((d) => d.status === 'Available' && !isExpired(d, now))
    .sort((a, b) => a.safeUntil - b.safeUntil)
  const waiting = data.donations.filter((d) => d.status === 'Reserved' && !d.accepted)
  const needRunner = dispatch.jobs.filter((j) => j.status === 'Awaiting runner')
  const onRoad = dispatch.jobs.filter((j) => j.status === 'Assigned' || j.status === 'Picked up')
  return { findHome, waiting, needRunner, onRoad }
}

function NeedsBadge(props: Props) {
  const n = useNeeds(props)
  const count = n.findHome.length + n.needRunner.length
  return count > 0 ? <span className="badge num">{count}</span> : null
}

function LiveTab(props: Props) {
  const { data, dispatch, now, onOpenMatch, say } = props
  const { findHome, waiting, needRunner, onRoad } = useNeeds(props)
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <div className="live">
      <div className="live-map-wrap">
        <LiveMap
          donations={data.donations}
          ngos={data.ngos}
          jobs={dispatch.jobs}
          history={data.history}
          now={now}
          selectedId={selected}
          onSelect={(id) => {
            setSelected(id)
            document.getElementById(`need-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
        />
        <WasteTicker />
      </div>

      <aside className="needs" aria-label="What needs attention">
        <div className="autopilot">
          <div>
            <p className="autopilot-title">
              <Bot size={18} aria-hidden="true" /> Autopilot
            </p>
            <p className="autopilot-sub">
              Offers urgent and new food automatically, re-offers if a partner doesn't answer in 2
              minutes, and sends the nearest free runner.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.autopilot}
            className={`switch ${data.autopilot ? 'is-on' : ''}`}
            onClick={() => data.setAutopilot(!data.autopilot)}
          >
            <span className="sr-only">Autopilot</span>
          </button>
        </div>

        <div className="needs-scroll">
          {findHome.length === 0 && needRunner.length === 0 && waiting.length === 0 && onRoad.length === 0 && (
            <div className="needs-empty">
              <p className="needs-empty-title">All quiet</p>
              <p>Nothing is waiting. New listings from donors show up here instantly.</p>
            </div>
          )}

          {findHome.length > 0 && <p className="needs-label">Needs a home</p>}
          {findHome.map((d, i) => {
            const best = data.bestMatch(d, now)
            const urgent = minutesBetween(now, d.safeUntil) < 90
            return (
              <article
                key={d.id}
                id={`need-${d.id}`}
                className={`need ${urgent ? 'is-urgent' : ''} ${selected === d.id ? 'is-selected' : ''} ${i === 0 ? 'is-first' : ''}`}
              >
                <div className="need-top">
                  <Dial readyAt={d.readyAt} safeUntil={d.safeUntil} state="live" size={i === 0 ? 92 : 72} photo={d.photo} category={d.category} />
                  <div>
                    <h3>
                      {d.serves} servings, {d.name.toLowerCase()}
                    </h3>
                    <p>
                      {d.donor}, {d.location}, {d.storage.toLowerCase()}
                    </p>
                  </div>
                </div>
                {best ? (
                  <>
                    <p className="need-best">
                      <b>Best home:</b> {best.ngo.name}, {best.travelMin} min away,{' '}
                      {best.remaining} servings free. Score {best.score}.
                    </p>
                    <div className="need-actions">
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => {
                          const r = data.offer(d.id, best.ngo.id)
                          if (r.ok) say(`Offered to ${best.ngo.name}. Their screen just lit up.`)
                          else say(`Couldn't offer: ${r.reason}`)
                        }}
                      >
                        Offer to {best.ngo.name.split(' ')[0]}
                      </button>
                      <button type="button" className="button-ghost" onClick={() => onOpenMatch(d.id)}>
                        Options
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="need-warn">
                    No partner can take this safely in time.{' '}
                    <button type="button" className="link-button" onClick={() => onOpenMatch(d.id)}>
                      See why
                    </button>
                  </p>
                )}
              </article>
            )
          })}

          {waiting.length > 0 && <p className="needs-label">Waiting for a partner to say yes</p>}
          {waiting.map((d) => {
            const ngo = data.ngos.find((n) => n.id === d.ngoId)
            return (
              <article key={d.id} id={`need-${d.id}`} className="need need-quiet">
                <p className="need-line">
                  <b>{d.name}</b> offered to {ngo?.name}
                </p>
                <p className="need-meta">
                  Waiting {ago(d.offeredAt, now)}
                  {data.autopilot ? '. Autopilot moves on at 2 minutes.' : '.'}
                </p>
                <button type="button" className="link-button" onClick={() => data.decline(d.id)}>
                  They said no, offer it to someone else
                </button>
              </article>
            )
          })}

          {needRunner.length > 0 && <p className="needs-label">Needs a runner</p>}
          {needRunner.map((job) => {
            const nearest = dispatch.nearestFree(job)
            return (
              <article key={job.id} className={`need ${job.urgent ? 'is-urgent' : ''}`}>
                <p className="need-line">
                  <b>{job.food}</b> to {job.destination}
                </p>
                <p className="need-meta">
                  {formatDuration(Math.max(0, job.minutesLeft))} left. Accepted {ago(job.acceptedAt, now)} ago.
                </p>
                {nearest ? (
                  <button
                    type="button"
                    className="button-dark"
                    onClick={() => {
                      if (dispatch.assign(job.id, nearest.id)) say(`${nearest.name} is on the way. Their phone just buzzed.`)
                    }}
                  >
                    Send {nearest.name.split(' ')[0]}, {dispatch.minutesAway(nearest, job)} min away
                  </button>
                ) : (
                  <p className="need-warn">No runner free right now.</p>
                )}
              </article>
            )
          })}

          {onRoad.length > 0 && <p className="needs-label">On the road</p>}
          {onRoad.map((job) => {
            const runner = dispatch.runners.find((r) => r.id === job.runnerId)
            return (
              <div key={job.id} className="road">
                <span className={`road-dot ${job.status === 'Picked up' ? 'is-moving' : ''}`} />
                <p>
                  <b>{runner?.name.split(' ')[0]}</b>{' '}
                  {job.status === 'Assigned' ? 'heading to' : 'carrying'} {job.food.toLowerCase()}{' '}
                  {job.status === 'Assigned' ? `at ${job.donor}` : `to ${job.destination}`}
                </p>
              </div>
            )
          })}

          <ActivityFeed {...props} limit={6} />
        </div>
      </aside>
    </div>
  )
}

function ActivityFeed({ data, limit }: Props & { limit: number }) {
  const items = data.events.slice(0, limit)
  if (items.length === 0) return null
  return (
    <section className="feed" aria-label="Recent activity">
      <p className="needs-label">Just now</p>
      <ol>
        {items.map((e) => (
          <li key={e.id} className={`feed-${e.tone}`}>
            <span className="feed-time num">{formatClock(e.at)}</span>
            {e.text}
          </li>
        ))}
      </ol>
    </section>
  )
}

const FILTERS = ['All food', 'Meals', 'Bakery', 'Produce']

function FoodTab({ data, now, onOpenMatch, onNewListing, onEditListing, onRemoveListing }: Props) {
  const [filter, setFilter] = useState('All food')
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const rank = (d: Donation) => ['live', 'reserved', 'delivered', 'expired'].indexOf(stateOf(d, now))
  const list = data.donations
    .filter((d) => filter === 'All food' || d.category === filter)
    .filter((d) => !q || `${d.name} ${d.donor} ${d.location}`.toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b) || a.safeUntil - b.safeUntil)

  return (
    <div className="coord-page">
      <div className="section-head">
        <div>
          <h2>All food</h2>
          <p>A full ring is 12 hours of safe time. Most urgent first.</p>
        </div>
        <button type="button" className="button-outline" onClick={onNewListing}>
          <Plus size={17} /> Add a listing
        </button>
      </div>
      <div className="board-tools">
        <div className="filter-tabs" role="group" aria-label="Filter by category">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={filter === f ? 'is-on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} aria-hidden="true" />
          <input type="search" placeholder="Food, donor or area" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search listings" />
        </label>
      </div>

      <div className="food-grid">
        {list.map((d) => {
          const state = stateOf(d, now)
          const ngo = data.ngos.find((n) => n.id === d.ngoId)
          const urgent = state === 'live' && minutesBetween(now, d.safeUntil) < 90
          return (
            <article key={d.id} className={`food is-${state} ${urgent ? 'is-urgent' : ''}`}>
              <Dial readyAt={d.readyAt} safeUntil={d.safeUntil} state={state} size={112} photo={d.photo} category={d.category} />
              <div className="food-body">
                <p className="food-tags">
                  <span className={`tag tag-${state}`}>
                    {state === 'live' ? (urgent ? 'Hurry' : 'Waiting') : state === 'reserved' ? (d.accepted ? 'Accepted' : 'Offered') : state === 'delivered' ? 'Delivered' : 'Expired'}
                  </span>
                  <span className="tag tag-plain">{d.category}</span>
                  <span className="tag tag-plain">{d.storage}</span>
                </p>
                <h3>{d.name}</h3>
                <p className="food-meta">
                  {d.donor}, {d.location}. <b>{d.serves} servings</b>
                </p>
                {ngo && <p className="food-dest">{state === 'delivered' ? 'Went to' : 'Going to'} {ngo.name}</p>}
                {d.thanks && <p className="food-thanks">"{d.thanks}"</p>}
                <div className="food-actions">
                  {state === 'live' ? (
                    <button type="button" className="button-primary" onClick={() => onOpenMatch(d.id)}>
                      Find it a home
                    </button>
                  ) : (
                    <span className="food-status" />
                  )}
                  <button type="button" className="icon-button" onClick={() => onEditListing(d)} aria-label={`Edit ${d.name}`} title="Edit">
                    <Pencil size={17} />
                  </button>
                  <button type="button" className="icon-button icon-danger" onClick={() => onRemoveListing(d)} aria-label={`Remove ${d.name}`} title="Remove">
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function PlanningTab({ data, now }: Props) {
  const [travel, setTravel] = useState('15')
  const [prep, setPrep] = useState('5')
  const [expiry, setExpiry] = useState('60')
  const buffer = Number(expiry) - Number(travel) - Number(prep)
  return (
    <div className="coord-page">
      <div className="section-head">
        <div>
          <h2>Planning</h2>
          <p>Quick simulators for the questions coordinators ask most. Simple rules, not trained models.</p>
        </div>
      </div>
      <div className="tool-grid">
        <article className="tool">
          <h3>Will it make it?</h3>
          <p className="tool-sub">Travel plus prep time against the safe-use window.</p>
          <div className="tool-fields">
            <label className="field">
              Travel (min)
              <input type="number" min="0" value={travel} onChange={(e) => setTravel(e.target.value)} />
            </label>
            <label className="field">
              Prep (min)
              <input type="number" min="0" value={prep} onChange={(e) => setPrep(e.target.value)} />
            </label>
            <label className="field">
              Safe for (min)
              <input type="number" min="0" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </label>
          </div>
          <div className={`verdict ${buffer >= 0 ? 'is-good' : 'is-bad'}`} aria-live="polite">
            <strong>{buffer >= 0 ? 'Makes it' : 'Too late'}</strong>
            <span>{buffer >= 0 ? `${buffer} minutes to spare` : `${Math.abs(buffer)} minutes past the window`}</span>
          </div>
        </article>
        <RescueIntelligenceTools donations={data.donations.filter((d) => d.status !== 'Delivered' && !isExpired(d, now))} />
      </div>
    </div>
  )
}
