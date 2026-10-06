import { useMemo } from 'react';
import type {
  Bus,
  LatLng,
  Place,
  RouteDefinition,
  Stop,
} from '../components/api';
import {
  findFastestRouteToStop,
  findFastestRouteToPoint,
  type FindFastestRouteOpts,
  type Itinerary,
} from '../components/Location_Suite/journey-planner';

export type StartPoint =
  | { kind: 'current' }
  | { kind: 'stop'; stop: Stop }
  | { kind: 'place'; placeId: string };

export type ItineraryDestination =
  | { kind: 'stop'; stopKey: string }
  | { kind: 'point'; lat: number; lng: number; label: string };

export type UseItineraryError =
  | 'no-route'
  | 'stale-location'
  | 'invalid-start'
  | null;

export type UseItineraryArgs = {
  from: StartPoint | null;
  to: ItineraryDestination | null;
  routeBlob: Record<string, RouteDefinition>;
  places: Place[];
  buses: Bus[];
  clockOffsetMs: number;
  maxBuses: number;
  userPosition: LatLng | null;
  userLocationStatus: 'undetermined' | 'granted' | 'denied' | 'unavailable';
  userLastFixAt: number | null;
  allowStale?: boolean;
  opts?: FindFastestRouteOpts;
};

export type UseItineraryResult = {
  itinerary: Itinerary | null;
  error: UseItineraryError;
};

const LOCATION_FRESHNESS_MS = 60_000;

type ResolveOk = { ok: true; location: LatLng };
type ResolveErr = { ok: false; error: 'stale-location' | 'invalid-start' };
type ResolveResult = ResolveOk | ResolveErr;

function resolveStart(
  from: StartPoint,
  args: Pick<
    UseItineraryArgs,
    | 'places'
    | 'userPosition'
    | 'userLocationStatus'
    | 'userLastFixAt'
    | 'allowStale'
  >,
  nowMs: number,
): ResolveResult {
  if (from.kind === 'current') {
    if (args.userLocationStatus !== 'granted') {
      return { ok: false, error: 'stale-location' };
    }
    if (!args.userPosition || args.userLastFixAt == null) {
      return { ok: false, error: 'stale-location' };
    }
    const isStale = nowMs - args.userLastFixAt > LOCATION_FRESHNESS_MS;
    if (isStale && !args.allowStale) {
      return { ok: false, error: 'stale-location' };
    }
    return { ok: true, location: args.userPosition };
  }

  if (from.kind === 'stop') {
    if (!from.stop.location) return { ok: false, error: 'invalid-start' };
    return { ok: true, location: from.stop.location };
  }

  const found = args.places.find((p) => p.id === from.placeId);
  if (!found) return { ok: false, error: 'invalid-start' };
  return { ok: true, location: { lat: found.lat, lng: found.lng } };
}

export function useItinerary(args: UseItineraryArgs): UseItineraryResult {
  const {
    from,
    to,
    routeBlob,
    places,
    buses,
    clockOffsetMs,
    maxBuses,
    userPosition,
    userLocationStatus,
    userLastFixAt,
    allowStale,
    opts,
  } = args;

  return useMemo<UseItineraryResult>(() => {
    if (!from || !to) return { itinerary: null, error: null };

    const nowMs = Date.now() + clockOffsetMs;
    const resolved = resolveStart(
      from,
      {
        places,
        userPosition,
        userLocationStatus,
        userLastFixAt,
        allowStale,
      },
      nowMs,
    );
    if (!resolved.ok) return { itinerary: null, error: resolved.error };

    const plannerOpts: FindFastestRouteOpts = { ...(opts ?? {}), maxBuses };

    const itinerary =
      to.kind === 'stop'
        ? findFastestRouteToStop(
            to.stopKey,
            resolved.location,
            routeBlob,
            buses,
            nowMs,
            plannerOpts,
          )
        : findFastestRouteToPoint(
            { lat: to.lat, lng: to.lng },
            resolved.location,
            routeBlob,
            buses,
            nowMs,
            plannerOpts,
          );

    return {
      itinerary,
      error: itinerary ? null : 'no-route',
    };
  }, [
    from,
    to,
    routeBlob,
    places,
    buses,
    clockOffsetMs,
    maxBuses,
    userPosition,
    userLocationStatus,
    userLastFixAt,
    allowStale,
    opts,
  ]);
}