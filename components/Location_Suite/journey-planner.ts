import type { LatLng, Bus, Stop, RouteDefinition } from '../api';
import {
  BOARD_BUFFER_SEC,
  TRANSFER_PENALTY_SEC,
  stopKey,
  walkSeconds,
  remainingStopsForBus,
  routeHasDuplicateStops,
  type Leg,
  type Itinerary,
  type WalkEndpoint,
} from './shared';

export type { Leg, Itinerary, WalkEndpoint } from './shared';

export type FindFastestRouteOpts = {
  maxBuses?: number;
  maxInitialWalkSec?: number;
  maxTransferWalkSec?: number;
  boardBufferSec?: number;
  transferPenaltySec?: number;
  allowWalkingToDestination?: boolean;
};

export type FindFastestRouteToStopsOpts = FindFastestRouteOpts & {
  orderMode?: 'any' | 'sequence';
};

export function findFastestRouteToStop(
  destinationKey: string,
  fromLocation: LatLng,
  routeBlob: Record<string, RouteDefinition>,
  buses: Bus[],
  startTimeMs: number,
  opts: FindFastestRouteOpts = {},
): Itinerary | null {
  return dijkstra(
    new Set([destinationKey]),
    fromLocation,
    null,
    routeBlob,
    buses,
    startTimeMs,
    opts,
  );
}

export function findFastestRouteToStops(
  destinationKeys: string[],
  fromLocation: LatLng,
  routeBlob: Record<string, RouteDefinition>,
  buses: Bus[],
  startTimeMs: number,
  opts: FindFastestRouteToStopsOpts = {},
): Itinerary | null {
  if (destinationKeys.length === 0) return null;

  if ((opts.orderMode ?? 'any') === 'any') {
    return dijkstra(
      new Set(destinationKeys),
      fromLocation,
      null,
      routeBlob,
      buses,
      startTimeMs,
      opts,
    );
  }

  const allLegs: Leg[] = [];
  let cursorLocation = fromLocation;
  let cursorStop: Stop | null = null;
  let cursorTimeMs = startTimeMs;

  const stopIndex = buildStopIndex(routeBlob);
  for (const destKey of destinationKeys) {
    const leg = dijkstra(
      new Set([destKey]),
      cursorLocation,
      cursorStop,
      routeBlob,
      buses,
      cursorTimeMs,
      opts,
    );
    if (!leg) return null;

    allLegs.push(...leg.legs);
    cursorTimeMs += leg.totalSeconds * 1000;
    cursorLocation = stopIndex.get(destKey)?.location ?? cursorLocation;
    cursorStop = stopIndex.get(destKey) ?? null;
  }

  return {
    legs: allLegs,
    totalSeconds: (cursorTimeMs - startTimeMs) / 1000,
  };
}

export type FindFastestRouteToPointOpts = FindFastestRouteOpts & {
  maxFinalWalkSec?: number;
  maxDirectWalkSec?: number;
};

function collectAllStops(
  routeBlob: Record<string, RouteDefinition>,
): Array<{ stop: Stop; key: string }> {
  const seen = new Map<string, { stop: Stop; key: string }>();
  for (const route of Object.values(routeBlob)) {
    for (const stop of route.stops ?? []) {
      const k = stopKey(stop);
      if (!seen.has(k)) seen.set(k, { stop, key: k });
    }
  }
  return Array.from(seen.values());
}

function mergeAdjacentWalkLegs(legs: Leg[]): Leg[] {
  const out: Leg[] = [];
  for (const leg of legs) {
    const prev = out[out.length - 1];
    if (leg.kind === 'walk' && prev && prev.kind === 'walk') {
      out[out.length - 1] = {
        kind: 'walk',
        from: prev.from,
        to: leg.to,
        seconds: prev.seconds + leg.seconds,
      };
    } else {
      out.push(leg);
    }
  }
  return out;
}

