// SECOND-SERVE matching engine.
//
// Every function here is PURE: same inputs give the same outputs. There is
// no React, no localStorage and no Date.now() inside; "now" is passed in.
// That makes the logic easy to test and to explain.
//
// This is a rule-based, explainable scoring system. It is NOT machine
// learning: no model is trained anywhere.

import type { Donation, Ngo, RescueRecord, StorageType } from './types'

const MIN = 60_000

// ---------------------------------------------------------------------
// Platform policy: SECOND-SERVE's own operating assumptions, not
// food-safety regulations. Kept in one place so they can be explained.
// ---------------------------------------------------------------------
export const POLICY = {
  safetyBufferMinutes: 15, // food must arrive at least this long before its deadline
  roadFactor: 1.3, // straight-line km x 1.3 ≈ road km in a city
  dispatchLeadMinutes: 10, // assumed time for a runner to reach the donor
  dispatchSpeedKmh: 18, // assumed average city speed
  tightMarginMinutes: 30, // a safety margin below this gets a warning
}

// The four ranking factors. They add up to 1.0.
export const MATCH_WEIGHTS = {
  travel: 0.35,
  need: 0.3,
  safety: 0.2,
  hours: 0.15,
}

type Point = { lat: number; lng: number }

export function haversineKm(a: Point, b: Point): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function travelMinutes(km: number): number {
  const roadKm = km * POLICY.roadFactor
  return Math.max(1, Math.ceil((roadKm / POLICY.dispatchSpeedKmh) * 60))
}

