import { useState } from 'react'
import { Bike, Check } from 'lucide-react'
import './RunnerDispatch.css'
import { formatDuration } from './rescueEngine'
import { JOB_STEPS, type DispatchApi } from './useDispatch'

type Props = {
  dispatch: DispatchApi
}

// Coordinator's view of every runner and every job.
export default function RunnerDispatch({ dispatch }: Props) {
  const { runners, jobs, freeRunners, isFree, assign, advance } = dispatch
  const [picked, setPicked] = useState<Record<number, number | ''>>({})
  const activeCount = jobs.filter((j) => j.status === 'Assigned' || j.status === 'Picked up').length

  return (
    <section className="dispatch" aria-labelledby="dispatch-title">
      <div className="section-head">
        <div>
          <h2 id="dispatch-title">Runners</h2>
          <p>Food a partner has accepted lands here. Runners can also claim jobs from their phones.</p>
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
                <span className={`runner-state ${free ? 'is-free' : 'is-busy'}`}>{free ? 'Free' : 'Out'}</span>
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
              <p>When a partner accepts an offer, the job appears here.</p>
            </div>
          ) : (
            jobs.map((job) => {
              const runner = runners.find((r) => r.id === job.runnerId)
              const reached = JOB_STEPS.indexOf(job.status as (typeof JOB_STEPS)[number])
              const done = job.status === 'Delivered'
              return (
                <article className={`job ${job.urgent ? 'is-urgent' : ''} ${done ? 'is-done' : ''}`} key={job.id}>
                  <div className="job-top">
                    <div>
                      <h3>{job.food}</h3>
                      <p className="job-route">
                        <span>
                          {job.donor}, {job.pickupArea}
                        </span>
                        <span className="job-arrow" aria-hidden="true" />
                        <span>{job.destination}</span>
                      </p>
                    </div>
                    <span className={`job-clock num ${job.urgent ? 'is-urgent' : ''}`}>
                      {done ? 'Delivered' : job.minutesLeft > 0 ? `${formatDuration(job.minutesLeft)} left` : 'Window passed'}
                    </span>
                  </div>

                  <ol className="track" aria-label="Delivery progress">
                    {JOB_STEPS.map((step, i) => (
                      <li key={step} className={i <= reached ? 'is-reached' : ''}>
                        <span className="track-dot">{i <= reached ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>

                  {job.status === 'Awaiting runner' ? (
                    <div className="assign">
                      <label htmlFor={`runner-${job.id}`} className="sr-only">
                        Runner for {job.food}
                      </label>
                      <select
                        id={`runner-${job.id}`}
                        value={picked[job.id] ?? ''}
                        onChange={(e) =>
                          setPicked((cur) => ({ ...cur, [job.id]: e.target.value === '' ? '' : Number(e.target.value) }))
                        }
                      >
                        <option value="">{freeRunners.length ? 'Choose a free runner' : 'No runners free right now'}</option>
                        {freeRunners.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.vehicle.toLowerCase()})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="button-primary"
                        disabled={!picked[job.id]}
                        onClick={() => {
                          const id = picked[job.id]
                          if (id && assign(job.id, id)) setPicked((cur) => ({ ...cur, [job.id]: '' }))
                        }}
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
