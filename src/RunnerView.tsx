import { useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet'
import { Bike, Snowflake, Thermometer } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import Dial from './Dial'
import { formatDuration } from './rescueEngine'
import type { RescueData } from './useRescueData'
import type { DispatchApi, Job } from './useDispatch'
import './Roles.css'
import './LiveMap.css'

type Props = {
  data: RescueData
  dispatch: DispatchApi
  say: (msg: string) => void
}

const RUNNER_KEY = 'second-serve-me-runner'

const pin = (cls: string) =>
  L.divIcon({ html: `<span class="${cls}"></span>`, className: 'house-pin-wrap', iconSize: [30, 30], iconAnchor: [15, 22] })

function MiniRoute({ job }: { job: Job }) {
  const from: [number, number] = [job.pickup.lat, job.pickup.lng]
  const to: [number, number] | null = job.drop ? [job.drop.lat, job.drop.lng] : null
  const bounds = L.latLngBounds(to ? [from, to] : [from, from]).pad(0.5)
  return (
    <MapContainer bounds={bounds} className="mini-route" zoomControl={false} scrollWheelZoom={false} dragging={false} attributionControl={false}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      {to && (
        <Polyline
          positions={[from, to]}
          pathOptions={{ color: '#e2447f', weight: 6, dashArray: '2 10', lineCap: 'round', className: 'route-live' }}
        />
      )}
      <Marker position={from} icon={pin('pickup-pin')} />
      {to && <Marker position={to} icon={pin('house-pin')} />}
    </MapContainer>
  )
}

export default function RunnerView({ data, dispatch, say }: Props) {
  const [meId, setMeId] = useState(() => Number(sessionStorage.getItem(RUNNER_KEY) ?? 2))
  const [justDelivered, setJustDelivered] = useState<{ food: string; servings: number; to: string } | null>(null)
  const me = dispatch.runners.find((r) => r.id === meId) ?? dispatch.runners[0]

  function chooseMe(id: number) {
    setMeId(id)
    setJustDelivered(null)
    sessionStorage.setItem(RUNNER_KEY, String(id))
  }

  const mine = dispatch.jobs.find((j) => j.runnerId === me.id && (j.status === 'Assigned' || j.status === 'Picked up'))
  const open = dispatch.jobs
    .filter((j) => j.status === 'Awaiting runner')
    .sort((a, b) => dispatch.minutesAway(me, a) - dispatch.minutesAway(me, b))
  const free = dispatch.isFree(me)
  const doneToday = data.history.filter((h) => h.runnerName === me.name).length

  return (
    <div className="role role-runner">
      <header className="role-head">
        <div>
          <label className="role-hello" htmlFor="runner-who">
            You're riding as
          </label>
          <select id="runner-who" className="who" value={me.id} onChange={(e) => chooseMe(Number(e.target.value))}>
            {dispatch.runners.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <p className="runner-score">
          <b className="num">{me.completed}</b> rescues
          <span className="muted">, {doneToday} today</span>
        </p>
      </header>

      <div className="runner-body">
        {justDelivered && !mine && (
          <section className="delivered-moment" aria-live="polite">
            <p className="delivered-big">Delivered. Thank you.</p>
            <p>
              {justDelivered.servings} servings of {justDelivered.food.toLowerCase()} reached {justDelivered.to}. That's
              food eaten, not binned, and a new flower in the garden.
            </p>
            <button type="button" className="button-outline" onClick={() => setJustDelivered(null)}>
              Find my next job
            </button>
          </section>
        )}

        {mine ? (
          <section className="ride">
            <MiniRoute job={mine} />
            <div className="ride-card">
              <div className="ride-top">
                <Dial readyAt={0} safeUntil={mine.safeUntil} state="live" size={92} photo={mine.photo} category={mine.category} />
                <div>
                  <p className="ride-step">{mine.status === 'Assigned' ? 'Step 1 of 2: collect' : 'Step 2 of 2: deliver'}</p>
                  <h1>{mine.status === 'Assigned' ? mine.donor : mine.destination}</h1>
                  <p className="muted">
                    {mine.status === 'Assigned'
                      ? `${mine.pickupArea}. ${mine.pickupNote}. ${mine.servings} servings of ${mine.food.toLowerCase()}.`
                      : `${mine.destinationArea}. Hand over ${mine.servings} servings.`}
                  </p>
                </div>
              </div>
              <ol className="ride-progress" aria-label="Progress">
                <li className="is-done" />
                <li className={mine.status === 'Picked up' ? 'is-done' : ''} />
                <li />
              </ol>
              {mine.storage !== 'Ambient' && (
                <p className="ride-tip">
                  {mine.storage === 'Chilled' ? <Thermometer size={16} /> : <Snowflake size={16} />}
                  Keep it {mine.storage === 'Chilled' ? 'cold' : 'frozen'}: use the insulated bag.
                </p>
              )}
              <button
                type="button"
                className={`post-button ${mine.status === 'Picked up' ? 'is-green' : ''}`}
                onClick={() => {
                  if (mine.status === 'Picked up') {
                    setJustDelivered({ food: mine.food, servings: mine.servings, to: mine.destination })
                  }
                  dispatch.advance(mine.id)
                }}
              >
                {mine.status === 'Assigned' ? 'I have the food' : 'Delivered'}
              </button>
            </div>
          </section>
        ) : (
          !justDelivered && (
            <section>
              <h1>{!me.onDuty ? "You're off duty" : open.length ? 'Jobs near you' : 'No jobs right now'}</h1>
              {!me.onDuty && <p className="muted">Kabir is out on another errand in this demo. Pick another runner to try it.</p>}
              {me.onDuty && open.length === 0 && (
                <div className="runner-idle">
                  <Bike size={32} strokeWidth={1.6} aria-hidden="true" />
                  <p>When a partner accepts food, the job appears here. Nearest first.</p>
                </div>
              )}
              {me.onDuty &&
                open.map((job) => (
                  <article key={job.id} className={`open-job ${job.urgent ? 'is-urgent' : ''}`}>
                    <Dial readyAt={0} safeUntil={job.safeUntil} state="live" size={76} photo={job.photo} category={job.category} />
                    <div>
                      <b>
                        {job.servings} servings, {job.food.toLowerCase()}
                      </b>
                      <p className="muted">
                        {job.donor} to {job.destination}
                      </p>
                      <p className="open-job-meta">
                        {dispatch.minutesAway(me, job)} min from you, {formatDuration(Math.max(0, job.minutesLeft))} left
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button-primary"
                      disabled={!free}
                      onClick={() => {
                        if (dispatch.assign(job.id, me.id)) say('Job is yours. Head to the pickup.')
                      }}
                    >
                      Take it
                    </button>
                  </article>
                ))}
            </section>
          )
        )}
      </div>
    </div>
  )
}
