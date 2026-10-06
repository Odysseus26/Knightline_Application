/**
 * stop-distance.ts
 *
 * "Which stops are near me?" Two flavours:
 *
 *   - findClosestStopsToUser:       nearest stops across a given set
 *   - findClosestStopsOnRoutes:     nearest stops restricted to a list
 *                                   of routes (which may or may not match
 *                                   the routes currently enabled on the
 *                                   map — the caller decides)
 */

import type { LatLng, Stop, RouteDefinition } from '../api';
import {
  haversineMeters,
  walkMeters,
  walkSeconds,
  stopKey,
  type ClosestStop,
  type ClosestStopWithRoutes,
} from './shared';


export type FindClosestStopsOpts = {
  maxDistanceMeters?: number;
};


export function findClosestStopsToUser(
  userPosition: LatLng | null,
  stops: Stop[],
  limit: number,
  opts: FindClosestStopsOpts = {},
): ClosestStop[] {
  if (!userPosition) return [];
  const { maxDistanceMeters } = opts;

  const scored: Array<{ stop: Stop; straightLineMeters: number }> = [];
  for (const stop of stops) {
    if (!stop.location) continue;
    const d = haversineMeters(userPosition, stop.location);
    if (maxDistanceMeters != null && d > maxDistanceMeters) continue;
    scored.push({ stop, straightLineMeters: d });
  }

  scored.sort((a, b) => a.straightLineMeters - b.straightLineMeters);
  const top = scored.slice(0, Math.max(0, limit));

  return top.map(({ stop, straightLineMeters }) => {
    const wm = walkMeters(userPosition, stop.location!);
    return {
      stop,
      straightLineMeters,
      walkMeters: wm,
      walkSeconds: wm / 1.4, // WALK_SPEED_MPS applied 
    };
  });
}


export type FindClosestStopsOnRoutesOpts = {
  maxDistanceMeters?: number;
};

export function findClosestStopsOnRoutes(
  userPosition: LatLng | null,
  routeNames: string[],
  routeBlob: Record<string, RouteDefinition>,
  limit: number,
  opts: FindClosestStopsOnRoutesOpts = {},
): ClosestStopWithRoutes[] {
  if (!userPosition) return [];
  const { maxDistanceMeters } = opts;

  const byKey = new Map<string, { stop: Stop; servedBy: Set<string> }>();
  for (const routeName of routeNames) {
    const route = routeBlob[routeName];
    if (!route) continue;
    for (const stop of route.stops ?? []) {
      const k = stopKey(stop);
      const existing = byKey.get(k);
      if (existing) {
        existing.servedBy.add(routeName);
      } else {
        byKey.set(k, { stop, servedBy: new Set([routeName]) });
      }
    }
  }

  const scored: ClosestStopWithRoutes[] = [];
  for (const { stop, servedBy } of byKey.values()) {
    if (!stop.location) continue;
    const d = haversineMeters(userPosition, stop.location);
    if (maxDistanceMeters != null && d > maxDistanceMeters) continue;
    const wm = walkMeters(userPosition, stop.location);
    scored.push({
      stop,
      straightLineMeters: d,
      walkMeters: wm,
      walkSeconds: wm / 1.4,
      servedBy: [...servedBy].sort(),
    });
  }

  scored.sort((a, b) => a.straightLineMeters - b.straightLineMeters);
  return scored.slice(0, Math.max(0, limit));
}