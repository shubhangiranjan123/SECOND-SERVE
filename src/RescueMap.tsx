import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet'

import 'leaflet/dist/leaflet.css'
import 'leaflet-routing-machine'
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css'
import './RescueMap.css'

import type { Donation, Ngo } from './types'
import { formatDuration, haversineKm, isExpired, minutesBetween, POLICY, travelMinutes } from './rescueEngine'

type RouteInfo = { distanceKm: number; durationMinutes: number; road: boolean }

type LatLng = [number, number]

const CENTER: LatLng = [30.735, 76.785]

// Draws the road route between two points with OSRM. If the routing
// service is down (venue wifi!), it reports failure so we can fall back
// to a straight dashed line instead of an empty map.
function RoadRoute({
  from,
  to,
  onFound,
  onFail,
}: {
  from: LatLng
  to: LatLng
  onFound: (info: RouteInfo) => void
  onFail: () => void
}) {
  const map = useMap()

  useEffect(() => {
    const waypoints = [L.latLng(from[0], from[1]), L.latLng(to[0], to[1])]
    const control = L.Routing.control({
      waypoints,
      plan: L.Routing.plan(waypoints, {
        createMarker: () => false,
        addWaypoints: false,
        draggableWaypoints: false,
      }),
      addWaypoints: false,
      fitSelectedRoutes: true,
      show: false,
      lineOptions: {
        styles: [
          { color: '#1e2a24', weight: 9, opacity: 0.9 },
          { color: '#e2447f', weight: 5, opacity: 1 },
        ],
        extendToWaypoints: true,
        missingRouteTolerance: 10,
      },
      router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
    }).addTo(map)

    control.on('routesfound', (event) => {
      const route = event.routes[0]
      if (route) {
        onFound({
          distanceKm: route.summary.totalDistance / 1000,
          durationMinutes: Math.round(route.summary.totalTime / 60),
          road: true,
        })
      }
    })
    control.on('routingerror', onFail)

    return () => {
      map.removeControl(control)
    }
  }, [map, from, to, onFound, onFail])

  return null
}

type Props = {
  donations: Donation[]
  ngos: Ngo[]
  now: number
}

export default function RescueMap({ donations, ngos, now }: Props) {
  const live = donations.filter(
    (d) => (d.status === 'Available' && !isExpired(d, now)) || d.status === 'Reserved',
  )
  const verified = ngos.filter((n) => n.verification === 'Verified')

  // Show the route for the reserved donation closest to its deadline.
  const job = useMemo(() => {
    const reserved = donations
      .filter((d) => d.status === 'Reserved' && d.ngoId !== null)
      .sort((a, b) => a.safeUntil - b.safeUntil)[0]
    const ngo = reserved ? ngos.find((n) => n.id === reserved.ngoId) : undefined
    if (!reserved || !ngo) return null
    return {
      donation: reserved,
      ngo,
      from: [reserved.lat, reserved.lng] as LatLng,
      to: [ngo.lat, ngo.lng] as LatLng,
    }
  }, [donations, ngos])

  const jobKey = job ? `${job.donation.id}-${job.ngo.id}` : 'none'
  const [route, setRoute] = useState<{ key: string; info: RouteInfo | null; failed: boolean }>({
    key: jobKey,
    info: null,
    failed: false,
  })
  // Reset the route readout when the job changes (render-time reset, no effect needed).
  if (route.key !== jobKey) setRoute({ key: jobKey, info: null, failed: false })

  const onFound = useMemo(
    () => (info: RouteInfo) => setRoute((r) => ({ ...r, info, failed: false })),
    [],
  )
  const onFail = useMemo(() => () => setRoute((r) => ({ ...r, failed: true })), [])

  // Straight-line estimate, same maths as the matching engine.
  const estimate = job
    ? (() => {
        const km = haversineKm(job.donation, job.ngo)
        return { distanceKm: km * POLICY.roadFactor, durationMinutes: travelMinutes(km), road: false }
      })()
    : null
  const shown = route.info ?? estimate

  return (
    <section className="map-section" id="map" aria-labelledby="map-title">
      <div className="section-head">
        <div>
          <h2 id="map-title">Where the food is</h2>
          <p>
            Live listings in pink and green, verified partners in ink. The route is the most urgent
            reserved rescue.
          </p>
        </div>
        <ul className="map-legend">
          <li>
            <i className="dot dot-fresh" /> Waiting
          </li>
          <li>
            <i className="dot dot-urgent" /> Under 90 min
          </li>
          <li>
            <i className="dot dot-partner" /> Partner
          </li>
        </ul>
      </div>

      <div className="map-layout">
        <div className="map-frame">
          <MapContainer center={CENTER} zoom={13} scrollWheelZoom={false} className="map-canvas">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />

            {job && !route.failed && (
              <RoadRoute from={job.from} to={job.to} onFound={onFound} onFail={onFail} />
            )}
            {job && route.failed && (
              <Polyline
                positions={[job.from, job.to]}
                pathOptions={{ color: '#e2447f', weight: 5, dashArray: '2 12', lineCap: 'round' }}
              />
            )}

            {verified.map((ngo) => (
              <CircleMarker
                key={`n-${ngo.id}`}
                center={[ngo.lat, ngo.lng]}
                radius={9}
                pathOptions={{ color: '#fff2f7', weight: 3, fillColor: '#1e2a24', fillOpacity: 1 }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  {ngo.name}
                </Tooltip>
              </CircleMarker>
            ))}

            {live.map((d) => {
              const left = minutesBetween(now, d.safeUntil)
              const urgent = d.status === 'Available' && left < 90
              return (
                <CircleMarker
                  key={`d-${d.id}`}
                  center={[d.lat, d.lng]}
                  radius={urgent ? 14 : 11}
                  pathOptions={{
                    color: '#1e2a24',
                    weight: 3,
                    fillColor: urgent ? '#e2447f' : d.status === 'Reserved' ? '#ffc2da' : '#20b26b',
                    fillOpacity: 1,
                    className: urgent ? 'marker-urgent' : undefined,
                  }}
                >
                  <Popup>
                    <div className="map-popup">
                      <strong>{d.name}</strong>
                      <span>
                        {d.donor}, {d.location}
                      </span>
                      <span>
                        {d.status === 'Reserved'
                          ? 'Reserved'
                          : `Safe for ${formatDuration(left)}`}
                      </span>
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </div>

        <aside className="map-side">
          {job && shown ? (
            <>
              <p className="map-side-label">Now on the road</p>
              <p className="map-side-title">{job.donation.name}</p>
              <p className="map-side-sub">
                {job.donation.donor} to {job.ngo.name}
              </p>
              <div className="map-figures">
                <div>
                  <span className="map-figure num">{shown.durationMinutes} min</span>
                  <span>{shown.road ? 'by road' : 'estimated'}</span>
                </div>
                <div>
                  <span className="map-figure num">{shown.distanceKm.toFixed(1)} km</span>
                  <span>{shown.road ? 'road distance' : 'estimated distance'}</span>
                </div>
              </div>
              {route.failed && (
                <p className="map-side-note">
                  The routing service didn't answer, so this is a straight-line estimate.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="map-side-title">No rescue on the road yet</p>
              <p className="map-side-sub">
                Find a home for a listing and its route shows up here.
              </p>
            </>
          )}
          <p className="map-side-note">Areas use demo coordinates, not real addresses.</p>
        </aside>
      </div>
    </section>
  )
}
