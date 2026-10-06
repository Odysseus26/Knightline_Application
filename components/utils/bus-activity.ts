/**
 * bus-activity.ts
 *
 * Determines whether a live bus is "idle" by comparing its current
 * position to its position in the previous live snapshot
 * (bus:live:old). A bus that has barely moved between snapshots is
 * parked, at a layover, or waiting at a stop.
 *
 * Pure. No clock reads, no fetching, no mutation.
 */

import type { Bus } from '../api';

export const IDLE_DISTANCE_THRESHOLD_M = 50;

const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

export function busId(bus: Bus): string {
  return `${bus.route}|${bus.name}`;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}


export function isBusIdle(
  current: Bus,
  old: Bus | null,
  thresholdMeters: number = IDLE_DISTANCE_THRESHOLD_M,
): boolean {
  if (!current.location) return false;
  if (!old || !old.location) return false;
  return haversineMeters(current.location, old.location) < thresholdMeters;
}


export function computeIdleBusIds(
  current: Bus[],
  old: Bus[],
  thresholdMeters: number = IDLE_DISTANCE_THRESHOLD_M,
): Set<string> {
  const oldById = new Map<string, Bus>();
  for (const b of old) {
    const id = busId(b);
    const existing = oldById.get(id);
    if (!existing) {
      oldById.set(id, b);
    } else {
      const a = existing.updatedAt ?? '';
      const c = b.updatedAt ?? '';
      if (c > a) oldById.set(id, b);
    }
  }

  const idleIds = new Set<string>();
  for (const cur of current) {
    if (!cur.location) continue;
    const prev = oldById.get(busId(cur)) ?? null;
    if (isBusIdle(cur, prev, thresholdMeters)) {
      idleIds.add(busId(cur));
    }
  }
  return idleIds;
}