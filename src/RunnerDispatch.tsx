
import { useEffect, useState } from 'react'
import './RunnerDispatch.css'

type DonationForDispatch = {
  id: number
  name: string
  donor: string
  category: string
  quantity: number
  unit: string
  location: string
  pickup: string
  status: 'Available' | 'Reserved' | 'Delivered'
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
  available: boolean
}

type RescueJob = {
  id: number
  food: string
  pickup: string
  destination: string
  urgency: 'High' | 'Normal'
  runnerId: number | null
  status:
    | 'Awaiting assignment'
    | 'Assigned'
    | 'Picked Up'
    | 'Delivered'
}

type SavedDispatch = {
  runners: Runner[]
  jobs: RescueJob[]
}

type RunnerDispatchProps = {
  donations: DonationForDispatch[]
  lifetimeRescues: number
  onDeliveryComplete: (completion: DeliveryCompletion) => void
}

const FALLBACK_DESTINATION = 'Community Food Centre'

const DISPATCH_STORAGE_KEY = 'second-serve-dispatch-v1'

const initialRunners: Runner[] = [
  {
    id: 1,
    name: 'Aarav Sharma',
    initials: 'AS',
    vehicle: 'Bicycle',
    completed: 28,
    available: true,
  },
  {
    id: 2,
    name: 'Meera Kapoor',
    initials: 'MK',
    vehicle: 'Scooter',
    completed: 42,
    available: true,
  },
  {
    id: 3,
    name: 'Kabir Singh',
    initials: 'KS',
    vehicle: 'Bicycle',
    completed: 19,
    available: false,
  },
]

const deliveryStatuses: RescueJob['status'][] = [
  'Assigned',
  'Picked Up',
  'Delivered',
]

function isRescueJob(value: unknown): value is RescueJob {
  if (!value || typeof value !== 'object') return false

  const job = value as Partial<RescueJob>

  return (
    typeof job.id === 'number' &&
    typeof job.food === 'string' &&
    typeof job.pickup === 'string' &&
    typeof job.destination === 'string' &&
    (job.urgency === 'High' || job.urgency === 'Normal') &&
    (typeof job.runnerId === 'number' || job.runnerId === null) &&
    [
      'Awaiting assignment',
      'Assigned',
      'Picked Up',
      'Delivered',
    ].includes(job.status ?? '')
  )
}

function isRunner(value: unknown): value is Runner {
  if (!value || typeof value !== 'object') return false

  const runner = value as Partial<Runner>

  return (
    typeof runner.id === 'number' &&
    typeof runner.name === 'string' &&
    typeof runner.initials === 'string' &&
    typeof runner.vehicle === 'string' &&
    typeof runner.completed === 'number' &&
    typeof runner.available === 'boolean'
  )
}

function loadDispatch(): SavedDispatch {
  if (typeof window === 'undefined') {
    return {
      runners: initialRunners,
      jobs: [],
    }
  }

  try {
    const saved = localStorage.getItem(DISPATCH_STORAGE_KEY)

    if (saved) {
      const parsed: unknown = JSON.parse(saved)

      if (
        parsed &&
        typeof parsed === 'object' &&
        'runners' in parsed &&
        'jobs' in parsed
      ) {
        const data = parsed as {
          runners: unknown
          jobs: unknown
        }

        if (Array.isArray(data.runners) && Array.isArray(data.jobs)) {
          const validRunners = data.runners.filter(isRunner)
          const validJobs = data.jobs.filter(isRescueJob)

          const runnersById = new Map(
            validRunners.map((runner) => [runner.id, runner]),
          )

          const restoredRunners = initialRunners.map(
            (initialRunner) =>
              runnersById.get(initialRunner.id) ?? initialRunner,
          )

          // An active assignment always keeps its runner busy,
          // even if saved availability was inconsistent.
          const busyRunnerIds = new Set(
            validJobs
              .filter(
                (job) =>
                  job.runnerId !== null &&
                  (job.status === 'Assigned' ||
                    job.status === 'Picked Up'),
              )
              .map((job) => job.runnerId),
          )

          return {
            runners: restoredRunners.map((runner) => ({
              ...runner,
              available: busyRunnerIds.has(runner.id)
                ? false
                : runner.available,
            })),
            jobs: validJobs,
          }
        }
      }
    }
  } catch {
    console.error('Could not restore saved dispatch data.')
  }

  return {
    runners: initialRunners,
    jobs: [],
  }
}

