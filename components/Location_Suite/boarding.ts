import type { LatLng, Bus, Stop, RouteDefinition } from '../api';
import {
  BOARD_BUFFER_SEC,
  lookupEta,
  isFutureEta,
  routeHasDuplicateStops,
  stopKey,
  walkSeconds,
  type BoardingOption,
} from './shared';

export type FindBestBoardingOpts = {
  maxWalkSeconds?: number;
  boardBufferSec?: number;
};

/**
 * Find the best (stop, bus) pair for boarding the given route.
 *
 * "Best" = minimum total time from now until the bus departs the stop.
 * Total time = walkSeconds + waitSeconds, where waitSeconds is the gap
 * between arriving at the stop and the bus arriving.
 *
 * Returns null when:
 *   - user has no position,
 *   - the route isn't in the blob,
 *   - the route has duplicate stop visits,
 *   - the route has no live buses,
 *   - no bus is feasible from any reachable stop.
 */
export function findBestBoardingForRoute(
  routeName: string,
  userPosition: LatLng | null,
  routeBlob: Record<string, RouteDefinition>,
  buses: Bus[],
  nowMs: number,
  opts: FindBestBoardingOpts = {},
): BoardingOption | null {
  if (!userPosition) return null;

  const route = routeBlob[routeName];
  if (!route) return null;
  if (routeHasDuplicateStops(route)) return null;

  const maxWalk = opts.maxWalkSeconds ?? Infinity;
  const bufferMs = (opts.boardBufferSec ?? BOARD_BUFFER_SEC) * 1000;

  const routeBuses = buses.filter((b) => b.route === routeName);
  if (routeBuses.length === 0) return null;

  const servedByByKey = buildServedByMap(routeBlob);

  let best: BoardingOption | null = null;

  for (const stop of route.stops ?? []) {
    if (!stop.location) continue;

    const walkSec = walkSeconds(userPosition, stop.location);
    if (walkSec > maxWalk) continue;

    const tWalkEnd = nowMs + walkSec * 1000;
    const stopServedBy = servedByByKey.get(stopKey(stop)) ?? [routeName];

    for (const bus of routeBuses) {
      const eta = lookupEta(bus, stop);
      if (!isFutureEta(eta, nowMs)) continue;

      const tBoard = Date.parse(eta!.etaISO);
      if (tBoard - tWalkEnd < bufferMs) continue;

      const waitSec = (tBoard - tWalkEnd) / 1000;
      const totalSec = walkSec + waitSec;

      if (!best || totalSec < best.totalSeconds) {
        best = {
          stop,
          bus,
          walkSeconds: walkSec,
          waitSeconds: waitSec,
          totalSeconds: totalSec,
          servedBy: stopServedBy,
        };
      }
    }
  }

  return best;
}

function buildServedByMap(
  routeBlob: Record<string, RouteDefinition>,
): Map<string, string[]> {
  const acc = new Map<string, Set<string>>();
  for (const [routeName, route] of Object.entries(routeBlob)) {
    for (const stop of route.stops ?? []) {
      const k = stopKey(stop);
      let s = acc.get(k);
      if (!s) {
        s = new Set();
        acc.set(k, s);
      }
      s.add(routeName);
    }
  }
  const out = new Map<string, string[]>();
  for (const [k, s] of acc) out.set(k, [...s].sort());
  return out;
}