export function findFastestRouteToPoint(
  target: LatLng,
  fromLocation: LatLng,
  routeBlob: Record<string, RouteDefinition>,
  buses: Bus[],
  startTimeMs: number,
  opts: FindFastestRouteToPointOpts = {},
): Itinerary | null {
  const maxFinalWalkSec = opts.maxFinalWalkSec ?? 5 * 60;
  const maxDirectWalkSec = opts.maxDirectWalkSec ?? 20 * 60;

  const endStops: Array<{ stop: Stop; key: string; walkSec: number }> = [];
  for (const { stop, key } of collectAllStops(routeBlob)) {
    if (!stop.location) continue;
    const w = walkSeconds(stop.location, target);
    if (w <= maxFinalWalkSec) endStops.push({ stop, key, walkSec: w });
  }

  let best: Itinerary | null = null;

  const directWalkSec = walkSeconds(fromLocation, target);
  if (directWalkSec <= maxDirectWalkSec) {
    best = {
      legs: [
        {
          kind: 'walk',
          from: { kind: 'point', location: fromLocation },
          to: { kind: 'point', location: { lat: target.lat, lng: target.lng } },
          seconds: directWalkSec,
        },
      ],
      totalSeconds: directWalkSec,
    };
  }

  for (const { stop, key, walkSec } of endStops) {
    const itin = findFastestRouteToStop(
      key,
      fromLocation,
      routeBlob,
      buses,
      startTimeMs,
      opts,
    );
    if (!itin) continue;

    const total = itin.totalSeconds + walkSec;
    if (best && total >= best.totalSeconds) continue;

    best = {
      legs: [
        ...itin.legs,
        {
          kind: 'walk',
          from: { kind: 'stop', stop },
          to: { kind: 'point', location: { lat: target.lat, lng: target.lng } },
          seconds: walkSec,
        },
      ],
      totalSeconds: total,
    };
  }

  if (!best) return null;
  return { ...best, legs: mergeAdjacentWalkLegs(best.legs) };
}

type StateKey = string;

type State = {
  stopKey: string;
  busesUsed: number;
  arrivalMs: number;
  cost: number;
  predecessorKey: StateKey | null;
  predecessorEdge: Edge | null;
  finalized: boolean;
};

type Edge =
  | { kind: 'initial-walk'; from: LatLng; fromStop: Stop | null; to: Stop; seconds: number }
  | { kind: 'walk'; from: Stop; to: Stop; seconds: number }
  | {
      kind: 'bus';
      routeName: string;
      busName: string;
      boardAt: Stop;
      alightAt: Stop;
      boardTimeMs: number;
      alightTimeMs: number;
      seconds: number;
    };

type BusRemainingEntry = {
  stop: Stop;
  tBoard: number;
  stopKey: string;
};

type BusAtStopEntry = {
  bus: Bus;
  routeName: string;
  remaining: BusRemainingEntry[];
  indexAtStop: number;
};

const START_SENTINEL = '__start__';

