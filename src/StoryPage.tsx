import WasteCounter from './WasteCounter'
import Garden from './Garden'
import { href } from './route'
import type { RescueData } from './useRescueData'
import { isExpired, minutesBetween } from './rescueEngine'
import './Story.css'

type Props = {
  data: RescueData
  now: number
}

const STEPS = [
  {
    who: 'A café',
    does: 'snaps a photo of what it couldn’t sell and posts it in three taps.',
    role: 'donor' as const,
    cta: 'Try it as a donor',
  },
  {
    who: 'A shelter nearby',
    does: 'gets the offer only if it has a fridge, room today and open doors. One tap to accept.',
    role: 'partner' as const,
    cta: 'Try it as a partner',
  },
  {
    who: 'A runner',
    does: 'gets the closest job, collects it, and drops it off before the countdown runs out.',
    role: 'runner' as const,
    cta: 'Try it as a runner',
  },
]

export default function StoryPage({ data, now }: Props) {
  const live = data.donations.filter((d) => d.status === 'Available' && !isExpired(d, now))
  const urgent = live.filter((d) => minutesBetween(now, d.safeUntil) < 90).length
  const servings = live.reduce((s, d) => s + d.serves, 0)

  return (
    <div className="story">
      <WasteCounter ctaHref={href('coordinator')} ctaLabel="Open the control room" />

      <section className="turn" aria-labelledby="turn-title">
        <h2 id="turn-title">
          Some of it is perfectly good food, ten minutes away from someone who needs it.
        </h2>
        <p className="turn-live">
          <span className="live-dot" aria-hidden="true" />
          Right now in Chandigarh: <b className="num">{live.length}</b> listings,{' '}
          <b className="num">{servings}</b> servings
          {urgent > 0 && (
            <>
              , <b className="num pink">{urgent}</b> under 90 minutes
            </>
          )}
          .
        </p>
      </section>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title">How a rescue happens</h2>
        <ol className="how-steps">
          {STEPS.map((s, i) => (
            <li key={s.role} className={`how-step how-${s.role}`}>
              <span className="how-num num">{i + 1}</span>
              <p>
                <b>{s.who}</b> {s.does}
              </p>
              <a className="how-cta" href={href(s.role)}>
                {s.cta}
              </a>
            </li>
          ))}
        </ol>
        <p className="how-note">
          Open each role in its own window: they update each other live.
        </p>
      </section>

      <div className="story-garden">
        <Garden history={data.history} />
      </div>

      <section className="story-end">
        <h2>Watch it all happen at once</h2>
        <p>The control room shows every listing as a countdown on the map, and steps in when time gets tight.</p>
        <a className="post-button story-end-cta" href={href('coordinator')}>
          Open the control room
        </a>
      </section>

      <footer className="footer">
        <span className="footer-brand">second serve</span>
        <p>Food loss and waste drives 8 to 10% of global emissions (UNEP). Built around SDG 13.</p>
      </footer>
    </div>
  )
}
