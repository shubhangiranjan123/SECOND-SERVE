import { useMemo } from 'react'
import type { Donation, Ngo } from './types'
import { haversineKm, minutesBetween, travelMinutes } from './rescueEngine'
import { findArea } from './demoData'
import { readJson, useSyncedState } from './sync'

// Runner dispatch state, shared by the coordinator, the runner's phone view
// and every other open tab, so all of them always show the same jobs.

export type Runner = {
  id: number
  name: string
  initials: string
  vehicle: string
  completed: number
  homeArea: string // where they usually wait, used for "4 min away"
  // false only for the sample runner who is out on an unrelated job
  onDuty: boolean
}

export type JobStatus = 'Awaiting runner' | 'Assigned' | 'Picked up' | 'Delivered'
type Step = Exclude<JobStatus, 'Awaiting runner'>
export const JOB_STEPS: Step[] = ['Assigned', 'Picked up', 'Delivered']

export type Job = {
  id: number // same as the donation id
  food: string
  servings: number
  storage: Donation['storage']
  photo?: string
  category: string
  donor: string
  pickupArea: string
  pickupNote: string
  pickup: { lat: number; lng: number }
  destination: string
  destinationArea: string
  drop: { lat: number; lng: number } | null
  safeUntil: number
  minutesLeft: number
  urgent: boolean
  runnerId: number | null
  status: JobStatus
  acceptedAt?: number
}

type Progress = { runnerId: number; status: Step }
type Saved = { runners: Runner[]; progress: Record<number, Progress> }

export const DISPATCH_STORAGE_KEY = 'second-serve-dispatch-v3'

const initialRunners: Runner[] = [
  { id: 1, name: 'Aarav Sharma', initials: 'AS', vehicle: 'Bicycle', completed: 28, homeArea: 'Sector 35', onDuty: true },
  { id: 2, name: 'Meera Kapoor', initials: 'MK', vehicle: 'Scooter', completed: 42, homeArea: 'Sector 22', onDuty: true },
  { id: 3, name: 'Kabir Singh', initials: 'KS', vehicle: 'Bicycle', completed: 19, homeArea: 'Sector 8', onDuty: false },
]

function isProgress(value: unknown): value is Progress {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<Progress>
  return typeof p.runnerId === 'number' && JOB_STEPS.includes(p.status as Step)
}

function load(): Saved {
  const parsed = readJson(DISPATCH_STORAGE_KEY) as
    | { runners?: Partial<Runner>[]; progress?: Record<string, unknown> }
    | null
  if (!parsed) return { runners: initialRunners, progress: {} }
  const runners = initialRunners.map((base) => {
    const saved = parsed.runners?.find((r) => r.id === base.id)
    return saved && typeof saved.completed === 'number' ? { ...base, completed: saved.completed } : base
  })
  const progress: Record<number, Progress> = {}
  for (const [id, p] of Object.entries(parsed.progress ?? {})) {
    if (isProgress(p)) progress[Number(id)] = p
  }
  return { runners, progress }
}

export function freshDispatch(): Saved {
  return { runners: initialRunners, progress: {} }
}

export function useDispatch(
  donations: Donation[],
  ngos: Ngo[],
  now: number,
  onDelivered: (donationId: number, runnerName: string) => void,
) {
  const [saved, setSaved] = useSyncedState(DISPATCH_STORAGE_KEY, load)
  const { runners, progress } = saved

  // Jobs are derived from the donations every render: only food a partner
  // has accepted needs a runner.
  const jobs = useMemo<Job[]>(
    () =>
      donations
        .filter(
          (d) =>
            (d.status === 'Reserved' && d.accepted) ||
            (d.status === 'Delivered' && progress[d.id] !== undefined),
        )
        .map((d) => {
          const p = progress[d.id]
          const ngo = ngos.find((n) => n.id === d.ngoId)
          const status: JobStatus =
            d.status === 'Delivered' ? 'Delivered' : (p?.status ?? 'Awaiting runner')
          const minutesLeft = minutesBetween(now, d.safeUntil)
          return {
            id: d.id,
            food: d.name,
            servings: d.serves,
            storage: d.storage,
            photo: d.photo,
            category: d.category,
            donor: d.donor,
            pickupArea: d.location,
            pickupNote: d.pickup,
            pickup: { lat: d.lat, lng: d.lng },
            destination: ngo?.name ?? 'Community Food Centre',
            destinationArea: ngo?.area ?? '',
            drop: ngo ? { lat: ngo.lat, lng: ngo.lng } : null,
            safeUntil: d.safeUntil,
            minutesLeft,
            urgent: status !== 'Delivered' && minutesLeft < 90,
            runnerId: p?.runnerId ?? null,
            status,
            acceptedAt: d.acceptedAt,
          }
        })
        .sort(
          (a, b) =>
            Number(a.status === 'Delivered') - Number(b.status === 'Delivered') ||
            a.minutesLeft - b.minutesLeft,
        ),
    [donations, ngos, progress, now],
  )

  const busyIds = new Set(
    jobs.filter((j) => j.status === 'Assigned' || j.status === 'Picked up').map((j) => j.runnerId),
  )
  const isFree = (r: Runner) => r.onDuty && !busyIds.has(r.id)
  const freeRunners = runners.filter(isFree)

  // Minutes for a runner to reach a job's pickup point from their home area.
  function minutesAway(runner: Runner, job: Job) {
    const home = findArea(runner.homeArea)
    return travelMinutes(haversineKm(home, job.pickup))
  }

  function nearestFree(job: Job) {
    return [...freeRunners].sort((a, b) => minutesAway(a, job) - minutesAway(b, job))[0] ?? null
  }

  function assign(jobId: number, runnerId: number) {
    const runner = runners.find((r) => r.id === runnerId)
    const job = jobs.find((j) => j.id === jobId)
    if (!runner || !isFree(runner) || !job || job.status !== 'Awaiting runner') return false
    setSaved((cur) => ({ ...cur, progress: { ...cur.progress, [jobId]: { runnerId, status: 'Assigned' } } }))
    return true
  }

  function advance(jobId: number) {
    const p = progress[jobId]
    const job = jobs.find((j) => j.id === jobId)
    if (!p || !job || p.status === 'Delivered') return
    const next = JOB_STEPS[JOB_STEPS.indexOf(p.status) + 1]
    setSaved((cur) => ({
      runners:
        next === 'Delivered'
          ? cur.runners.map((r) => (r.id === p.runnerId ? { ...r, completed: r.completed + 1 } : r))
          : cur.runners,
      progress: { ...cur.progress, [jobId]: { ...p, status: next } },
    }))
    if (next === 'Delivered') {
      const runner = runners.find((r) => r.id === p.runnerId)
      onDelivered(jobId, runner?.name ?? 'A runner')
    }
  }

  function reset() {
    setSaved(freshDispatch())
  }

  return { runners, jobs, freeRunners, isFree, minutesAway, nearestFree, assign, advance, reset }
}

export type DispatchApi = ReturnType<typeof useDispatch>
