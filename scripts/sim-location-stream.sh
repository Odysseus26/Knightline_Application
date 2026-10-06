#!/usr/bin/env bash
#
# sim-location-stream.sh — continuously update the booted iOS Simulator.
#
# Background: `xcrun simctl location set` is a one-shot write. The OS emits
# exactly one fix, then goes silent. A stationary device produces no further
# CoreLocation events, so an app whose watch uses distanceInterval > 0 sees
# one fix and nothing more.
#
# This script writes a new (slightly offset) coordinate on a timer, so the
# watch fires repeatedly and the freshness check in the app sees an
# up-to-date fix.
#
# Usage:
#   ./scripts/sim-location-stream.sh                    # default landmark
#   ./scripts/sim-location-stream.sh 40.5,-74.45        # explicit base
#   ./scripts/sim-location-stream.sh 40.5,-74.45 3      # explicit + interval
#
# Ctrl+C to stop.

set -euo pipefail

BASE="${1:-40.5036,-74.4524}"    # default: College Ave Student Center
INTERVAL="${2:-5}"               # seconds between writes

BASE_LAT="${BASE%%,*}"
BASE_LNG="${BASE##*,}"

if ! [[ "$BASE_LAT" =~ ^-?[0-9]+(\.[0-9]+)?$ ]] || \
   ! [[ "$BASE_LNG" =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then
  echo "Invalid base coordinate: $BASE" >&2
  echo "Usage: $0 [lat,lng] [interval_seconds]" >&2
  exit 1
fi

# Random-walk state — starts at base, jitters from there.
LAT="$BASE_LAT"
LNG="$BASE_LNG"

# Bounding box half-width, in degrees. ~0.002° ≈ 220m lat / 170m lng at
# Rutgers latitude. The walk reflects off these bounds so it never drifts
# away from the neighborhood being tested.
BOX=0.002

trap 'echo; echo "Stopped."; exit 0' INT TERM

echo "Streaming location around $BASE_LAT, $BASE_LNG every ${INTERVAL}s."
echo "Press Ctrl+C to stop."
echo

# Advances the walk one tick. Magnitude ~0.0008° (~90m lat, ~65m lng) is
# comfortably above the client's distanceInterval of 10m, so every write
# produces a watch callback. Reflection keeps it bounded.
step() {
  LAT=$(awk -v v="$LAT" -v b="$BASE_LAT" -v box="$BOX" -v r=$RANDOM \
    'BEGIN {
       nv = v + (r / 32767 - 0.5) * 0.0008
       if (nv > b + box) nv = 2 * (b + box) - nv
       if (nv < b - box) nv = 2 * (b - box) - nv
       printf "%.6f", nv
     }')
  LNG=$(awk -v v="$LNG" -v b="$BASE_LNG" -v box="$BOX" -v r=$RANDOM \
    'BEGIN {
       nv = v + (r / 32767 - 0.5) * 0.0008
       if (nv > b + box) nv = 2 * (b + box) - nv
       if (nv < b - box) nv = 2 * (b - box) - nv
       printf "%.6f", nv
     }')
}

while true; do
  step
  if ! xcrun simctl location booted set "$LAT,$LNG" 2>/dev/null; then
    echo "Failed to set location — is the simulator booted?" >&2
    exit 1
  fi
  printf '\r  -> %s, %s   ' "$LAT" "$LNG"
  sleep "$INTERVAL"
done