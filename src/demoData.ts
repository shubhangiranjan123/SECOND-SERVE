import type { Donation, Ngo, StorageType } from './types'

export type Area = { name: string; lat: number; lng: number }

// Approximate coordinates of Chandigarh areas, for the demo only.
// These are not verified donor or recipient addresses.
export const AREAS: Area[] = [
  { name: 'Sector 8', lat: 30.748, lng: 76.795 },
  { name: 'Sector 15', lat: 30.752, lng: 76.77 },
  { name: 'Sector 17', lat: 30.741, lng: 76.779 },
  { name: 'Sector 22', lat: 30.734, lng: 76.775 },
  { name: 'Sector 26', lat: 30.727, lng: 76.804 },
  { name: 'Sector 34', lat: 30.722, lng: 76.768 },
  { name: 'Sector 35', lat: 30.727, lng: 76.759 },
  { name: 'Sector 36', lat: 30.737, lng: 76.755 },
  { name: 'Sector 43', lat: 30.719, lng: 76.75 },
  { name: 'Manimajra', lat: 30.718, lng: 76.835 },
]

// Finds the demo area mentioned in a location string.
// Falls back to Sector 17 (city centre) if none matches.
export function findArea(text: string): Area {
  const lower = text.toLowerCase()
  return (
    AREAS.find((area) =>
      new RegExp(`\\b${area.name.toLowerCase()}\\b`).test(lower),
    ) ?? AREAS[2]
  )
}

export function defaultStorage(category: string): StorageType {
  return category === 'Meals' ? 'Chilled' : 'Ambient'
}

const MIN = 60_000

// Sample donations. Deadlines are relative to the moment they are created,
// so a fresh demo always has live countdowns.
export function createInitialDonations(now: number): Donation[] {
  const base = (location: string) => {
    const area = findArea(location)
    return { location, lat: area.lat, lng: area.lng }
  }

  return [
    {
      id: 1,
      name: 'Freshly prepared rice bowls',
      donor: 'The Green Kitchen',
      category: 'Meals',
      quantity: 24,
      unit: 'meals',
      serves: 24,
      distance: '1.2 km',
      pickup: 'Before 6:30 PM',
      expires: 'Today',
      status: 'Available',
      emoji: '🍱',
      color: 'peach',
      ...base('Sector 35'),
      storage: 'Chilled',
      readyAt: now + 15 * MIN,
      safeUntil: now + 4 * 60 * MIN,
      ngoId: null,
    },
    {
      id: 2,
      name: 'Fresh bakery assortment',
      donor: 'Sunday Bakehouse',
      category: 'Bakery',
      quantity: 30,
      unit: 'items',
      serves: 15,
      distance: '2.4 km',
      pickup: 'Before 7:00 PM',
      expires: 'Today',
      status: 'Available',
      emoji: '🥐',
      color: 'yellow',
      ...base('Sector 34'),
      storage: 'Ambient',
      readyAt: now,
      safeUntil: now + 10 * 60 * MIN,
      ngoId: null,
    },
    {
      id: 3,
      name: 'Seasonal fresh produce',
      donor: 'Harvest Market',
      category: 'Produce',
      quantity: 8,
      unit: 'kg',
      serves: 20,
      distance: '3.1 km',
      pickup: 'Before 5:45 PM',
      expires: 'Today',
      status: 'Reserved',
      emoji: '🥬',
      color: 'green',
      ...base('Sector 22'),
      storage: 'Ambient',
      readyAt: now,
      safeUntil: now + 24 * 60 * MIN,
      ngoId: 101,
    },
    {
      id: 4,
      name: 'Fresh sandwich boxes',
      donor: 'Daily Grind Cafe',
      category: 'Meals',
      quantity: 18,
      unit: 'boxes',
      serves: 18,
      distance: '1.8 km',
      pickup: 'Before 6:15 PM',
      expires: 'Today',
      status: 'Available',
      emoji: '🥪',
      color: 'lavender',
      ...base('Sector 36'),
      storage: 'Chilled',
      readyAt: now,
      safeUntil: now + 80 * MIN,
      ngoId: null,
    },
  ]
}

// Fictional organisations for the prototype.
export function createInitialNgos(): Ngo[] {
  const at = (name: string) => {
    const area = findArea(name)
    return { area: area.name, lat: area.lat, lng: area.lng }
  }

  return [
    {
      id: 101,
      name: 'Annapurna Community Kitchen',
      type: 'Community kitchen',
      ...at('Sector 15'),
      verification: 'Verified',
      verificationNote: 'Registration and kitchen visit checked (demo)',
      verifiedAt: null,
      refrigeration: true,
      freezer: false,
      dailyCapacity: 120,
      accepting: true,
      opensHour: 8,
      closesHour: 22,
    },
    {
      id: 102,
      name: 'Haven Night Shelter',
      type: 'Shelter',
      ...at('Sector 43'),
      verification: 'Verified',
      verificationNote: 'Registration checked (demo)',
      verifiedAt: null,
      refrigeration: false,
      freezer: false,
      dailyCapacity: 60,
      accepting: true,
      opensHour: 0,
      closesHour: 24,
    },
    {
      id: 103,
      name: "Saathi Children's Home",
      type: "Children's home",
      ...at('Sector 26'),
      verification: 'Verified',
      verificationNote: 'Registration and storage checked (demo)',
      verifiedAt: null,
      refrigeration: true,
      freezer: true,
      dailyCapacity: 80,
      accepting: true,
      opensHour: 7,
      closesHour: 20,
    },
    {
      id: 104,
      name: 'Roti Bank Manimajra',
      type: 'Food bank',
      ...at('Manimajra'),
      verification: 'Pending',
      verificationNote: 'Documents submitted, awaiting review',
      verifiedAt: null,
      refrigeration: true,
      freezer: false,
      dailyCapacity: 150,
      accepting: true,
      opensHour: 9,
      closesHour: 21,
    },
    {
      id: 105,
      name: 'Sector 8 Elder Care Centre',
      type: 'Elder care',
      ...at('Sector 8'),
      verification: 'Verified',
      verificationNote: 'Registration checked (demo)',
      verifiedAt: null,
      refrigeration: true,
      freezer: false,
      dailyCapacity: 30,
      accepting: true,
      opensHour: 6,
      closesHour: 21,
    },
  ]
}
