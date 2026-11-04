
import { useCallback, useEffect, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet'

import 'leaflet/dist/leaflet.css'
import 'leaflet-routing-machine'
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css'
import './RescueMap.css'

type RouteInfo = {
  distanceKm: number
  durationMinutes: number
}

const demoRescuePoints = [
  {
    id: 1,
    name: 'Community Meal Hub',
    category: 'Prepared meals',
    quantity: '24 servings',
    urgency: 'High priority',
    position: [30.7333, 76.7794] as [number, number],
  },
  {
    id: 2,
    name: 'Fresh Produce Pickup',
    category: 'Fruits and vegetables',
    quantity: '12 kg',
    urgency: 'Available',
    position: [30.7415, 76.7681] as [number, number],
  },
  {
    id: 3,
    name: 'Bakery Surplus',
    category: 'Bakery',
    quantity: '30 items',
    urgency: 'Available',
    position: [30.7250, 76.7900] as [number, number],
  },
]

function RescueRoute({
  onRouteFound,
}: {
  onRouteFound: (info: RouteInfo) => void
}) {
  const map = useMap()

  useEffect(() => {
    const routingControl = L.Routing.control({
      waypoints: [
        L.latLng(30.7333, 76.7794),
        L.latLng(30.7415, 76.7681),
      ],
      addWaypoints: false,
      fitSelectedRoutes: true,
      show: false,
      lineOptions: {
        styles: [
          { color: '#718b60', weight: 5, opacity: 0.85 },
        ],
        extendToWaypoints: true,
        missingRouteTolerance: 10,
      },
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
      }),
    }).addTo(map)

    routingControl.on('routesfound', (event) => {
      const route = event.routes[0]

      if (route) {
        onRouteFound({
          distanceKm: route.summary.totalDistance / 1000,
          durationMinutes: Math.round(
            route.summary.totalTime / 60
          ),
        })
      }
    })

    return () => {
      map.removeControl(routingControl)
    }
  }, [map, onRouteFound])

  return null
}

export default function RescueMap() {
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)

  const handleRouteFound = useCallback((info: RouteInfo) => {
    setRouteInfo(info)
  }, [])

  return (
    <section className="rescue-map-section" id="rescue-radar">
      <div className="rescue-map-heading">
        <div>
          <span className="rescue-map-eyebrow">
            RESCUE RADAR / 01
          </span>

          <h2>Good food, on the map.</h2>

          <p>
            Explore sample rescue points and see where surplus food
            could go next.
          </p>
        </div>

        <span className="rescue-map-demo-badge">
          DEMO LOCATIONS
        </span>
      </div>

      <div className="rescue-map-legend">
        <span>
          <i className="map-dot map-dot-urgent" />
          High priority
        </span>

        <span>
          <i className="map-dot map-dot-available" />
          Available
        </span>
      </div>

      <div className="rescue-map-frame">
        <MapContainer
          center={[30.7333, 76.7794]}
          zoom={14}
          scrollWheelZoom={true}
          className="rescue-leaflet-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <RescueRoute onRouteFound={handleRouteFound} />

          {demoRescuePoints.map((point) => (
            <CircleMarker
              key={point.id}
              center={point.position}
              radius={9}
              pathOptions={{
                color:
                  point.urgency === 'High priority'
                    ? '#b86a4d'
                    : '#718b60',
                fillColor:
                  point.urgency === 'High priority'
                    ? '#d98a6b'
                    : '#9ab58a',
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Popup>
                <div className="rescue-map-popup">
                  <strong>{point.name}</strong>
                  <span>{point.category}</span>
                  <span>{point.quantity}</span>
                  <b>{point.urgency}</b>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="route-info">
        {routeInfo ? (
          <>
            <div className="route-stat">
              <span className="route-label">ESTIMATED DRIVE</span>
              <strong className="route-value">
                {routeInfo.durationMinutes} min
              </strong>
            </div>

            <div className="route-divider"></div>

            <div className="route-stat">
              <span className="route-label">ROAD DISTANCE</span>
              <strong className="route-value">
                {routeInfo.distanceKm.toFixed(1)} km
              </strong>
            </div>
          </>
        ) : (
          <span>Calculating road route…</span>
        )}
      </div>

      <p className="rescue-map-note">
        Sample coordinates for the prototype. These are not verified
        donor or recipient addresses.
      </p>
    </section>
  )
}
