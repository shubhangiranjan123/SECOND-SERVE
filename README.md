# Second Serve

Rescue good food before it spoils. A café posts what it couldn't sell, a nearby
shelter that can actually store it accepts, and a runner gets it there before
the safe-use window runs out.

## Run it

```bash
npm install
npm run dev
```

Open the link Vite prints. Press **Reset demo** (top right) before presenting,
so every countdown starts fresh.

## The four screens

The role switcher at the top changes who you are. **Open each role in its own
browser window**: they update each other live (the header says "4 screens live").

| Role | Who | Their one job |
|---|---|---|
| **Coordinator** `#/app/coordinator` | City food-bank admin | See every listing as a countdown ring on the map, offer food to the best partner, send runners, or turn on **Autopilot** |
| **Donor** `#/app/donor` | Café, caterer, market | Post food in three taps: photo, servings, "good for" time, safety check |
| **Partner** `#/app/partner` | Shelter, community kitchen | Accept or decline offers, see room left today, thank the donor |
| **Runner** `#/app/runner` | Volunteer on a bike or scooter | Take the nearest job, "I have the food", "Delivered" |

The story page (`#/`) is the pitch: a live counter of food wasted worldwide
since the page opened, how a rescue works, and the impact garden.

## 2-minute demo script

1. **Story page (20 s).** Let the waste counter run. "Since you opened this page,
   the world has thrown away this much food. Some of it is ten minutes away from
   someone who needs it."
2. **Donor window (20 s).** Post "veg biryani", 12 servings, good for 2 h, tick the
   safety checks, *Post it*. Snap a real photo if you can.
3. **Coordinator window (20 s).** It's already in *Needs a home* with the best partner
   picked and the reason shown. Click *Offer to …*.
4. **Partner window (15 s).** The offer just landed. *Yes, we'll take it*.
5. **Runner window (25 s).** *Take it* → *I have the food* → *Delivered*.
6. **Back to the coordinator (20 s).** The activity feed shows every step. Press
   **Replay today** to watch the day's rescues draw across the city, then open
   **Impact** for the garden: servings, kg of food and kg of CO₂e.

Optional: switch **Autopilot** on to show the app finding homes and runners by itself.

## How matching works

`src/rescueEngine.ts` checks each partner against hard rules (verified,
accepting, has a fridge or freezer if needed, room left today, open on arrival,
arrives before the deadline with a 15-minute buffer). Eligible partners are
ranked on travel time (35%), unmet capacity (30%), safety margin (20%) and
opening hours (15%). Partners who decline are skipped next time.

## Code map

| File | What it does |
|---|---|
| `useRescueData.ts` | All listings, partners, rescue history and activity, plus every action (post, offer, accept, decline, deliver, thank) |
| `useDispatch.ts` | Runners and delivery progress |
| `sync.ts` | Saves state and keeps every open tab in step. Swap this one hook for Supabase to sync across devices |
| `App.tsx` | Routing, role switcher, Autopilot, modals |
| `CoordinatorView.tsx`, `DonorView.tsx`, `PartnerView.tsx`, `RunnerView.tsx`, `StoryPage.tsx` | The screens |
| `LiveMap.tsx` | Leaflet map with countdown-ring markers and Replay |
| `Dial.tsx` | The countdown ring (a full ring is 12 hours of safe time) |

## Honest limits (say these before a judge asks)

- **Data lives in the browser.** Tabs and windows on one computer sync live;
  different devices need a backend. `sync.ts` is the single place to plug one in.
- **Locations are demo areas** of Chandigarh, not real addresses or GPS.
- **"Verified" is a button** in the prototype. Real verification would mean
  registration documents and a site visit.
- **Food safety is the donor's own judgement**, confirmed by the checklist. The app
  plans around it; it doesn't certify food.
- **Runners and some rescues are sample data**, labelled as such in the garden.

## Sources for the numbers on screen

- Food wasted: UNEP Food Waste Index Report 2024 (1.05 billion tonnes in 2022).
- Emissions: UNEP, food loss and waste is 8 to 10% of global greenhouse gas emissions.
- 420 g per serving: WRAP meal-equivalent guidance (lowest common factor).
- 2.5 kg CO₂e per kg of food wasted: FAO, *Food wastage footprint* (3.3 Gt CO₂e for 1.3 Gt of food).

Map data © OpenStreetMap contributors.
