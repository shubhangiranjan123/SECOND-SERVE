import { useCallback, useEffect, useState } from 'react'
import type {
  ActivityEvent,
  Donation,
  DonationStatus,
  Ngo,
  RescueRecord,
  StorageType,
} from './types'
import {
  createInitialDonations,
  createInitialHistory,
  createInitialNgos,
  defaultStorage,
  findArea,
} from './demoData'
import { evaluateNgo, matchNgos } from './rescueEngine'
import { readJson, useSyncedState } from './sync'

export const DONATIONS_KEY = 'second-serve-donations'
export const NGOS_KEY = 'second-serve-ngos-v1'
export const HISTORY_KEY = 'second-serve-rescue-history-v2'
const EVENTS_KEY = 'second-serve-activity-v1'
const SETTINGS_KEY = 'second-serve-settings-v1'
const MIN = 60_000

export const UNITS: Record<string, string> = { Meals: 'meals', Bakery: 'items', Produce: 'kg' }

// ---------- loading + cleaning saved data ----------

// Older saved listings do not have every field. Fill them in once with
// safe defaults and flag an assumed deadline so it is never hidden.
function normaliseDonation(raw: Partial<Donation>, now: number): Donation | null {
  if (typeof raw.id !== 'number' || typeof raw.name !== 'string') return null
  const location = raw.location ?? ''
  const area = findArea(location)
  const category = raw.category ?? 'Meals'
  const status: DonationStatus =
    raw.status === 'Reserved' || raw.status === 'Delivered' ? raw.status : 'Available'
  const hasDeadline = typeof raw.safeUntil === 'number'

  return {
    id: raw.id,
    name: raw.name,
    donor: raw.donor ?? 'Unknown donor',
    category,
    quantity: raw.quantity ?? 1,
    unit: raw.unit ?? UNITS[category] ?? 'items',
    serves: raw.serves ?? raw.quantity ?? 1,
    distance: raw.distance ?? '',
    pickup: raw.pickup ?? '',
    expires: raw.expires ?? 'Today',
    status,
    emoji: raw.emoji ?? '',
    color: raw.color ?? '',
    location,
    storage: raw.storage ?? defaultStorage(category),
    lat: raw.lat ?? area.lat,
    lng: raw.lng ?? area.lng,
    readyAt: raw.readyAt ?? now,
    safeUntil: hasDeadline ? (raw.safeUntil as number) : now + 6 * 60 * MIN,
    deadlineAssumed: hasDeadline ? raw.deadlineAssumed : true,
    ngoId: typeof raw.ngoId === 'number' ? raw.ngoId : null,
    // Older saved data had no accept step: a reservation counted as accepted.
    accepted: typeof raw.accepted === 'boolean' ? raw.accepted : status !== 'Available',
    offeredAt: typeof raw.offeredAt === 'number' ? raw.offeredAt : undefined,
    acceptedAt: typeof raw.acceptedAt === 'number' ? raw.acceptedAt : undefined,
    declinedBy: Array.isArray(raw.declinedBy)
      ? raw.declinedBy.filter((n): n is number => typeof n === 'number')
      : [],
    photo:
      typeof raw.photo === 'string' && raw.photo.startsWith('data:image/') ? raw.photo : undefined,
    thanks: typeof raw.thanks === 'string' ? raw.thanks.slice(0, 80) : undefined,
  }
}

function loadDonations(): Donation[] {
  const now = Date.now()
  const parsed = readJson(DONATIONS_KEY)
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => normaliseDonation(item as Partial<Donation>, now))
      .filter((item): item is Donation => item !== null)
  }
  return createInitialDonations(now)
}

function loadNgos(): Ngo[] {
  const parsed = readJson(NGOS_KEY)
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (n): n is Ngo =>
        !!n &&
        typeof n === 'object' &&
        typeof (n as Ngo).id === 'number' &&
        typeof (n as Ngo).name === 'string' &&
        typeof (n as Ngo).dailyCapacity === 'number',
    )
  }
  return createInitialNgos()
}

function loadHistory(): RescueRecord[] {
  const parsed = readJson(HISTORY_KEY)
  if (Array.isArray(parsed)) {
    // Keep only well-formed records, and only one per donation.
    const seen = new Set<number>()
    return parsed.filter((r): r is RescueRecord => {
      const ok =
        !!r &&
        typeof r === 'object' &&
        typeof (r as RescueRecord).donationId === 'number' &&
        typeof (r as RescueRecord).deliveredAt === 'number' &&
        !seen.has((r as RescueRecord).donationId)
      if (ok) seen.add((r as RescueRecord).donationId)
      return ok
    })
  }
  return createInitialHistory(Date.now())
}

function loadEvents(): ActivityEvent[] {
  const parsed = readJson(EVENTS_KEY)
  return Array.isArray(parsed)
    ? parsed.filter((e): e is ActivityEvent => !!e && typeof (e as ActivityEvent).text === 'string').slice(0, 40)
    : []
}

