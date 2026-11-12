import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import { Pause, Play } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import './LiveMap.css'

import type { Donation, Ngo, RescueRecord } from './types'
import type { Job } from './useDispatch'
import { formatClock, isExpired } from './rescueEngine'

const CENTER: [number, number] = [30.736, 76.783]
const SCALE_MS = 12 * 60 * 60_000

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// A countdown ring as a map pin, with the food photo in the middle.
function ringIcon(d: Donation, now: number, selected: boolean) {
  const left = Math.max(0, d.safeUntil - now)
  const urgent = d.status === 'Available' && left < 90 * 60_000
  const reserved = d.status === 'Reserved'
  const size = urgent ? 66 : 54
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const share = Math.min(1, left / SCALE_MS)
  const h = Math.floor(left / 3_600_000)
  const m = Math.floor((left % 3_600_000) / 60_000)
  const label = h > 0 ? `${h}:${pad(m)}` : `${m}m`
  const photo = d.photo && d.photo.startsWith('data:image/') ? d.photo : ''
  const cls = ['ring-pin', urgent ? 'is-urgent' : '', reserved ? 'is-reserved' : '', selected ? 'is-selected' : '']
    .filter(Boolean)
    .join(' ')

  const html = `
    <div class="${cls}" style="width:${size}px;height:${size}px">
      ${urgent ? '<span class="ring-pin-ripple"></span>' : ''}
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="rp-track" stroke-width="${stroke}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="rp-fill" stroke-width="${stroke}"
          stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - share)}"
          transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>
      <span class="ring-pin-core cat-${escapeHtml(d.category.toLowerCase())}"
        ${photo ? `style="background-image:url('${photo}')"` : ''}>
        <b class="${reserved ? 'is-word' : ''}">${reserved ? (d.accepted ? 'Yes' : 'Asked') : label}</b>
      </span>
    </div>`

  return L.divIcon({ html, className: 'ring-pin-wrap', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

const partnerIcon = (busy: boolean) =>
  L.divIcon({
    html: `<span class="house-pin ${busy ? 'is-busy' : ''}"></span>`,
    className: 'house-pin-wrap',
    iconSize: [30, 30],
    iconAnchor: [15, 22],
  })

const runnerIcon = L.divIcon({
  html: '<span class="runner-pin"></span>',
  className: 'runner-pin-wrap',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

type Props = {
  donations: Donation[]
  ngos: Ngo[]
  jobs: Job[]
  history: RescueRecord[]
  now: number
  selectedId: number | null
  onSelect: (id: number) => void
}

export default function LiveMap({ donations, ngos, jobs, history, now, selectedId, onSelect }: Props) {
  const live = donations.filter(
    (d) => (d.status === 'Available' && !isExpired(d, now)) || d.status === 'Reserved',
  )
  const verified = ngos.filter((n) => n.verification === 'Verified')
  const incoming = new Set(donations.filter((d) => d.status === 'Reserved').map((d) => d.ngoId))

  // Lines: offers waiting for a yes (dotted ink), accepted rescues (pink).
  const lines = donations
    .filter((d) => d.status === 'Reserved' && d.ngoId !== null)
    .map((d) => {
      const ngo = ngos.find((n) => n.id === d.ngoId)
      return ngo
        ? { id: d.id, accepted: !!d.accepted, from: [d.lat, d.lng] as [number, number], to: [ngo.lat, ngo.lng] as [number, number] }
        : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // A runner who has picked up sits halfway along the route.
  const onTheRoad = jobs
    .filter((j) => j.status === 'Picked up' && j.drop)
    .map((j) => ({
      id: j.id,
      at: [(j.pickup.lat + j.drop!.lat) / 2, (j.pickup.lng + j.drop!.lng) / 2] as [number, number],
    }))

  // ---------- Replay today ----------
  const todays = useMemo(
    () =>
      history
        .filter((r) => r.from && r.to)
        .sort((a, b) => a.deliveredAt - b.deliveredAt),
    [history],
  )
  const [replayStep, setReplayStep] = useState<number | null>(null)

  useEffect(() => {
    if (replayStep === null) return
    const done = replayStep >= todays.length
    const timer = window.setTimeout(
      () => setReplayStep(done ? null : replayStep + 1),
      done ? 3200 : 950,
    )
    return () => window.clearTimeout(timer)
  }, [replayStep, todays.length])

  const replaying = replayStep !== null
  const shown = replaying ? todays.slice(0, replayStep) : []
  const replayServings = shown.reduce((s, r) => s + r.servings, 0)

  return (
    <div className={`live-map ${replaying ? 'is-replaying' : ''}`}>
      <MapContainer center={CENTER} zoom={13} scrollWheelZoom className="live-map-canvas" zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {!replaying &&
          lines.map((l) => (
            <Polyline
              key={`l-${l.id}`}
              positions={[l.from, l.to]}
              pathOptions={{
                color: l.accepted ? '#e2447f' : '#1e2a24',
                weight: l.accepted ? 5 : 3,
                dashArray: l.accepted ? '2 10' : '1 8',
                lineCap: 'round',
                className: l.accepted ? 'route-live' : 'route-offer',
              }}
            />
          ))}

        {shown.map((r) => (
          <Polyline
            key={`r-${r.rescueId}`}
            positions={[
              [r.from!.lat, r.from!.lng],
              [r.to!.lat, r.to!.lng],
            ]}
            pathOptions={{ color: '#e2447f', weight: 6, lineCap: 'round', className: 'route-replay' }}
          />
        ))}

        {verified.map((ngo) => (
          <Marker key={`n-${ngo.id}`} position={[ngo.lat, ngo.lng]} icon={partnerIcon(incoming.has(ngo.id))}>
            <Tooltip direction="top" offset={[0, -18]}>
              {ngo.name}
            </Tooltip>
          </Marker>
        ))}

        {!replaying &&
          live.map((d) => (
            <Marker
              key={`d-${d.id}`}
              position={[d.lat, d.lng]}
              icon={ringIcon(d, now, selectedId === d.id)}
              eventHandlers={{ click: () => onSelect(d.id) }}
              zIndexOffset={d.safeUntil - now < 90 * 60_000 ? 500 : 0}
              keyboard
              title={`${d.name}, ${d.donor}`}
            >
              <Tooltip direction="right" offset={[34, 0]} permanent={d.status === 'Available' && d.safeUntil - now < 90 * 60_000}>
                <strong>{d.name}</strong>
                <br />
                {d.donor}, until {formatClock(d.safeUntil)}
              </Tooltip>
            </Marker>
          ))}

        {!replaying &&
          onTheRoad.map((r) => <Marker key={`run-${r.id}`} position={r.at} icon={runnerIcon} />)}
      </MapContainer>

      <div className="live-map-bottom">
        <ul className="live-map-legend" aria-label="Map key">
          <li>
            <i className="lg-ring" /> Ring = time left
          </li>
          <li>
            <i className="lg-ring lg-urgent" /> Under 90 min
          </li>
          <li>
            <i className="lg-house" /> Partner
          </li>
          <li>
            <i className="lg-line" /> On its way
          </li>
        </ul>
        <button
          type="button"
          className="replay-button"
          onClick={() => setReplayStep(replaying ? null : 0)}
          disabled={!replaying && todays.length === 0}
        >
          {replaying ? <Pause size={16} /> : <Play size={16} />}
          {replaying ? 'Stop replay' : 'Replay today'}
        </button>
      </div>

      {replaying && (
        <div className="replay-card" aria-live="polite">
          <span className="replay-count num">{Math.min(replayStep ?? 0, todays.length)}</span>
          <span>
            of {todays.length} rescues today
            <br />
            <b className="num">{replayServings}</b> servings eaten, not binned
          </span>
        </div>
      )}
    </div>
  )
}
