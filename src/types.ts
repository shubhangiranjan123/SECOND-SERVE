// Shared data model for SECOND-SERVE.
// Timestamps are milliseconds since 1970 (the value Date.now() returns).

// How the food must be kept until it reaches the organisation.
export type StorageType = 'Ambient' | 'Chilled' | 'Frozen'

export type DonationStatus = 'Available' | 'Reserved' | 'Delivered'

export type Donation = {
  id: number
  name: string
  donor: string
  category: string
  quantity: number
  unit: string
  serves: number
  distance: string
  pickup: string
  expires: string
  status: DonationStatus
  emoji: string
  color: string
  location: string
  // Added for Smart NGO Matching
  storage: StorageType
  lat: number // approximate demo coordinates of the pickup area
  lng: number
  readyAt: number // when the food can be collected
  safeUntil: number // donor-declared safe-use deadline
  deadlineAssumed?: boolean // true if filled in automatically for an old saved listing
  ngoId: number | null // organisation it was reserved for
}

export type VerificationStatus = 'Verified' | 'Pending' | 'Rejected'

export type Ngo = {
  id: number
  name: string
  type: string
  area: string
  lat: number
  lng: number
  verification: VerificationStatus
  verificationNote: string
  verifiedAt: number | null
  refrigeration: boolean
  freezer: boolean
  dailyCapacity: number // servings it can receive and distribute per day
  accepting: boolean
  opensHour: number // 0-23
  closesHour: number // 1-24 (24 = midnight)
}

// Permanent record of one completed rescue. Names are copied in so the
// record still makes sense if the listing or organisation is later removed.
export type RescueRecord = {
  rescueId: string
  donationId: number
  food: string
  donor: string
  pickupArea: string
  ngoId: number | null
  ngoName: string
  runnerName: string
  quantity: number
  unit: string
  servings: number
  deliveredAt: number
}