type Settings = { autopilot: boolean }
function loadSettings(): Settings {
  const parsed = readJson(SETTINGS_KEY) as Partial<Settings> | null
  return { autopilot: parsed?.autopilot === true }
}

// Re-renders on an interval so countdowns and deadline checks stay current.
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

// ---------- the store ----------

export type QuickListing = {
  name: string
  donor: string
  category: string
  servings: number
  hoursGood: number
  storage: StorageType
  area: string
  pickup: string
  photo?: string
}

export type FullListing = {
  name: string
  donor: string
  category: string
  quantity: number
  location: string
  pickup: string
  storage: StorageType
  readyAt: number
  safeUntil: number
}

export function useRescueData() {
  const [donations, setDonations] = useSyncedState(DONATIONS_KEY, loadDonations)
  const [ngos, setNgos] = useSyncedState(NGOS_KEY, loadNgos)
  const [history, setHistory] = useSyncedState(HISTORY_KEY, loadHistory)
  const [events, setEvents] = useSyncedState(EVENTS_KEY, loadEvents)
  const [settings, setSettings] = useSyncedState(SETTINGS_KEY, loadSettings)

  const log = useCallback(
    (text: string, tone: ActivityEvent['tone'] = 'info') => {
      const at = Date.now()
      setEvents((cur) => [{ id: `${at}-${Math.random().toString(36).slice(2, 6)}`, at, text, tone }, ...cur].slice(0, 40))
    },
    [setEvents],
  )

  function addQuick(input: QuickListing) {
    const now = Date.now()
    const area = findArea(input.area)
    const produce = input.category === 'Produce'
    const donation: Donation = {
      id: now,
      name: input.name,
      donor: input.donor,
      category: input.category,
      quantity: produce ? Math.max(1, Math.round(input.servings / 2)) : input.servings,
      unit: UNITS[input.category] ?? 'items',
      serves: input.servings,
      distance: '',
      pickup: input.pickup || 'Ready now',
      expires: 'Today',
      status: 'Available',
      emoji: '',
      color: '',
      location: area.name,
      storage: input.storage,
      lat: area.lat,
      lng: area.lng,
      readyAt: now,
      safeUntil: now + input.hoursGood * 60 * MIN,
      deadlineAssumed: false,
      ngoId: null,
      accepted: false,
      declinedBy: [],
      photo: input.photo,
    }
    setDonations((cur) => [donation, ...cur])
    log(`${input.donor} posted ${input.servings} servings of ${input.name.toLowerCase()}`, 'info')
    return donation
  }

  function addFull(input: FullListing) {
    const now = Date.now()
    const area = findArea(input.location)
    const donation: Donation = {
      id: now,
      name: input.name,
      donor: input.donor,
      category: input.category,
      quantity: input.quantity,
      unit: UNITS[input.category] ?? 'items',
      serves: input.category === 'Produce' ? input.quantity * 2 : input.quantity,
      distance: '',
      pickup: input.pickup || 'Time to be confirmed',
      expires: 'Today',
      status: 'Available',
      emoji: '',
      color: '',
      location: area.name,
      storage: input.storage,
      lat: area.lat,
      lng: area.lng,
      readyAt: input.readyAt,
      safeUntil: input.safeUntil,
      deadlineAssumed: false,
      ngoId: null,
      accepted: false,
      declinedBy: [],
    }
    setDonations((cur) => [donation, ...cur])
    log(`${input.donor} posted ${input.name.toLowerCase()}`, 'info')
  }

  function editFull(id: number, input: FullListing) {
    const area = findArea(input.location)
    setDonations((cur) =>
      cur.map((d) =>
        d.id === id
          ? {
              ...d,
              name: input.name,
              donor: input.donor,
              category: input.category,
              quantity: input.quantity,
              unit: UNITS[input.category] ?? d.unit,
              serves: input.category === 'Produce' ? input.quantity * 2 : input.quantity,
              pickup: input.pickup || d.pickup,
              location: area.name,
              storage: input.storage,
              lat: area.lat,
              lng: area.lng,
              readyAt: input.readyAt,
              safeUntil: input.safeUntil,
              deadlineAssumed: false,
            }
          : d,
      ),
    )
  }

  function remove(id: number) {
    setDonations((cur) => cur.filter((d) => d.id !== id))
  }

  // Offer food to a partner. It holds their capacity until they answer.
  function offer(id: number, ngoId: number, by: 'coordinator' | 'autopilot' = 'coordinator') {
    const d = donations.find((x) => x.id === id)
    const ngo = ngos.find((n) => n.id === ngoId)
    if (!d || !ngo || d.status !== 'Available') return { ok: false, reason: 'Already handled' }
    const check = evaluateNgo(d, ngo, donations, history, Date.now())
    if (!check.eligible) return { ok: false, reason: check.failures[0] }
    setDonations((cur) =>
      cur.map((x) =>
        x.id === id && x.status === 'Available'
          ? { ...x, status: 'Reserved', ngoId, accepted: false, offeredAt: Date.now() }
          : x,
      ),
    )
    log(
      `${by === 'autopilot' ? 'Autopilot offered' : 'Offered'} ${d.name.toLowerCase()} to ${ngo.name}`,
      by === 'autopilot' ? 'warn' : 'info',
    )
    return { ok: true, score: check.score }
  }

  function accept(id: number) {
    const d = donations.find((x) => x.id === id)
    const ngo = ngos.find((n) => n.id === d?.ngoId)
    if (!d || d.status !== 'Reserved' || d.accepted) return
    setDonations((cur) =>
      cur.map((x) => (x.id === id ? { ...x, accepted: true, acceptedAt: Date.now() } : x)),
    )
    log(`${ngo?.name ?? 'Partner'} accepted ${d.name.toLowerCase()}`, 'good')
  }

  // Partner says no (or the offer timed out): back to the board, and that
  // partner is skipped next time.
  function decline(id: number, reason: 'declined' | 'timed out' = 'declined') {
    const d = donations.find((x) => x.id === id)
    const ngo = ngos.find((n) => n.id === d?.ngoId)
    if (!d || d.status !== 'Reserved' || d.accepted || d.ngoId === null) return
    const ngoId = d.ngoId
    setDonations((cur) =>
      cur.map((x) =>
        x.id === id
          ? {
              ...x,
              status: 'Available',
              ngoId: null,
              accepted: false,
              offeredAt: undefined,
              declinedBy: [...(x.declinedBy ?? []), ngoId],
            }
          : x,
      ),
    )
    log(`${ngo?.name ?? 'Partner'} ${reason} ${d.name.toLowerCase()}`, 'warn')
  }

  // Best partner for a listing, skipping anyone who already said no.
  function bestMatch(d: Donation, at: number) {
    const declined = new Set(d.declinedBy ?? [])
    const result = matchNgos(d, ngos.filter((n) => !declined.has(n.id)), donations, history, at)
    return result.best
  }

  function recordDelivery(donationId: number, runnerName: string) {
    const d = donations.find((x) => x.id === donationId)
    if (!d) return
    const ngo = ngos.find((n) => n.id === d.ngoId)
    setHistory((cur) => {
      if (cur.some((r) => r.donationId === donationId)) return cur
      const record: RescueRecord = {
        rescueId: `R-${donationId}`,
        donationId,
        food: d.name,
        donor: d.donor,
        pickupArea: d.location,
        ngoId: d.ngoId,
        ngoName: ngo?.name ?? 'Community Food Centre',
        runnerName,
        quantity: d.quantity,
        unit: d.unit,
        servings: d.serves,
        deliveredAt: Date.now(),
        from: { lat: d.lat, lng: d.lng },
        to: ngo ? { lat: ngo.lat, lng: ngo.lng } : undefined,
      }
      return [record, ...cur]
    })
    setDonations((cur) =>
      cur.map((x) => (x.id === donationId && x.status === 'Reserved' ? { ...x, status: 'Delivered' } : x)),
    )
    log(`${runnerName} delivered ${d.serves} servings to ${ngo?.name ?? 'a partner'}. A flower was planted.`, 'good')
  }

  function sendThanks(id: number, text: string) {
    setDonations((cur) => cur.map((x) => (x.id === id ? { ...x, thanks: text } : x)))
    const d = donations.find((x) => x.id === id)
    if (d) log(`${ngos.find((n) => n.id === d.ngoId)?.name ?? 'Partner'} thanked ${d.donor}: "${text}"`, 'good')
  }

  function updateNgo(updated: Ngo) {
    setNgos((cur) => cur.map((n) => (n.id === updated.id ? updated : n)))
  }

  function addNgo(ngo: Ngo) {
    setNgos((cur) => [...cur, ngo])
    log(`${ngo.name} registered and is waiting for verification`, 'info')
  }

  function setAutopilot(on: boolean) {
    setSettings((s) => ({ ...s, autopilot: on }))
    log(on ? 'Autopilot switched on' : 'Autopilot switched off', 'info')
  }

  function reset() {
    const now = Date.now()
    setDonations(createInitialDonations(now))
    setNgos(createInitialNgos())
    setHistory(createInitialHistory(now))
    setEvents([])
    setSettings({ autopilot: false })
  }

  return {
    donations,
    ngos,
    history,
    events,
    autopilot: settings.autopilot,
    log,
    addQuick,
    addFull,
    editFull,
    remove,
    offer,
    accept,
    decline,
    bestMatch,
    recordDelivery,
    sendThanks,
    updateNgo,
    addNgo,
    setAutopilot,
    reset,
  }
}

export type RescueData = ReturnType<typeof useRescueData>
