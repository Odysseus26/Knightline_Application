# Knightline App

React Native client for [Knightline](https://github.com/<you>/knightline) —
the unofficial Rutgers intercampus bus API.

Live bus tracking, route geometry, nearby stops, building search, and
point-to-point journey planning on an interactive map.

## Backend setup

This app requires a running Knightline backend. Two options:

**Run locally:**

    git clone https://github.com/<you>/knightline.git
    cd knightline
    # follow knightline README

**Or point at a deployed instance:** edit `components/api/config.ts` and
set `API_BASE` to the URL.

Then in this repo:

    npm install
    npx expo start

The app is designed to fail gracefully when the backend is unreachable —
the map still renders, but the bus and building layers stay empty until
it reconnects.

## Features

### Live map

- Every Rutgers intercampus bus plotted with its current position, speed,
  and heading. Refreshes every 30 seconds while the app is foregrounded.
- Directional arrow above each bus marker when the bus is moving; arrow
  rotates to the bus's current bearing.
- Idle buses (buses whose position hasn't changed meaningfully between
  the last two snapshots) render with a faded marker and an `IDLE` badge.
- Route color is taken from the route definition so each bus matches its
  route's chip in the top selector.

### Route selection

- Horizontal chip strip at the top of the screen lists all ~17 intercampus
  routes. Tap any chip to toggle that route on or off.
- Enabled routes render their full polyline (decoded from Google-encoded
  polylines), stop markers along the path, and all live buses serving that
  route.
- The map auto-fits its viewport to the combined geometry of all enabled
  routes whenever the selection changes.
- Two marker rendering modes toggled from the top-right header:
  - **Pie** — stop markers split into wedges, one wedge per route serving
    that stop.
  - **Solid** — a single uniform grey marker regardless of routes served.

### Stop arrivals

- Tap any stop marker to open its arrivals panel.
- Panel lists upcoming buses with route chip, bus name, and ETA
  (recomputed every second, corrected for server clock skew).
- A live `IDLE` toggle shows or hides parked buses. When off, the badge
  shows the count of currently hidden idle buses.
- Route filter chips narrow the arrivals list to a subset of routes.
  Enabled routes come first, then routes serving the stop that aren't
  currently enabled (rendered as `+ RouteName` dashed chips).
- A `Route here →` button appears when location is available and opens
  the journey planner to that stop.

### Nearby stops

- Floating 📍 button opens a "Nearby Stops" panel.
- Lists the closest stops to the user, with walk time and walk distance.
- Each row shows up to three route chips; `+N` if more routes serve it.
- Route filter chips let the user restrict the query to specific routes.
- Tapping a stop flies the map there and opens its arrivals panel.

### Catch banner

- When exactly one route is enabled and the user has a location, a banner
  appears at the top of the map showing the single best boarding option:
  which stop to walk to, how long the walk is, which bus to catch, and how
  long until that bus arrives.
- Computed by `findBestBoardingForRoute`, which considers every stop on
  the route (not just the nearest) and picks the pairing that minimizes
  total walk + wait time.
- Tapping the banner selects the stop and focuses the bus.

### Buildings layer

- Rutgers campus buildings render as markers at zoom-appropriate density,
  pulled from the Knightline places API.
- Every building has a `labelRank` from 0 to 5 based on its prominence
  in the Rutgers Campus Map frontend:
  - **Rank 5** — always visible, even at Rutgers-wide zoom. Big
    landmarks and major destinations.
  - **Rank 4** — appears when zoomed to a single campus (Livingston,
    Busch, College Ave, Cook, Douglass).
  - **Rank 3** — appears at part-of-campus zoom.
  - **Rank 2** — block level.
  - **Rank 1** — street level.
  - **Rank 0** — only when zoomed in tight on the building itself.
- Dot size scales with rank, so more prominent buildings read as larger
  even when both are visible.
- At close zoom, rank 3+ buildings switch from plain dots to labeled icon
  pills, colored by the building's primary category:
  - `academic` — blue
  - `housing` — purple
  - `athletics` — green
  - `dining` — orange
  - anything else — blue-grey
- Place markers sit below stops and buses in z-order, so tapping a stop
  that sits on top of a building always opens the stop.
- Places are cached on disk (AsyncStorage) keyed by version hash, so a
  cold start on an unchanged day never re-downloads the blob.

### Place detail

- Tap any building to open its detail panel.
- Shows the building name, category chips (title-cased), and coordinates.
- A full-width `Route Here` button starts the journey flow.

### Journey planner

- Given a starting position and a destination, plans a walking-and-bus
  itinerary using live ETA data.
- Supports two destination kinds:
  - **Stops** — routing to a specific stop (via `Route here →` on the
    arrivals panel).
  - **Points** — routing to a building coordinate (via `Route Here` on a
    place detail panel). The planner considers every stop within a
    5-minute walk of the destination, picks the fastest, and appends a
    final walk leg to the building.
- Supports three start kinds:
  - **Current location** — the user's GPS position.
  - **A specific stop** — picked from the start picker.
  - **A specific building** — also picked from the start picker.
- Live recomputation: whenever the live bus feed updates (every 30 s),
  the itinerary recomputes. If a bus leaves, arrives, or a better route
  appears, the plan updates in place.
- A `Max buses` toggle caps the number of bus legs (1, 2, or 3) so users
  can bias the planner toward simpler itineraries.
- Every leg is tappable:
  - **Bus legs** — fly the map to the bus and highlight it.
  - **Walk legs** — fly the map to the walk's destination and select it.
    If the destination is a stop, its marker highlights; if it's a
    building, the destination pin stays centered.
- Itinerary legs and headers wrap freely — long stop and building names
  are never truncated.

### Journey flow — place to destination

Tapping a building marker opens the place detail panel with a
`Route Here` button. The state machine then depends on whether a fresh
GPS fix is available:

- **Location available** → two-button panel:
  - `Route From Current Location` — proceeds straight to the journey.
  - `Route From Specific Location` — opens the start picker.
- **No location** → straight to the start picker.

The start picker has two sections (Stops, Buildings), a search field,
and shows the 20 most relevant of each by default. Tapping a row produces
a `StartPoint` and transitions to the journey.

### Stale-location dialog

- The app refuses to plan a journey from a GPS fix older than 60 seconds
  without explicit confirmation.
- When triggered, an alert appears: "Use last known location?" with
  Cancel and Use last fix options.
- Choosing "Use last fix" overrides the freshness gate for the lifetime
  of that journey. The override resets automatically when a fresh fix
  arrives or when the journey closes.

### Search

- Floating 🔍 button opens a bottom-sheet search panel.
- Two sections: Stops and Buildings.
- Empty query shows the 8 most prominent stops and the 12 highest-ranked
  buildings by default.
- Typed queries filter both sections; buildings are ranked by a substring
  match score (exact > prefix > substring, with labelRank as a
  tiebreaker).
- Tapping a stop flies the map there and opens its arrivals panel.
- Tapping a building flies the map there and auto-opens its detail panel.

### User location

- Custom blue-dot marker (two nested circles) replaces the OS default.
- The system's built-in my-location button is hidden; a custom
  recenter button appears at the bottom-right instead.
- GPS fixes are filtered by accuracy: fixes worse than 100 m are
  discarded, so a cell-tower-only fix never moves the dot.
- On bootstrap, the hook tries in order:
  1. A cached fix less than 3 minutes old (instant appearance).
  2. A fresh fix raced against a 15-second timeout.
  3. A live watch that runs regardless of whether the earlier steps
     succeeded.
- The watch pauses automatically when the app backgrounds and resumes on
  foreground, so location updates never run while the screen is off.

### Clock correction

- Every live response from the backend carries a `serverNow` field. The
  app computes a clock offset once per snapshot and uses it for every
  ETA calculation, so a device with a skewed clock still shows correct
  countdowns.

### Data cadences

- **Static routes** — fetched once at cold start, then re-polled every
  31 minutes. The version pointer is checked first; the full blob is only
  downloaded if the hash changed.
- **Live buses** — polled every 30 seconds while foregrounded, paused
  in background.
- **Buildings** — fetched once at cold start. The pointer is checked,
  the blob is read from AsyncStorage if cached, or fetched from the API
  if not. No timer.

### Marker interaction

- Marker taps and map taps are distinguished via a 300 ms guard so
  tapping a marker doesn't accidentally clear the selection.
- Tapping empty map space closes any open panel except an in-progress
  journey, so the user can still pan and zoom while looking at an
  itinerary.

## Architecture highlights

- **All network calls go through one function.** `components/api/client.ts`
  is the only place `fetch` appears. Every endpoint adds timeouts, error
  normalization, and abort signal propagation through the same code path.
- **The journey planner is pure.** `components/Location_Suite/` has no
  React, no fetching, and never reads the clock. It takes explicit inputs
  and returns plain data. This makes it testable by reasoning alone and
  easy to swap for a future server-side implementation.
- **One hook drives every journey.** `useItinerary` handles both stop and
  point destinations, resolves start positions at compute time, and
  recomputes automatically when the live bus feed changes. The journey
  panel is purely presentational.
- **The place flow is a state machine.** `placeScreenReducer.ts` is a
  pure reducer; every panel transition is a single action. Mutual
  exclusion with other panels is enforced in one place.
- **Data tiers are separate.** Live buses update every 30 s, static
  routes every 31 min, buildings once per cold start. They never
  interfere with each other and each has its own caching strategy.

## Prerequisites

- Node.js 20+
- iOS Simulator (Xcode) or Android Emulator, or Expo Go on a physical
  device
- A running [Knightline](https://github.com/<you>/knightline) backend

## Quick start

    git clone https://github.com/<you>/knightline-app.git
    cd knightline-app
    npm install
    npx expo start

Press `i` for iOS Simulator, `a` for Android Emulator, or scan the QR
code with Expo Go.

## Project structure

    knightline-app/
    ├── App.tsx                    Entry point — splash / welcome / map
    ├── app.json                   Expo config
    ├── index.ts                   RN registration
    │
    ├── components/
    │   ├── api/                   Knightline client (fetch + endpoints)
    │   │   ├── client.ts          The only place fetch appears
    │   │   ├── config.ts          API_BASE per platform
    │   │   ├── types.ts           Response shapes
    │   │   ├── live.ts            Live bus endpoints
    │   │   ├── static.ts          Route / stop / street endpoints
    │   │   ├── history.ts         Previous-window endpoints
    │   │   ├── places.ts          Building endpoints
    │   │   ├── places-search.ts   Pure substring search
    │   │   └── index.ts           Barrel export
    │   │
    │   ├── storage/
    │   │   └── placesCache.ts     AsyncStorage cache for places blobs
    │   │
    │   ├── Location_Suite/        Pure journey-planning logic
    │   │   ├── shared.ts          Constants, distance math, stop identity
    │   │   ├── stop-distance.ts   "Which stops are near me?"
    │   │   ├── boarding.ts        "Which bus should I catch?"
    │   │   └── journey-planner.ts Dijkstra over stops + points
    │   │
    │   └── utils/
    │       ├── bus-activity.ts    Idle bus detection
    │       ├── firstTime.ts       Onboarding flag
    │       └── types.ts           Shared types
    │
    ├── hooks/
    │   ├── useUserLocation.ts     GPS watch with accuracy + freshness gate
    │   └── useItinerary.ts        Wraps the Location Suite for React
    │
    ├── screens/
    │   └── Map/
    │       ├── Map_Parent.tsx     The main screen
    │       ├── StableMarker.tsx   Stop marker with pie/solid modes
    │       ├── MultiColorPin.tsx  Pie-glyph stop marker
    │       ├── JourneyPanel.tsx   Itinerary renderer
    │       ├── MapSearchPanel.tsx Search sheet
    │       ├── PlaceDotMarker.tsx Small building dot
    │       ├── PlaceIconMarker.tsx Labeled building pill
    │       ├── PlaceDestinationMarker.tsx Red pin during journey
    │       ├── PlaceDetailPanel.tsx     Building detail
    │       ├── PlaceChooseStartPanel.tsx Current vs. specific start
    │       ├── PlaceStartPickerPanel.tsx Start point picker
    │       ├── placeScreenReducer.ts     Place-flow state machine
    │       └── placeCategoryColor.ts     Building color mapping
    │
    └── scripts/
        ├── sim-location.sh        One-shot simulator location setter
        └── sim-location-stream.sh Streaming simulator location

## How the journey planner works

Given a starting position and a destination (stop or coordinate), the app
runs a time-expanded Dijkstra over a graph of `(stop, busesUsed)` states.

- **Edges:** initial-walk (start → nearby stop), walk (stop → stop), bus
  (board → alight on a live bus's route).
- **Feasibility:** a bus can only be boarded if the user arrives at least
  30 seconds before its predicted arrival.
- **Cost:** `arrivalTime + transferPenalty × busesUsed`, so the planner
  prefers simple itineraries while still finding fast ones.
- **Point destinations:** when routing to a building, the planner
  considers every stop within 5 minutes' walk of the target, picks the
  fastest, and appends a final walk leg.
- **Loop-aware:** remaining stops per bus are sorted by ETA ascending, so
  wrap-around on a loop route is handled correctly (route-list order
  would not).
- **Duplicate-visit routes are rejected.** Routes that serve the same
  physical stop twice on one loop can't be safely planned against because
  the ETA data is keyed by stop name, not by visit index.

All of this is pure TypeScript in `components/Location_Suite/` — no React,
no fetching, no clock reads.

## Simulator location

The iOS Simulator has no GPS by default. Two scripts are provided.

**One-shot — set a Rutgers landmark:**

    ./scripts/sim-location.sh                    # random campus point
    ./scripts/sim-location.sh 40.505,-74.448     # explicit coordinate

**Streaming — keep the fix fresh:**

    ./scripts/sim-location-stream.sh             # default: College Ave, 5s

`xcrun simctl location set` is one-shot — the OS emits a single fix, then
goes silent. A stationary device produces no further location events, so
the app's 60-second freshness gate will eventually treat the fix as stale.
The streaming script writes a new (slightly offset) coordinate on a timer,
so `watchPositionAsync` keeps firing and routing stays enabled.

Run it in a separate terminal from Metro. Ctrl+C stops it.

Physical devices use their own GPS — no script needed.

## Troubleshooting

**The blue dot never appears.**
Check the Metro console for `[useUserLocation] accepting fix`. If you see
`discarding coarse fix`, run `sim-location-stream.sh`. If you see no log
line at all, confirm the Simulator is booted (`xcrun simctl list devices
booted`) and that location permissions were granted on first launch.

**"Location is out of date" when routing.**
The app refuses to plan journeys from a GPS fix older than 60 seconds
without confirming. On a stationary simulator this triggers regularly.
Either run `./scripts/sim-location-stream.sh` or tap "Use last fix" in the
dialog.

**No buses on the map.**
The bus layer needs the backend's `/v1/live` endpoint. Confirm the backend
is running (`curl localhost:3000/v1/health`) and that live data exists
(`redis-cli exists bus:live:current`). Check `API_BASE` in
`components/api/config.ts`.

**Buildings don't appear at any zoom.**
Three conditions: places loaded (`curl localhost:3000/v1/places | jq
.count`), zoomed in far enough (default view shows only rank-5 places;
zoom past `latitudeDelta: 0.012` for rank 4, `0.006` for rank 3), and not
mid-journey (the layer hides while an itinerary is open).

**Journey planner says "No route found."**
The planner only routes through stops that have a live ETA. TripShot's
prediction depth is limited, so sparsely-arriving routes may not be
plannable at all times of day. Try increasing `Max buses` in the panel,
or pick a different destination.

**Search result doesn't open the right panel.**
Search results for stops open the arrivals panel; results for buildings
open the place detail panel. If neither opens, the result is a stop
without a location (rare) — the map flies there but no panel is shown.

**Network errors on Android Emulator.**
The emulator reaches the host via `10.0.2.2`, not `localhost`.
`config.ts` handles this automatically. For a physical Android device, set
`LAN_IP` to your Mac's LAN address (`ipconfig getifaddr en0`).

## Related projects

- [Knightline](https://github.com/<you>/knightline) — the backend API this
  app consumes. Scrapes TripShot and Rutgers Campus Maps, stores in Redis,
  serves over Fastify.

## License

[MIT](LICENSE)

## Disclaimer

Unofficial project. Not affiliated with Rutgers University or TripShot.
The backend this app depends on scrapes publicly accessible data from the
Rutgers TripShot web app and Rutgers Campus Maps.