function dijkstra(
  destinationKeys: Set<string>,
  fromLocation: LatLng,
  fromStop: Stop | null,
  routeBlob: Record<string, RouteDefinition>,
  buses: Bus[],
  startTimeMs: number,
  opts: FindFastestRouteOpts,
): Itinerary | null {
  const maxBuses = opts.maxBuses ?? 1;
  const maxInitialWalkSec = opts.maxInitialWalkSec ?? 20 * 60;
  const maxTransferWalkSec = opts.maxTransferWalkSec ?? 5 * 60;
  const bufferMs = (opts.boardBufferSec ?? BOARD_BUFFER_SEC) * 1000;
  const penaltyMs = (opts.transferPenaltySec ?? TRANSFER_PENALTY_SEC) * 1000;
  const allowWalkDest = opts.allowWalkingToDestination !== false;

  const stopIndex = buildStopIndex(routeBlob);
  for (const key of destinationKeys) {
    if (!stopIndex.has(key)) return null;
  }

  const busRemaining = new Map<Bus, BusRemainingEntry[]>();
  const busesAtStop = new Map<string, BusAtStopEntry[]>();

  for (const bus of buses) {
    const route = routeBlob[bus.route];
    if (!route) continue;
    if (routeHasDuplicateStops(route)) continue;

    const remaining = remainingStopsForBus(bus, route, startTimeMs);
    if (remaining.length === 0) continue;
    busRemaining.set(bus, remaining);

    for (let i = 0; i < remaining.length; i++) {
      const key = remaining[i].stopKey;
      let arr = busesAtStop.get(key);
      if (!arr) {
        arr = [];
        busesAtStop.set(key, arr);
      }
      arr.push({
        bus,
        routeName: bus.route,
        remaining,
        indexAtStop: i,
      });
    }
  }

  const walkNeighbors = new Map<
    string,
    Array<{ key: string; stop: Stop; seconds: number }>
  >();
  const allStops: Array<{ key: string; stop: Stop }> = [];
  for (const [key, stop] of stopIndex) {
    if (stop.location) allStops.push({ key, stop });
  }
  for (const a of allStops) {
    const neighbors: Array<{ key: string; stop: Stop; seconds: number }> = [];
    for (const b of allStops) {
      if (a.key === b.key) continue;
      const ws = walkSeconds(a.stop.location!, b.stop.location!);
      if (ws <= maxTransferWalkSec) {
        neighbors.push({ key: b.key, stop: b.stop, seconds: ws });
      }
    }
    walkNeighbors.set(a.key, neighbors);
  }

  const states = new Map<StateKey, State>();
  const pq = new MinHeap<StateKey>();

  function relax(
    key: StateKey,
    stopKeyVal: string,
    busesUsed: number,
    arrivalMs: number,
    cost: number,
    predKey: StateKey,
    edge: Edge,
  ): void {
    const existing = states.get(key);
    if (existing && (existing.finalized || existing.cost <= cost)) return;
    states.set(key, {
      stopKey: stopKeyVal,
      busesUsed,
      arrivalMs,
      cost,
      predecessorKey: predKey,
      predecessorEdge: edge,
      finalized: false,
    });
    pq.push(key, cost);
  }

  for (const [key, stop] of stopIndex) {
    if (!stop.location) continue;
    const ws = walkSeconds(fromLocation, stop.location);
    if (ws > maxInitialWalkSec) continue;

    const edge: Edge = {
      kind: 'initial-walk',
      from: fromLocation,
      fromStop,
      to: stop,
      seconds: ws,
    };
    const arrivalMs = startTimeMs + ws * 1000;
    relax(stateKey(key, 0), key, 0, arrivalMs, arrivalMs, START_SENTINEL, edge);
  }

  let bestGoal: { stateKey: StateKey; arrivalMs: number } | null = null;

  while (pq.size > 0) {
    const popped = pq.pop()!;
    const key = popped.value;
    const state = states.get(key)!;

    if (state.finalized) continue;
    if (state.cost !== popped.key) continue;
    state.finalized = true;

    if (destinationKeys.has(state.stopKey)) {
      if (
        allowWalkDest ||
        state.busesUsed > 0 ||
        state.stopKey === state.stopKey
      ) {
        if (!bestGoal || state.arrivalMs < bestGoal.arrivalMs) {
          bestGoal = { stateKey: key, arrivalMs: state.arrivalMs };
        }
      }
      continue;
    }

    const atStopEntries = busesAtStop.get(state.stopKey);
    if (atStopEntries && state.busesUsed < maxBuses) {
      for (const entry of atStopEntries) {
        const { bus, routeName, remaining, indexAtStop } = entry;
        const boardEntry = remaining[indexAtStop];
        if (boardEntry.tBoard - state.arrivalMs < bufferMs) continue;

        const extraPenalty = state.busesUsed > 0 ? penaltyMs : 0;
        const newBusesUsed = state.busesUsed + 1;

        for (let i = indexAtStop + 1; i < remaining.length; i++) {
          const downstream = remaining[i];
          if (downstream.tBoard < boardEntry.tBoard) continue;

          const newArrivalMs = downstream.tBoard;
          const newCost =
            state.cost + (newArrivalMs - state.arrivalMs) + extraPenalty;
          const newKey = stateKey(downstream.stopKey, newBusesUsed);

          const edge: Edge = {
            kind: 'bus',
            routeName,
            busName: bus.name,
            boardAt: boardEntry.stop,
            alightAt: downstream.stop,
            boardTimeMs: boardEntry.tBoard,
            alightTimeMs: downstream.tBoard,
            seconds: (downstream.tBoard - boardEntry.tBoard) / 1000,
          };

          relax(
            newKey,
            downstream.stopKey,
            newBusesUsed,
            newArrivalMs,
            newCost,
            key,
            edge,
          );
        }
      }
    }

    const neighbors = walkNeighbors.get(state.stopKey);
    if (neighbors) {
      for (const n of neighbors) {
        const newArrivalMs = state.arrivalMs + n.seconds * 1000;
        const newCost = state.cost + n.seconds * 1000;
        const newKey = stateKey(n.key, state.busesUsed);

        const edge: Edge = {
          kind: 'walk',
          from: stopIndex.get(state.stopKey)!,
          to: n.stop,
          seconds: n.seconds,
        };

        relax(
          newKey,
          n.key,
          state.busesUsed,
          newArrivalMs,
          newCost,
          key,
          edge,
        );
      }
    }
  }

  if (!bestGoal) return null;

  const edges = reconstructEdges(bestGoal.stateKey, states);
  const legs = edges.map(edgeToLeg);
  const totalSeconds = (bestGoal.arrivalMs - startTimeMs) / 1000;

  return { legs, totalSeconds };
}

