#!/usr/bin/env bash
#
# sim-location.sh — set the booted iOS Simulator to a location.
#
# Usage:
#   ./scripts/sim-location.sh              # random Rutgers campus point
#   ./scripts/sim-location.sh --mac        # use the Mac's own location
#   ./scripts/sim-location.sh 40.5,-74.45  # explicit coordinate
#
# Requires: macOS, Xcode command line tools (xcrun).
# The Simulator must already be booted.

set -euo pipefail

# --- Rutgers campus landmarks ----------------------------------------------
# One per major stop so "random" actually lands somewhere realistic.
LANDMARKS=(
  "40.5036,-74.4524"   # College Ave Student Center
  "40.4996,-74.4482"   # The Yard
  "40.5039,-74.4488"   # SAC North
  "40.5240,-74.4366"   # Livingston Student Center
  "40.5238,-74.4583"   # Busch Student Center
  "40.5219,-74.4633"   # Hill Center
  "40.5186,-74.4599"   # Werblin Rec Center
)

# Small random offset (~50-100m) so successive runs don't land on the exact
# same coordinate, which is easier to eyeball when debugging.
jitter() {
  awk -v v="$1" -v r=$RANDOM \
    'BEGIN { printf "%.5f", v + (r / 32767 - 0.5) * 0.002 }'
}

# --- Pick a source coordinate ----------------------------------------------

case "${1:-campus}" in
  --mac)
    if command -v whereami >/dev/null 2>&1; then
      COORDS=$(whereami 2>/dev/null | head -n1)
      echo "Using Mac's own location: $COORDS"
    else
      echo "whereami not installed; using a random campus point instead."
      echo "To enable Mac location: brew install whereami"
      COORDS="${LANDMARKS[$((RANDOM % ${#LANDMARKS[@]}))]}"
    fi
    ;;
  campus|"")
    COORDS="${LANDMARKS[$((RANDOM % ${#LANDMARKS[@]}))]}"
    echo "Random Rutgers campus point."
    ;;
  *)
    COORDS="$1"
    echo "Using explicit coordinate: $COORDS"
    ;;
esac

# --- Jitter and send -------------------------------------------------------

LAT=$(jitter "${COORDS%%,*}")
LNG=$(jitter "${COORDS##*,}")

echo "  -> $LAT, $LNG"
xcrun simctl location booted set "$LAT,$LNG"
echo "Done. Reload the app to see the new position."