export function minutesBetween(from: number, to: number): number {
  return Math.floor((to - from) / MIN)
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function sameLocalDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

export function isExpired(donation: Donation, now: number) {
  return now >= donation.safeUntil
}

// ---------------------------------------------------------------------
// Gate: storage compatibility
// ---------------------------------------------------------------------
export function storageCheck(storage: StorageType, ngo: Ngo) {
  if (storage === 'Chilled' && !ngo.refrigeration) {
    return { ok: false, reason: 'Food needs refrigeration; organisation has none' }
  }
  if (storage === 'Frozen' && !ngo.freezer) {
    return { ok: false, reason: 'Food needs a freezer; organisation has none' }
  }
  return {
    ok: true,
    reason:
      storage === 'Ambient'
        ? 'Room-temperature food: no special storage needed'
        : storage === 'Chilled'
          ? 'Has refrigeration for chilled food'
          : 'Has a freezer for frozen food',
  }
}

// ---------------------------------------------------------------------
// NGO capacity. Derived every time, never stored as a running counter,
// so it cannot drift out of sync:
//   remaining = daily capacity
//             - servings reserved for this NGO and not yet delivered
//             - servings delivered to this NGO today
// ---------------------------------------------------------------------
export function capacityUsage(
  ngo: Ngo,
  donations: Donation[],
  history: RescueRecord[],
  now: number,
) {
  const committed = donations
    .filter((d) => d.status === 'Reserved' && d.ngoId === ngo.id)
    .reduce((sum, d) => sum + d.serves, 0)

  const deliveredToday = history
    .filter((r) => r.ngoId === ngo.id && sameLocalDay(r.deliveredAt, now))
    .reduce((sum, r) => sum + r.servings, 0)

  const remaining = Math.max(0, ngo.dailyCapacity - committed - deliveredToday)

  return { committed, deliveredToday, remaining }
}

// ---------------------------------------------------------------------
// Opening hours
// ---------------------------------------------------------------------
export function openingCheck(ngo: Ngo, at: number) {
  if (ngo.opensHour <= 0 && ngo.closesHour >= 24) {
    return { open: true, minutesToClose: Infinity }
  }
  const opens = new Date(at)
  opens.setHours(ngo.opensHour, 0, 0, 0)
  const closes = new Date(at)
  closes.setHours(ngo.closesHour, 0, 0, 0) // setHours(24) means next midnight

  const open = at >= opens.getTime() && at < closes.getTime()
  return { open, minutesToClose: open ? minutesBetween(at, closes.getTime()) : 0 }
}

export function hoursLabel(ngo: Ngo) {
  if (ngo.opensHour <= 0 && ngo.closesHour >= 24) return 'Open 24 hours'
  const fmt = (h: number) => `${String(h % 24).padStart(2, '0')}:00`
  return `${fmt(ngo.opensHour)}–${fmt(ngo.closesHour)}`
}

// ---------------------------------------------------------------------
// Smart NGO matching
//   Step 1: hard eligibility gates. Any failure excludes the NGO and the
//           reason is shown.
//   Step 2: a weighted score from 0 to 100 ranks the eligible ones.
// ---------------------------------------------------------------------
export type ScoreBreakdown = {
  travel: number
  need: number
  safety: number
  hours: number
}

export type NgoEvaluation = {
  ngo: Ngo
  eligible: boolean
  failures: string[]
  reasons: string[]
  warnings: string[]
  score: number
  breakdown: ScoreBreakdown
  km: number
  travelMin: number
  arrival: number
  safetyMarginMin: number
  remaining: number
}

export function evaluateNgo(
  donation: Donation,
  ngo: Ngo,
  donations: Donation[],
  history: RescueRecord[],
  now: number,
): NgoEvaluation {
  const failures: string[] = []
  const reasons: string[] = []
  const warnings: string[] = []

  // Gate 1: verified partner
  if (ngo.verification !== 'Verified') {
    failures.push(`Not a verified partner (${ngo.verification.toLowerCase()})`)
  }

  // Gate 2: currently accepting donations
  if (!ngo.accepting) failures.push('Not accepting donations right now')

  // Gate 3: storage compatibility
  const storage = storageCheck(donation.storage, ngo)
  if (!storage.ok) failures.push(storage.reason)
  else reasons.push(storage.reason)

  // Gate 4: enough capacity left today
  const { remaining } = capacityUsage(ngo, donations, history, now)
  if (remaining < donation.serves) {
    failures.push(`Only ${remaining} of ${donation.serves} servings of capacity left today`)
  }

  // Delivery time estimate (before a runner is chosen)
  const km = haversineKm(donation, ngo)
  const travelMin = travelMinutes(km)
  const departure = Math.max(now + POLICY.dispatchLeadMinutes * MIN, donation.readyAt)
  const arrival = departure + travelMin * MIN

  // Gate 5: open when the food arrives
  const opening = openingCheck(ngo, arrival)
  if (!opening.open) {
    failures.push(`Closed at estimated arrival ${formatClock(arrival)} (${hoursLabel(ngo)})`)
  }

  // Gate 6: arrives before the safe-use deadline, with the buffer
  const safetyMarginMin = minutesBetween(
    arrival + POLICY.safetyBufferMinutes * MIN,
    donation.safeUntil,
  )
  if (safetyMarginMin < 0) {
    failures.push(
      `Would arrive ${Math.abs(safetyMarginMin)} min too late for safe use (includes ${POLICY.safetyBufferMinutes}-min buffer)`,
    )
  }

  // Each factor is normalised to 0..1
  const breakdown: ScoreBreakdown = {
    travel: clamp01(1 - travelMin / 45), // 0 min = 1.0, 45+ min = 0
    need: ngo.dailyCapacity > 0 ? clamp01(remaining / ngo.dailyCapacity) : 0, // unused share of today's capacity
    safety: clamp01(safetyMarginMin / 120), // 120+ min spare = 1.0
    hours: opening.open ? clamp01(opening.minutesToClose / 120) : 0, // open 120+ min after arrival = 1.0
  }

  const score = Math.round(
    100 *
      (MATCH_WEIGHTS.travel * breakdown.travel +
        MATCH_WEIGHTS.need * breakdown.need +
        MATCH_WEIGHTS.safety * breakdown.safety +
        MATCH_WEIGHTS.hours * breakdown.hours),
  )

  reasons.push(`${km.toFixed(1)} km away, about ${travelMin} min by road (estimate)`)
  reasons.push(`${remaining} of ${ngo.dailyCapacity} servings of capacity left today`)
  if (safetyMarginMin >= 0) {
    reasons.push(`Arrives with ${formatDuration(safetyMarginMin)} of safe time to spare`)
  }
  if (opening.open) {
    reasons.push(
      opening.minutesToClose === Infinity
        ? 'Open 24 hours'
        : `Open for ${formatDuration(opening.minutesToClose)} after arrival`,
    )
  }

  if (safetyMarginMin >= 0 && safetyMarginMin < POLICY.tightMarginMinutes) {
    warnings.push('Tight safety margin: assign a runner immediately')
  }
  if (remaining >= donation.serves && remaining - donation.serves < ngo.dailyCapacity * 0.1) {
    warnings.push("This will fill almost all of today's capacity")
  }
  if (donation.storage !== 'Ambient') {
    warnings.push('Keep the food cold in transit')
  }
  if (donation.deadlineAssumed) {
    warnings.push('Safe-use deadline was filled in automatically: confirm it with the donor')
  }

  return {
    ngo,
    eligible: failures.length === 0,
    failures,
    reasons,
    warnings,
    score,
    breakdown,
    km,
    travelMin,
    arrival,
    safetyMarginMin,
    remaining,
  }
}

export type MatchResult = {
  feasibility: 'Feasible' | 'Not feasible' | 'Expired'
  eligible: NgoEvaluation[]
  excluded: NgoEvaluation[]
  best: NgoEvaluation | null
}

export function matchNgos(
  donation: Donation,
  ngos: Ngo[],
  donations: Donation[],
  history: RescueRecord[],
  now: number,
): MatchResult {
  const all = ngos.map((ngo) => evaluateNgo(donation, ngo, donations, history, now))

  const eligible = all
    .filter((e) => e.eligible)
    .sort((a, b) => b.score - a.score || a.travelMin - b.travelMin)

  const excluded = all.filter((e) => !e.eligible)

  const feasibility = isExpired(donation, now)
    ? 'Expired'
    : eligible.length > 0
      ? 'Feasible'
      : 'Not feasible'

  return { feasibility, eligible, excluded, best: eligible[0] ?? null }
}
