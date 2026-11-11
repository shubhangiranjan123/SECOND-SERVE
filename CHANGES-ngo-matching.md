# SECOND-SERVE: Smart NGO Matching, NGO Verification, NGO Capacity, Lifetime Rescues

## How to apply

1. Make a branch first (in PowerShell):
   ```
   cd D:\Documents\SECOND-SERVE
   git status
   git checkout -b feature/ngo-matching
   ```
2. Copy everything in this zip's `src` folder into `D:\Documents\SECOND-SERVE\src`. Replace the files when asked.
3. Run:
   ```
   npm run build
   npm run dev
   ```
4. **Recommended for a clean demo:** in the browser press F12, then go to Application, then Local Storage, then `http://localhost:5173`. Delete `second-serve-donations` and `second-serve-dispatch-v1`, then refresh. That loads the new sample data, with live deadlines and the produce reserved for Annapurna.
   - If you skip this step, your old listings still load. They get a safe-use deadline 6 hours from first load, marked "(assumed)". Nothing breaks either way.

## Files

| File | Status | What it does |
|---|---|---|
| `types.ts` | new | Shared `Donation`, `Ngo` and `RescueRecord` types |
| `demoData.ts` | new | Demo areas (approximate coordinates), sample donations and NGOs |
| `rescueEngine.ts` | new | Pure matching logic: eligibility gates, scoring and capacity |
| `NgoMatchModal.tsx` | new | Ranked recommendations with score, breakdown, reasons, warnings and exclusions |
| `NgoNetwork.tsx` | new | Verify, reject or revoke organisations; edit daily capacity; pause accepting; register new organisations |
| `NgoMatching.css` | new | Styles for the two components above |
| `App.tsx` | changed | Owns NGOs and rescue history; Reserve now opens matching; new form fields; stat cards |
| `RunnerDispatch.tsx` | changed | Destination is the matched NGO; reports completion to App; shows lifetime rescues |
| `RescueIntelligenceTools.tsx` | 1 line | Accepts the new `Delivered` status |

**Unchanged:** `App.css`, `RescueMap`, and the runner workflow (assign, then picked up, then delivered).

## localStorage keys

- `second-serve-donations`: same key as before, with new fields added
- `second-serve-ngos-v1`: new
- `second-serve-rescue-history-v1`: new. This is the one source of truth for lifetime rescues.
- `second-serve-dispatch-v1`: unchanged

## How matching works (for judges)

**Step 1: hard gates.** Failing any gate excludes the organisation, and the reason is shown.

1. It is verified.
2. It is accepting donations right now.
3. Its storage is compatible: chilled food needs refrigeration, frozen food needs a freezer.
4. Its remaining capacity today is at least the donation's servings.
5. It is open at the estimated arrival time.
6. The food arrives at least 15 minutes before the safe-use deadline.

**Step 2: weighted score (0–100).**

| Factor | Weight | Value 1.0 when… |
|---|---:|---|
| Travel time | 35% | 0 min (falls to 0 at 45 min) |
| Unmet capacity | 30% | none of today's capacity is used yet (spreads food fairly) |
| Safety margin | 20% | 120 min or more of spare safe time on arrival |
| Opening hours | 15% | open for 120 min or more after arrival |

Ties are broken by shorter travel time.

**Why these weights differ from the original 30/25/20/15/10 table:** storage compatibility and capacity are now pass/fail gates, so scoring them again would add nothing. Urgency belongs to the donation and is the same for every NGO, so it can't change the ranking. Its effect is captured by "safety margin" instead.

**Capacity** is recalculated every time and never stored as a counter: daily capacity, minus servings reserved for that NGO, minus servings delivered to it today.

**Lifetime rescues:** a record is written only when a job reaches Delivered. Records are keyed by donation id, so the same rescue can never be recorded twice, even after a refresh, a re-render or a repeated click.

**Honest limits:**
- Travel uses straight-line distance × 1.3 at 18 km/h, not real routing.
- Locations are demo coordinates.
- Verification is a coordinator clicking a button in this browser.
- Safe-use deadlines are the donor's own judgement. SECOND-SERVE does not certify food safety.
- localStorage is per-browser and not a shared database.
- This is a rule-based scoring system, not machine learning.

## Test checklist

1. Lifetime rescues shows 0.
2. Press Reserve on the rice bowls. You should see 3 eligible organisations. Haven appears under "excluded" with the reason "needs refrigeration", and Roti Bank is excluded as "not verified".
3. Reserve it for the best match. The card shows "→ Annapurna…", and the Annapurna card shows the servings as "reserved".
4. Press × on the reserved card. Removal is blocked with a message.
5. In Runner Dispatch, assign Meera, then mark it picked up, then delivered. Lifetime rescues becomes 1 in both the stat card and Dispatch, and the card shows "Delivered ✓".
6. Refresh. The count stays at 1.
7. Verify Roti Bank, then press Reserve on the bakery item. Roti Bank now appears in the list.
8. Set Haven's daily capacity to 0. On the next match it is excluded with "Only 0 of 15 servings".
9. Register a new organisation. It shows as "Pending" and never appears as a match until verified.
