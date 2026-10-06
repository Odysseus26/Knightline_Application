import type { LatLng, Bus, Stop, RouteDefinition } from '../api';

export const DETOUR_FACTOR = 1.3;

export const WALK_SPEED_MPS = 1.4;

export const BOARD_BUFFER_SEC = 30;

export const TRANSFER_PENALTY_SEC = 60;

export type BusEta = {
  etaISO: string;
  state: string;
  source?: string;
};

export type WalkEndpoint =
  | { kind: 'point'; location: LatLng }
  | { kind: 'stop'; stop: Stop };

export type Leg =
  | {
      kind: 'walk';
      from: WalkEndpoint;
      to: WalkEndpoint;
      seconds: number;
    }
  | {
      kind: 'bus';
      routeName: string;
      busName: string;
      boardAt: Stop;
      alightAt: Stop;
      boardTime: number;
      alightTime: number;
      seconds: number;
    };

export type Itinerary = {
  legs: Leg[];
  totalSeconds: number;
};

export type ClosestStop = {
  stop: Stop;
  straightLineMeters: number;
  walkMeters: number;
  walkSeconds: number;
};

export type ClosestStopWithRoutes = ClosestStop & {
  servedBy: string[];
};

export type BoardingOption = {
  stop: Stop;
  bus: Bus;
  walkSeconds: number;
  waitSeconds: number;
  totalSeconds: number;
  servedBy: string[];
};

const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function walkMeters(a: LatLng, b: LatLng): number {
  return haversineMeters(a, b) * DETOUR_FACTOR;
}

export function walkSeconds(a: LatLng, b: LatLng): number {
  return walkMeters(a, b) / WALK_SPEED_MPS;
}

function firstNonEmpty(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

export function stopKey(stop: Stop): string {
  return firstNonEmpty(stop.sharedStopId, stop.stopId, stop.gtfsId) ?? stop.name;
}

export function routeHasDuplicateStops(route: RouteDefinition): boolean {
  const seen = new Set<string>();
  for (const s of route.stops ?? []) {
    const k = stopKey(s);
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

export function lookupEta(bus: Bus, stop: Stop): BusEta | null {
  return (bus.etas?.[stop.name] as BusEta | undefined) ?? null;
}

export function isFutureEta(eta: BusEta | null, nowMs: number): boolean {
  if (!eta) return false;
  if (eta.state === 'Departed') return false;
  const t = Date.parse(eta.etaISO);
  if (!Number.isFinite(t)) return false;
  return t > nowMs;
}

export function remainingStopsForBus(
  bus: Bus,
  route: RouteDefinition,
  nowMs: number,
): Array<{ stop: Stop; tBoard: number; stopKey: string }> {
  const out: Array<{ stop: Stop; tBoard: number; stopKey: string }> = [];
  for (const stop of route.stops ?? []) {
    const eta = lookupEta(bus, stop);
    if (!isFutureEta(eta, nowMs)) continue;
    out.push({
      stop,
      tBoard: Date.parse(eta!.etaISO),
      stopKey: stopKey(stop),
    });
  }
  out.sort((a, b) => a.tBoard - b.tBoard);
  return out;
}