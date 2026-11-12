import { useState } from 'react'
import { Snowflake, Thermometer } from 'lucide-react'
import Dial from './Dial'
import { capacityUsage, formatClock, formatDuration, haversineKm, minutesBetween, sameLocalDay, travelMinutes } from './rescueEngine'
import type { RescueData } from './useRescueData'
import type { DispatchApi } from './useDispatch'
import './Roles.css'

type Props = {
  data: RescueData
  dispatch: DispatchApi
  now: number
  say: (msg: string) => void
}

const PARTNER_KEY = 'second-serve-me-partner'
const THANKS = ['Thank you, it all went today', 'The kids loved it', 'Exactly what we needed']
const OFFER_TIMEOUT_MS = 2 * 60_000

export default function PartnerView({ data, dispatch, now, say }: Props) {
  const [meId, setMeId] = useState(() => Number(sessionStorage.getItem(PARTNER_KEY) ?? 101))
  const me = data.ngos.find((n) => n.id === meId) ?? data.ngos[0]

  function chooseMe(id: number) {
    setMeId(id)
    sessionStorage.setItem(PARTNER_KEY, String(id))
  }

  if (!me) return <p className="role-empty">No partner organisations yet.</p>

  const usage = capacityUsage(me, data.donations, data.history, now)
  const free = Math.max(0, me.dailyCapacity - usage.committed - usage.deliveredToday)
  const usedShare = Math.min(1, (usage.committed + usage.deliveredToday) / Math.max(1, me.dailyCapacity))

  const offers = data.donations.filter((d) => d.status === 'Reserved' && !d.accepted && d.ngoId === me.id)
  const coming = data.donations.filter((d) => d.status === 'Reserved' && d.accepted && d.ngoId === me.id)
  const received = data.donations.filter(
    (d) => d.status === 'Delivered' && d.ngoId === me.id && data.history.some((h) => h.donationId === d.id && sameLocalDay(h.deliveredAt, now)),
  )

  return (
    <div className="role role-partner">
      <header className="partner-band">
        <div className="partner-band-inner">
          <div>
            <label className="role-hello" htmlFor="partner-who">
              You're signed in as
            </label>
            <select id="partner-who" className="who who-dark" value={me.id} onChange={(e) => chooseMe(Number(e.target.value))}>
              {data.ngos.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
            {me.verification !== 'Verified' && (
              <p className="partner-warn">Not verified yet, so no food will be offered to you.</p>
            )}
          </div>

          <div className="room">
            <div className="room-top">
              <span>Room left today</span>
              <b className="num">
                {free} of {me.dailyCapacity}
              </b>
            </div>
            <div className="room-bar">
              <i style={{ width: `${usedShare * 100}%` }} />
            </div>
            <div className="room-toggles">
              <button type="button" className={me.accepting ? 'is-on' : ''} aria-pressed={me.accepting} onClick={() => data.updateNgo({ ...me, accepting: !me.accepting })}>
                {me.accepting ? 'Taking food' : 'Paused'}
              </button>
              <button type="button" className={me.refrigeration ? 'is-on' : ''} aria-pressed={me.refrigeration} onClick={() => data.updateNgo({ ...me, refrigeration: !me.refrigeration })}>
                <Thermometer size={15} /> Fridge
              </button>
              <button type="button" className={me.freezer ? 'is-on' : ''} aria-pressed={me.freezer} onClick={() => data.updateNgo({ ...me, freezer: !me.freezer })}>
                <Snowflake size={15} /> Freezer
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="partner-body">
        <h1>{offers.length ? `${offers.length === 1 ? 'Food is' : `${offers.length} offers are`} waiting for your answer` : 'No new offers right now'}</h1>
        {offers.length === 0 && (
          <p className="muted">When a donor nearby posts food you can store, it lands here. Keep this screen open.</p>
        )}

        {offers.map((d) => {
          const travel = travelMinutes(haversineKm(d, me))
          const leftMin = minutesBetween(now, d.safeUntil)
          const waitLeft = d.offeredAt ? Math.max(0, OFFER_TIMEOUT_MS - (now - d.offeredAt)) : null
          return (
            <article key={d.id} className="offer">
              <div className="offer-top">
                <Dial readyAt={d.readyAt} safeUntil={d.safeUntil} state="live" size={118} photo={d.photo} category={d.category} />
                <div>
                  <h2>
                    {d.serves} servings, {d.name.toLowerCase()}
                  </h2>
                  <p className="muted">
                    From {d.donor}, {d.location}
                  </p>
                </div>
              </div>
              <div className="offer-facts">
                <div className={leftMin < 90 ? 'is-hot' : ''}>
                  <b className="num">{formatDuration(Math.max(0, leftMin))}</b>
                  <span>left to eat</span>
                </div>
                <div>
                  <b className="num">{travel} min</b>
                  <span>to reach you</span>
                </div>
                <div>
                  <b>{d.storage === 'Ambient' ? 'No fridge' : d.storage === 'Chilled' ? 'Fridge' : 'Freezer'}</b>
                  <span>needed</span>
                </div>
              </div>
              <div className="offer-actions">
                <button
                  type="button"
                  className="post-button is-green"
                  onClick={() => {
                    data.accept(d.id)
                    say('Accepted. A runner is being sent.')
                  }}
                >
                  Yes, we'll take it
                </button>
                <button type="button" className="button-ghost" onClick={() => data.decline(d.id)}>
                  Not today, offer it to someone else
                </button>
              </div>
              {data.autopilot && waitLeft !== null && (
                <p className="offer-timer muted">
                  If you don't answer, it goes to the next partner in {Math.ceil(waitLeft / 1000)}s.
                </p>
              )}
            </article>
          )
        })}

        {coming.length > 0 && <h2 className="sub">On the way to you</h2>}
        {coming.map((d) => {
          const job = dispatch.jobs.find((j) => j.id === d.id)
          const runner = dispatch.runners.find((r) => r.id === job?.runnerId)
          return (
            <div key={d.id} className="coming">
              <Dial readyAt={d.readyAt} safeUntil={d.safeUntil} state="reserved" size={64} photo={d.photo} category={d.category} showText={false} />
              <div>
                <b>
                  {d.serves} servings, {d.name.toLowerCase()}
                </b>
                <p className="muted">
                  {!runner
                    ? 'Finding a runner'
                    : job?.status === 'Assigned'
                      ? `${runner.name} is heading to ${d.donor}`
                      : `${runner.name} has it and is on the way`}
                </p>
              </div>
            </div>
          )
        })}

        {received.length > 0 && <h2 className="sub">Received today</h2>}
        {received.map((d) => (
          <div key={d.id} className="coming">
            <Dial readyAt={d.readyAt} safeUntil={d.safeUntil} state="delivered" size={64} photo={d.photo} category={d.category} showText={false} />
            <div className="received-body">
              <b>
                {d.serves} servings from {d.donor}
              </b>
              {d.thanks ? (
                <p className="muted">You said: "{d.thanks}"</p>
              ) : (
                <div className="thanks-chips">
                  <span className="muted">Say thanks to {d.donor}:</span>
                  {THANKS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        data.sendThanks(d.id, t)
                        say(`Sent to ${d.donor}.`)
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        <p className="muted small">
          Open {formatClock(new Date(now).setHours(me.opensHour, 0, 0, 0))} to{' '}
          {me.closesHour === 24 ? 'midnight' : formatClock(new Date(now).setHours(me.closesHour, 0, 0, 0))}. Offers only come while you're open and have room.
        </p>
      </div>
    </div>
  )
}
