
import { useMemo, useState } from 'react'
import './RescueIntelligenceTools.css'
type RescueDonation = {
  id: number
  name: string
  donor: string
  category: string
  quantity: number
  unit: string
  serves: number
  status: 'Available' | 'Reserved' | 'Delivered'
  location: string
}

type Props = {
  donations: RescueDonation[]
}

export default function RescueIntelligenceTools({ donations }: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [primaryCapacity, setPrimaryCapacity] = useState('10')
  const [backupCapacity, setBackupCapacity] = useState('10')
  const [growthPercent, setGrowthPercent] = useState(10)
  const [daysAhead, setDaysAhead] = useState(7)

  const selectedDonation = donations.find(
    (item) => String(item.id) === selectedId,
  )

  const servings = selectedDonation?.serves ?? 0
  const firstCapacity = Math.max(0, Number(primaryCapacity) || 0)
  const secondCapacity = Math.max(0, Number(backupCapacity) || 0)
  

  const primaryAllocation = Math.min(servings, firstCapacity)
  const backupAllocation = Math.min(
    Math.max(0, servings - primaryAllocation),
    secondCapacity,
  )
  const unallocated = Math.max(
    0,
    servings - primaryAllocation - backupAllocation,
  )

  const forecast = useMemo(() => {
    const categories = ['Meals', 'Bakery', 'Produce']

    const categoryTotals = categories.map((category) => {
      const currentServings = donations
        .filter((item) => item.category === category)
        .reduce((sum, item) => sum + item.serves, 0)

      // Scenario estimate, not a trained ML prediction.
      const estimatedTotal = Math.round(
        currentServings *
          (1 + growthPercent / 100) *
          (daysAhead / 7),
      )

      return {
        category,
        currentServings,
        estimatedTotal,
      }
    })

    const currentTotal = donations.reduce(
      (sum, item) => sum + item.serves,
      0,
    )

    const estimatedTotal = Math.round(
      currentTotal *
        (1 + growthPercent / 100) *
        (daysAhead / 7),
    )

    return {
      categories: categoryTotals,
      currentTotal,
      estimatedTotal,
      difference: estimatedTotal - currentTotal,
    }
  }, [donations, growthPercent, daysAhead])

  return (
    <>
      <article className="intelligence-card">
        <h3>Rescue cascade</h3>
        <p>If one partner can't take it all, how does it split across two?</p>

        <div className="ri-tool">
          <label className="ri-field">
            Donation to rescue
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              <option value="">Choose a donation</option>
              {donations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.serves} servings)
                </option>
              ))}
            </select>
          </label>

          {selectedDonation ? (
            <>
              <div className="ri-context">
                <span>Donor</span>
                <strong>{selectedDonation.donor}</strong>
                <span>Location</span>
                <strong>{selectedDonation.location}</strong>
                <span>Size</span>
                <strong>{servings} servings</strong>
              </div>

              <label className="ri-field">
                Primary recipient capacity (servings)
                <input
                  type="number"
                  min="0"
                  max="100000"
                  value={primaryCapacity}
                  onChange={(event) =>
                    setPrimaryCapacity(event.target.value)
                  }
                />
              </label>

              <label className="ri-field">
                Backup recipient capacity (servings)
                <input
                  type="number"
                  min="0"
                  max="100000"
                  value={backupCapacity}
                  onChange={(event) =>
                    setBackupCapacity(event.target.value)
                  }
                />
              </label>

              <div
                className={`ri-result ${
                  unallocated === 0 ? 'ri-good' : 'ri-warning'
                }`}
                aria-live="polite"
              >
                <strong>
                  {unallocated === 0
                    ? 'The donation can be allocated'
                    : 'Additional capacity needed'}
                </strong>
                <p>
                  {unallocated === 0
                    ? `All ${servings} servings fit within the entered capacities.`
                    : `${unallocated} servings still need a recipient.`}
                </p>
              </div>

              <div className="ri-allocation-list">
                <div>
                  <span>Primary recipient</span>
                  <strong>{primaryAllocation} servings</strong>
                </div>
                <div>
                  <span>Backup recipient</span>
                  <strong>{backupAllocation} servings</strong>
                </div>
                <div>
                  <span>Not yet allocated</span>
                  <strong>{unallocated} servings</strong>
                </div>
              </div>
              <p className="ri-note">
                This is a capacity-based planning simulation. It does not
                contact recipients or verify their availability.
              </p>
            </>
          ) : (
            <div className="ri-empty">
              Select a donation to calculate a backup allocation plan.
            </div>
          )}
        </div>
      </article>

      <article className="intelligence-card">
        <h3>Surplus forecast</h3>
        <p>Roughly how much surplus to plan collection capacity for.</p>

        <div className="ri-tool">
          <label className="ri-field">
            Forecast horizon
            <select
              value={daysAhead}
              onChange={(event) =>
                setDaysAhead(Number(event.target.value))
              }
            >
              <option value={3}>Next 3 days</option>
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
            </select>
          </label>

          <label className="ri-field">
            Assumed change in surplus: {growthPercent}%
            <input
              type="range"
              min="-50"
              max="100"
              step="5"
              value={growthPercent}
              onChange={(event) =>
                setGrowthPercent(Number(event.target.value))
              }
            />
          </label>

          <div className="ri-forecast-total">
            <span>Scenario estimate</span>
            <strong>
              {forecast.estimatedTotal.toLocaleString()}
            </strong>
            <small>servings over {daysAhead} days</small>
          </div>

          <div className="ri-forecast-comparison">
            <div>
              <span>Current listed servings</span>
              <strong>
                {forecast.currentTotal.toLocaleString()}
              </strong>
            </div>
            <div>
              <span>Estimated change</span>
              <strong>
                {forecast.difference > 0 ? '+' : ''}
                {forecast.difference.toLocaleString()}
              </strong>
            </div>
          </div>

          <div className="ri-category-heading">
            Category breakdown
          </div>

          {forecast.categories.map((item) => (
            <div className="ri-category-row" key={item.category}>
              <div>
                <span>{item.category}</span>
                <strong>
                  {item.estimatedTotal.toLocaleString()} servings
                </strong>
              </div>
              <div className="ri-bar-track">
                <div
                  className="ri-bar-fill"
                  style={{
                    width: `${
                      forecast.estimatedTotal === 0
                        ? 0
                        : Math.min(
                            100,
                            (item.estimatedTotal /
                              Math.max(1, forecast.estimatedTotal)) *
                              100,
                          )
                    }%`,
                  }}
                />
              </div>
            </div>
          ))}

          <div className="ri-result ri-neutral">
            <strong>
              {forecast.estimatedTotal === 0
                ? 'Gather more listing data'
                : growthPercent > 20
                  ? 'Prepare additional rescue capacity'
                  : growthPercent < 0
                    ? 'Plan for a lower surplus scenario'
                    : 'Review partner capacity in advance'}
            </strong>
            <p>
              Use this scenario to plan collection capacity. Actual
              surplus may differ.
            </p>
          </div>

          <p className="ri-note">
            Illustrative scenario, not a trained forecasting model.
            The app currently has listing data, not a time series of
            historical surplus records.
          </p>
        </div>
      </article>
    </>
  )
}
