import { useEffect, useMemo, useState } from 'react'
import { Bike, Check } from 'lucide-react'
import './RunnerDispatch.css'
import { formatDuration, minutesBetween } from './rescueEngine'

type DonationForDispatch = {
  id: number
  name: string
  donor: string
  location: string
  status: 'Available' | 'Reserved' | 'Delivered'
  safeUntil: number
  destination: string | null // name of the matched organisation
}

// Sent to App when a job reaches Delivered. App owns the permanent
// rescue history and ignores a second completion for the same donation.
export type DeliveryCompletion = {
  donationId: number
  runnerName: string
  destination: string
}

type Runner = {
  id: number
  name: string
  initials: string
  vehicle: string
  completed: number
  // false only for the sample runner who is out on an unrelated job
  onDuty: boolean
}

type JobStatus = 'Awaiting assignment' | 'Assigned' | 'Picked up' | 'Delivered'

type Progress = { runnerId: number; status: Exclude<JobStatus, 'Awaiting assignment'> }

type Job = {
  id: number
  food: string
  pickup: string
  destination: string
  minutesLeft: number
  urgent: boolean
  runnerId: number | null
  status: JobStatus
}

type Saved = {
  runners: Runner[]
  progress: Record<number, Progress>
}

type Props = {
  donations: DonationForDispatch[]
  now: number
  onDeliveryComplete: (completion: DeliveryCompletion) => void
}

const FALLBACK_DESTINATION = 'Community Food Centre'
export const DISPATCH_STORAGE_KEY = 'second-serve-dispatch-v2'
const STEPS: Progress['status'][] = ['Assigned', 'Picked up', 'Delivered']

const initialRunners: Runner[] = [
  { id: 1, name: 'Aarav Sharma', initials: 'AS', vehicle: 'Bicycle', completed: 28, onDuty: true },
  { id: 2, name: 'Meera Kapoor', initials: 'MK', vehicle: 'Scooter', completed: 42, onDuty: true },
  { id: 3, name: 'Kabir Singh', initials: 'KS', vehicle: 'Bicycle', completed: 19, onDuty: false },
]

function isProgress(value: unknown): value is Progress {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<Progress>
  return typeof p.runnerId === 'number' && STEPS.includes(p.status as Progress['status'])
}

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(DISPATCH_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>
      const runners = initialRunners.map((base) => {
        const saved = parsed.runners?.find((r) => r.id === base.id)
        return saved && typeof saved.completed === 'number'
          ? { ...base, completed: saved.completed }
          : base
      })
      const progress: Record<number, Progress> = {}
      for (const [id, p] of Object.entries(parsed.progress ?? {})) {
        if (isProgress(p)) progress[Number(id)] = p
      }
      return { runners, progress }
    }
  } catch {
    console.warn('Could not restore saved dispatch data.')
  }
  return { runners: initialRunners, progress: {} }
}