export default function RunnerDispatch({
  donations,
  lifetimeRescues,
  onDeliveryComplete,
}: RunnerDispatchProps) {
  const [savedDispatch] = useState<SavedDispatch>(loadDispatch)

  const [runners, setRunners] = useState<Runner[]>(
    savedDispatch.runners,
  )

  const [jobs, setJobs] = useState<RescueJob[]>(
    savedDispatch.jobs,
  )

  const [selectedRunners, setSelectedRunners] = useState<
    Record<number, number | ''>
  >({})

  // Turn reserved donations into rescue jobs automatically.
  // Existing assignment and delivery progress is preserved.
  useEffect(() => {
    setJobs((currentJobs) => {
      const existingJobs = new Map(
        currentJobs.map((job) => [job.id, job]),
      )

      const reservedJobs = donations
        .filter((donation) => donation.status === 'Reserved')
        .map((donation): RescueJob => {
          const existing = existingJobs.get(donation.id)

          if (existing) {
            return {
              ...existing,
              food: donation.name,
              pickup: `${donation.donor} · ${donation.location}`,
              destination: donation.destination ?? existing.destination,
            }
          }

          return {
            id: donation.id,
            food: donation.name,
            pickup: `${donation.donor} · ${donation.location}`,
            destination: donation.destination ?? FALLBACK_DESTINATION,
            urgency: 'Normal',
            runnerId: null,
            status: 'Awaiting assignment',
          }
        })

      // Keep delivered jobs visible as history if the donation's
      // status changes later. Do not retain unreserved active jobs.
      const reservedIds = new Set(
        reservedJobs.map((job) => job.id),
      )

      const completedHistory = currentJobs.filter(
        (job) =>
          job.status === 'Delivered' &&
          !reservedIds.has(job.id),
      )

      return [...reservedJobs, ...completedHistory]
    })
  }, [donations])

  // Persist jobs and runner data whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem(
        DISPATCH_STORAGE_KEY,
        JSON.stringify({ runners, jobs }),
      )
    } catch {
      console.error('Could not save dispatch progress.')
    }
  }, [runners, jobs])

  function assignRunner(jobId: number) {
    const runnerId = selectedRunners[jobId]

    if (runnerId === undefined || runnerId === '') return

    const runner = runners.find((item) => item.id === runnerId)
    const job = jobs.find((item) => item.id === jobId)

    if (!runner || !runner.available || !job) return
    if (job.status !== 'Awaiting assignment') return

    // Assign the runner and advance the job together.
    setJobs((current) =>
      current.map((item) =>
        item.id === jobId
          ? { ...item, runnerId, status: 'Assigned' }
          : item,
      ),
    )

    setRunners((current) =>
      current.map((item) =>
        item.id === runnerId
          ? { ...item, available: false }
          : item,
      ),
    )

    setSelectedRunners((current) => ({
      ...current,
      [jobId]: '',
    }))
  }

  function advanceDelivery(jobId: number) {
    const job = jobs.find((item) => item.id === jobId)

    if (!job || job.status === 'Awaiting assignment') return

    const currentIndex = deliveryStatuses.indexOf(job.status)

    if (
      currentIndex < 0 ||
      currentIndex >= deliveryStatuses.length - 1
    ) {
      return
    }

    const nextStatus = deliveryStatuses[currentIndex + 1]

    setJobs((current) =>
      current.map((item) =>
        item.id === jobId
          ? { ...item, status: nextStatus }
          : item,
      ),
    )

    // This only runs on the transition to Delivered.
    // Delivered jobs cannot advance again, and App also refuses a second
    // record for the same donation, so a rescue is counted exactly once.
    if (nextStatus === 'Delivered' && job.runnerId !== null) {
      const runner = runners.find((item) => item.id === job.runnerId)

      onDeliveryComplete({
        donationId: job.id,
        runnerName: runner?.name ?? 'Unknown runner',
        destination: job.destination,
      })

      setRunners((current) =>
        current.map((runner) =>
          runner.id === job.runnerId
            ? {
                ...runner,
                available: true,
                completed: runner.completed + 1,
              }
            : runner,
        ),
      )
    }
  }

  return (
    <section className="runner-dispatch" id="runner-dispatch">
      <div className="runner-heading">
        <div>
          <span className="runner-eyebrow">
            DISPATCH CONTROL / 02
          </span>
          <h2>Every rescue needs a runner.</h2>
          <p>
            Match available delivery agents with reserved food
            donations and follow each delivery.
          </p>
        </div>

        <span className="runner-demo-badge">DEMO DISPATCH</span>
      </div>

      <div className="runner-stats">
        <div className="runner-stat">
          <span>AVAILABLE RUNNERS</span>
          <strong>
            {runners.filter((runner) => runner.available).length}
          </strong>
        </div>

        <div className="runner-stat">
          <span>ACTIVE DELIVERIES</span>
          <strong>
            {
              jobs.filter(
                (job) =>
                  job.status === 'Assigned' ||
                  job.status === 'Picked Up',
              ).length
            }
          </strong>
        </div>

        <div className="runner-stat">
          <span>LIFETIME RESCUES</span>
          <strong>{lifetimeRescues}</strong>
        </div>
      </div>

      <div className="runner-subheading">
        <h3>Delivery runners</h3>
        <span>Sample team profiles</span>
      </div>

      <div className="runner-grid">
        {runners.map((runner) => (
          <article className="runner-card" key={runner.id}>
            <div className="runner-profile">
              <div className="runner-avatar">{runner.initials}</div>
              <div>
                <h4>{runner.name}</h4>
                <p>{runner.vehicle}</p>
              </div>
            </div>

            <span
              className={`runner-availability ${
                runner.available ? 'is-available' : 'is-busy'
              }`}
            >
              <i />
              {runner.available ? 'Available' : 'On delivery'}
            </span>

            <div className="runner-completed">
              <span>Rescues completed (incl. sample)</span>
              <strong>{runner.completed}</strong>
            </div>
          </article>
        ))}
      </div>

      <div className="runner-subheading">
        <h3>Rescue assignments</h3>
        <span>
          {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} from
          reserved donations
        </span>
      </div>

      {jobs.length === 0 ? (
        <div className="rescue-job-card">
          <h4>No rescue jobs yet</h4>
          <p>
            Reserve a donation on the Food Rescue Board and it will
            appear here automatically.
          </p>
        </div>
      ) : (
        <div className="rescue-job-list">
          {jobs.map((job) => {
            const assignedRunner = runners.find(
              (runner) => runner.id === job.runnerId,
            )

            const nextStatusIndex = deliveryStatuses.indexOf(
              job.status,
            )
            const isComplete = job.status === 'Delivered'
            const canAdvance =
              job.status !== 'Awaiting assignment' && !isComplete

            return (
              <article className="rescue-job-card" key={job.id}>
                <div className="rescue-job-top">
                  <div>
                    <span className="rescue-job-id">
                      RESCUE #{job.id}
                    </span>
                    <h4>{job.food}</h4>
                  </div>

                  <span
                    className={`rescue-urgency ${
                      job.urgency === 'High'
                        ? 'urgency-high'
                        : 'urgency-normal'
                    }`}
                  >
                    {job.urgency} priority
                  </span>
                </div>

                <div className="rescue-job-route">
                  <div>
                    <span>COLLECT FROM</span>
                    <strong>{job.pickup}</strong>
                  </div>
                  <div>
                    <span>DELIVER TO</span>
                    <strong>{job.destination}</strong>
                  </div>
                </div>

                <div className="delivery-progress">
                  {deliveryStatuses.map((status, index) => {
                    const reached =
                      nextStatusIndex >= index &&
                      nextStatusIndex !== -1

                    return (
                      <div
                        className={`delivery-step ${
                          reached ? 'step-reached' : ''
                        }`}
                        key={status}
                      >
                        <span className="delivery-step-dot">
                          {reached ? '✓' : index + 1}
                        </span>
                        <span>{status}</span>
                      </div>
                    )
                  })}
                </div>

                {job.status === 'Awaiting assignment' ? (
                  <div className="runner-assignment">
                    <label htmlFor={`runner-${job.id}`}>
                      Assign a delivery runner
                    </label>

                    <div className="runner-assignment-controls">
                      <select
                        id={`runner-${job.id}`}
                        value={selectedRunners[job.id] ?? ''}
                        onChange={(event) =>
                          setSelectedRunners((current) => ({
                            ...current,
                            [job.id]:
                              event.target.value === ''
                                ? ''
                                : Number(event.target.value),
                          }))
                        }
                      >
                        <option value="">
                          Choose an available runner
                        </option>
                        {runners
                          .filter((runner) => runner.available)
                          .map((runner) => (
                            <option
                              key={runner.id}
                              value={runner.id}
                            >
                              {runner.name} · {runner.vehicle}
                            </option>
                          ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => assignRunner(job.id)}
                        disabled={
                          selectedRunners[job.id] === undefined ||
                          selectedRunners[job.id] === ''
                        }
                      >
                        Assign runner
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="runner-job-footer">
                    <div>
                      <span>ASSIGNED RUNNER</span>
                      <strong>
                        {assignedRunner?.name ?? 'Runner unavailable'}
                      </strong>
                      <span className="runner-current-status">
                        {isComplete
                          ? 'Delivery completed'
                          : `Status: ${job.status}`}
                      </span>
                    </div>

                    {canAdvance && (
                      <button
                        type="button"
                        onClick={() => advanceDelivery(job.id)}
                      >
                        {job.status === 'Assigned'
                          ? 'Mark picked up'
                          : 'Mark delivered'}
                      </button>
                    )}

                    {isComplete && (
                      <span className="delivery-complete">
                        ✓ Delivered
                      </span>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      <p className="runner-disclaimer">
        Prototype data only. Runner profiles, destinations and delivery
        updates are simulated and are not connected to real people or live
        GPS.
      </p>
    </section>
  )
}