function stateKey(stopKeyVal: string, busesUsed: number): StateKey {
  return `${stopKeyVal}|${busesUsed}`;
}

function buildStopIndex(
  routeBlob: Record<string, RouteDefinition>,
): Map<string, Stop> {
  const map = new Map<string, Stop>();
  for (const route of Object.values(routeBlob)) {
    for (const stop of route.stops ?? []) {
      const k = stopKey(stop);
      if (!map.has(k)) map.set(k, stop);
    }
  }
  return map;
}

function reconstructEdges(
  goalKey: StateKey,
  states: Map<StateKey, State>,
): Edge[] {
  const edges: Edge[] = [];
  let cur: StateKey | null = goalKey;
  while (cur && cur !== START_SENTINEL) {
    const s = states.get(cur);
    if (!s || !s.predecessorEdge) break;
    edges.push(s.predecessorEdge);
    cur = s.predecessorKey;
  }
  edges.reverse();
  return edges;
}

function edgeToLeg(edge: Edge): Leg {
  if (edge.kind === 'initial-walk') {
    const from: WalkEndpoint = edge.fromStop
      ? { kind: 'stop', stop: edge.fromStop }
      : { kind: 'point', location: edge.from };
    return {
      kind: 'walk',
      from,
      to: { kind: 'stop', stop: edge.to },
      seconds: edge.seconds,
    };
  }
  if (edge.kind === 'walk') {
    return {
      kind: 'walk',
      from: { kind: 'stop', stop: edge.from },
      to: { kind: 'stop', stop: edge.to },
      seconds: edge.seconds,
    };
  }
  return {
    kind: 'bus',
    routeName: edge.routeName,
    busName: edge.busName,
    boardAt: edge.boardAt,
    alightAt: edge.alightAt,
    boardTime: edge.boardTimeMs,
    alightTime: edge.alightTimeMs,
    seconds: edge.seconds,
  };
}

class MinHeap<T> {
  private heap: Array<{ key: number; value: T }> = [];

  get size(): number {
    return this.heap.length;
  }

  push(value: T, key: number): void {
    this.heap.push({ key, value });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { key: number; value: T } | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].key <= this.heap[i].key) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let smallest = i;
      if (l < n && this.heap[l].key < this.heap[smallest].key) smallest = l;
      if (r < n && this.heap[r].key < this.heap[smallest].key) smallest = r;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}