export default function RunnerDispatch({ donations, now, onDeliveryComplete }: Props) {
  const [saved] = useState(loadSaved)
  const [runners, setRunners] = useState<Runner[]>(saved.runners)
  const [progress, setProgress] = useState<Record<number, Progress>>(saved.progress)
  const [picked, setPicked] = useState<Record<number, number | ''>>({})

  useEffect(() => {
    try {
      localStorage.setItem(DISPATCH_STORAGE_KEY, JSON.stringify({ runners, progress }))
    } catch {
      console.warn('Could not save dispatch progress.')
    }
  }, [runners, progress])

  // Jobs are derived from the donations every render, so they can never
  // drift out of sync with the rescue board.
  const jobs = useMemo<Job[]>(
    () =>
      donations
        .filter((d) => d.status === 'Reserved' || (d.status === 'Delivered' && progress[d.id]))
        .map((d) => {
          const p = progress[d.id]
          const status: JobStatus =
            d.status === 'Delivered' ? 'Delivered' : (p?.status ?? 'Awaiting assignment')
          const minutesLeft = minutesBetween(now, d.safeUntil)
          const job: Job = {
            id: d.id,
            food: d.name,
            pickup: `${d.donor}, ${d.location}`,
            destination: d.destination ?? FALLBACK_DESTINATION,
            minutesLeft,
            urgent: status !== 'Delivered' && minutesLeft < 90,
            runnerId: p?.runnerId ?? null,
            status,
          }
          return job
        })
        .sort((a, b) => Number(a.status === 'Delivered') - Number(b.status === 'Delivered') || a.minutesLeft - b.minutesLeft),
    [donations, progress, now],
  )

  const busyIds = new Set(
    jobs.filter((j) => j.status === 'Assigned' || j.status === 'Picked up').map((j) => j.runnerId),
  )
  const isFree = (r: Runner) => r.onDuty && !busyIds.has(r.id)
  const freeRunners = runners.filter(isFree)
  const activeCount = jobs.filter((j) => j.status === 'Assigned' || j.status === 'Picked up').length

  function assign(jobId: number) {
    const runnerId = picked[jobId]
    if (runnerId === undefined || runnerId === '') return
    const runner = runners.find((r) => r.id === runnerId)
    if (!runner || !isFree(runner)) return
    setProgress((cur) => ({ ...cur, [jobId]: { runnerId, status: 'Assigned' } }))
    setPicked((cur) => ({ ...cur, [jobId]: '' }))
  }

  function advance(jobId: number) {
    const p = progress[jobId]
    const job = jobs.find((j) => j.id === jobId)
    if (!p || !job || p.status === 'Delivered') return
    const next = STEPS[STEPS.indexOf(p.status) + 1]
    setProgress((cur) => ({ ...cur, [jobId]: { ...p, status: next } }))

    if (next === 'Delivered') {
      const runner = runners.find((r) => r.id === p.runnerId)
      setRunners((cur) =>
        cur.map((r) => (r.id === p.runnerId ? { ...r, completed: r.completed + 1 } : r)),
      )
      onDeliveryComplete({
        donationId: jobId,
        runnerName: runner?.name ?? 'Unknown runner',
        destination: job.destination,
      })
    }
  }

  return (
    <section className="dispatch" id="dispatch" aria-labelledby="dispatch-title">
      <div className="section-head">
        <div>
          <h2 id="dispatch-title">Every rescue needs a runner</h2>
          <p>Reserved food lands here. Pick who goes, then follow it to the door.</p>
        </div>
        <p className="head-figures">
          <span>
            <b className="num">{freeRunners.length}</b> free
          </span>
          <span>
            <b className="num">{activeCount}</b> on the road
          </span>
        </p>
      </div>

      <div className="dispatch-layout">
        <ul className="runner-list" aria-label="Delivery runners">
          {runners.map((r) => {
            const free = isFree(r)
            return (
              <li className="runner" key={r.id}>
                <span className={`runner-avatar ${free ? 'is-free' : 'is-busy'}`}>{r.initials}</span>
                <div className="runner-info">
                  <strong>{r.name}</strong>
                  <span>
                    {r.vehicle}, {r.completed} rescues
                  </span>
                </div>
                <span className={`runner-state ${free ? 'is-free' : 'is-busy'}`}>
                  {free ? 'Free' : 'Out'}
                </span>
              </li>
            )
          })}
          <li className="runner-note">Sample team. Not connected to real people or GPS.</li>
        </ul>

        <div className="jobs">
          {jobs.length === 0 ? (
            <div className="jobs-empty">
              <Bike size={28} strokeWidth={1.8} aria-hidden="true" />
              <p className="jobs-empty-title">Nothing to deliver yet</p>
              <p>Find a home for a listing on the board and the job appears here.</p>
            </div>
          ) : (
            jobs.map((job) => {
              const runner = runners.find((r) => r.id === job.runnerId)
              const reached = STEPS.indexOf(job.status as Progress['status'])
              const done = job.status === 'Delivered'
              return (
                <article className={`job ${job.urgent ? 'is-urgent' : ''} ${done ? 'is-done' : ''}`} key={job.id}>
                  <div className="job-top">
                    <div>
                      <h3>{job.food}</h3>
                      <p className="job-route">
                        <span>{job.pickup}</span>
                        <span className="job-arrow" aria-hidden="true" />
                        <span>{job.destination}</span>
                      </p>
                    </div>
                    <span className={`job-clock num ${job.urgent ? 'is-urgent' : ''}`}>
                      {done
                        ? 'Delivered'
                        : job.minutesLeft > 0
                          ? `${formatDuration(job.minutesLeft)} left`
                          : 'Window passed'}
                    </span>
                  </div>

                  <ol className="track" aria-label="Delivery progress">
                    {STEPS.map((step, i) => (
                      <li key={step} className={i <= reached ? 'is-reached' : ''}>
                        <span className="track-dot">{i <= reached ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>

                  {job.status === 'Awaiting assignment' ? (
                    <div className="assign">
                      <label htmlFor={`runner-${job.id}`} className="sr-only">
                        Runner for {job.food}
                      </label>
                      <select
                        id={`runner-${job.id}`}
                        value={picked[job.id] ?? ''}
                        onChange={(e) =>
                          setPicked((cur) => ({
                            ...cur,
                            [job.id]: e.target.value === '' ? '' : Number(e.target.value),
                          }))
                        }
                      >
                        <option value="">
                          {freeRunners.length ? 'Choose a free runner' : 'No runners free right now'}
                        </option>
                        {freeRunners.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.vehicle.toLowerCase()})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => assign(job.id)}
                        disabled={!picked[job.id]}
                      >
                        Send runner
                      </button>
                    </div>
                  ) : (
                    <div className="job-foot">
                      <span>
                        <b>{runner?.name ?? 'Runner'}</b>{' '}
                        {done ? 'delivered it. A flower went into the garden.' : `is ${job.status.toLowerCase()}`}
                      </span>
                      {!done && (
                        <button type="button" className="button-primary" onClick={() => advance(job.id)}>
                          {job.status === 'Assigned' ? 'Mark picked up' : 'Mark delivered'}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}
