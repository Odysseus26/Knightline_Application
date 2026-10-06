import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
import decodePolyline from '@mapbox/polyline';

import { api, ApiError } from '../../components/api';
import type {
  Bus,
  RouteDefinition,
  Stop,
  GeometryStep,
  Place,
} from '../../components/api';
import { findClosestStopsOnRoutes } from '../../components/Location_Suite/stop-distance';
import { findBestBoardingForRoute } from '../../components/Location_Suite/boarding';
import { computeIdleBusIds } from '../../components/utils/bus-activity';
import { useUserLocation } from '../../hooks/useUserLocation';
import { useItinerary, type StartPoint } from '../../hooks/useItinerary';
import {
  readCachedPlaces,
  writeCachedPlaces,
} from '../../components/storage/placesCache';
import StableMarker from './StableMarker';
import JourneyPanel from './JourneyPanel';
import PlaceDotMarker from './PlaceDotMarker';
import PlaceIconMarker from './PlaceIconMarker';
import PlaceDestinationMarker from './PlaceDestinationMarker';
import PlaceDetailPanel from './PlaceDetailPanel';
import PlaceChooseStartPanel from './PlaceChooseStartPanel';
import PlaceStartPickerPanel from './PlaceStartPickerPanel';
import MapSearchPanel, { type SearchTarget } from './MapSearchPanel';
import { placeScreenReducer } from './placeScreenReducer';


const MAX_ARRIVALS = 6;
const MAX_NEARBY = 8;
const MARKER_SIZE_REST = 34;
const MARKER_SIZE_SELECTED = 48;
const PANEL_HEIGHT_RATIO = 0.55;

/**
 * Per-rank latitudeDelta visibility thresholds. A place becomes visible
 * when the current region's latitudeDelta drops to or below its rank's
 * threshold. Higher rank = larger threshold = visible at wider zooms.
 *
 *   rank 5 — always visible at Rutgers-wide zoom
 *   rank 4 — a single campus (Livingston / Busch / College Ave / CD)
 *   rank 3 — part of a campus
 *   rank 2 — block level
 *   rank 1 — street level
 *   rank 0 — right on top of the building
 */
const PLACE_RANK_VISIBLE_DELTA: number[] = [
  0.0008, // 0
  0.0015, // 1
  0.003,  // 2
  0.006,  // 3
  0.012,  // 4
  0.2,    // 5
];

/**
 * Dot diameter (px) by labelRank
 */
const PLACE_DOT_SIZE: number[] = [
  7,  // 0
  8,  // 1
  9,  // 2
  11, // 3
  13, // 4
  15, // 5
];


const PLACE_ICON_DELTA = 0.006;
const PLACE_ICON_MIN_RANK = 3;

const PLACES_MAX_VISIBLE = 200;
const PLACES_BBOX_PADDING = 1.2;


const FIX_FRESHNESS_MS = 60_000; // FRESHNESSS LIMIT

// ZOOM limit
const SEARCH_STOP_DELTA = 0.008;
const SEARCH_PLACE_DELTA = 0.005;

type MarkerMode = 'pie' | 'uniform';
const UNIFORM_MARKER_COLOR = '#455A64';

type RLMapCoord = { latitude: number; longitude: number };

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const toMapCoord = (p: { lat: number; lng: number }): RLMapCoord => ({
  latitude: p.lat,
  longitude: p.lng,
});

function decodeStep(step: GeometryStep): RLMapCoord[] {
  const raw = step.polyline;
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .filter((v) => v && typeof v.lat === 'number' && typeof v.lng === 'number')
      .map(toMapCoord);
  }

  if (typeof raw === 'string') {
    try {
      const decoded = decodePolyline.decode(raw) as [number, number][];
      return decoded.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
    } catch {
      return [];
    }
  }

  return [];
}

function routeToPolyline(def: RouteDefinition): RLMapCoord[] {
  const geom = def.geometry;
  if (!geom?.defaultNavigationId) return [];

  const nav = geom.navigations?.[geom.defaultNavigationId];
  if (!nav) return [];

  const points: RLMapCoord[] = [];
  for (const leg of nav.legs ?? []) {
    for (const step of leg.steps ?? []) {
      for (const p of decodeStep(step)) points.push(p);
    }
  }
  return points;
}

function stopKeyOf(stop: Stop): string {
  return stop.sharedStopId || stop.stopId || stop.gtfsId || stop.name;
}

function busId(bus: Bus): string {
  return `${bus.route}|${bus.name}`;
}

function busKey(bus: Bus, idx: number): string {
  const next = bus.nextStop?.name ?? '';
  return `${bus.route}|${bus.name}|${next}|${idx}`;
}

function findStopByKey(
  routeBlob: Record<string, RouteDefinition>,
  key: string,
): Stop | null {
  for (const route of Object.values(routeBlob)) {
    for (const stop of route.stops ?? []) {
      if (stopKeyOf(stop) === key) return stop;
    }
  }
  return null;
}


function formatEta(
  etaISO: string | null | undefined,
  clockOffsetMs: number,
): string {
  if (!etaISO) return '—';
  const target = Date.parse(etaISO);
  if (!Number.isFinite(target)) return '—';

  const diffMs = target - (Date.now() + clockOffsetMs);
  if (diffMs <= 0) return 'now';

  const min = Math.round(diffMs / 60_000);
  if (min < 1) return '<1 min';
  if (min === 1) return '1 min';
  if (min < 60) return `${min} min`;

  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}


function placeVisible(place: Place, region: Region): boolean {
  const threshold =
    PLACE_RANK_VISIBLE_DELTA[place.labelRank] ?? PLACE_RANK_VISIBLE_DELTA[0];
  if (region.latitudeDelta > threshold) return false;

  const latPad = region.latitudeDelta * 0.5 * PLACES_BBOX_PADDING;
  const lngPad = region.longitudeDelta * 0.5 * PLACES_BBOX_PADDING;
  if (place.lat < region.latitude - latPad) return false;
  if (place.lat > region.latitude + latPad) return false;
  if (place.lng < region.longitude - lngPad) return false;
  if (place.lng > region.longitude + lngPad) return false;
  return true;
}

function placeDotSize(labelRank: number): number {
  return PLACE_DOT_SIZE[labelRank] ?? PLACE_DOT_SIZE[0];
}


function UserLocationMarker({
  position,
}: {
  position: { lat: number; lng: number };
}) {
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setTracks(false), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <Marker
      coordinate={{
        latitude: position.lat,
        longitude: position.lng,
      }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      zIndex={500}
    >
      <View style={styles.userLocationWrap}>
        <View style={styles.userLocationHalo} />
        <View style={styles.userLocationDot} />
      </View>
    </Marker>
  );
}

function LiveBusMarker({
  bus,
  highlighted,
  idle,
}: {
  bus: Bus;
  highlighted?: boolean;
  idle?: boolean;
}) {
  const [tracks, setTracks] = useState(true);

  const hasHeading = bus.speed != null && bus.bearing != null && !idle;
  const bearingDeg = bus.bearing ?? 0;

  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 100);
    return () => clearTimeout(t);
  }, [highlighted, hasHeading, bearingDeg, idle]);

  if (!bus.location) return null;

  const color = bus.routeColor ?? '#888';
  const label = bus.routeShortName ?? bus.route;

  return (
    <Marker
      coordinate={toMapCoord(bus.location)}
      title={`${bus.route} — Bus ${bus.name}${idle ? ' (IDLE)' : ''}`}
      description={
        bus.nextStop?.name ? `Next stop: ${bus.nextStop.name}` : undefined
      }
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      zIndex={highlighted ? 1000 : 0}
    >
      <View
        style={[
          styles.busMarkerWrap,
          highlighted && styles.busMarkerWrapHighlighted,
        ]}
      >
        {hasHeading && (
          <View
            style={[
              styles.busArrowOrbit,
              { transform: [{ rotate: `${bearingDeg}deg` }] },
            ]}
            pointerEvents="none"
          >
            <View style={[styles.busArrow, { borderBottomColor: color }]} />
          </View>
        )}

        <View
          style={[
            styles.busMarker,
            { backgroundColor: color },
            idle && styles.busMarkerIdle,
            highlighted && styles.busMarkerHighlighted,
          ]}
        >
          <Text style={styles.busMarkerText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
    </Marker>
  );
}


function CatchBanner({
  routeName,
  userPosition,
  routeBlob,
  activeBuses,
  clockOffsetMs,
  onPress,
}: {
  routeName: string;
  userPosition: { lat: number; lng: number };
  routeBlob: Record<string, RouteDefinition>;
  activeBuses: Bus[];
  clockOffsetMs: number;
  onPress: (stop: Stop, bus: Bus) => void;
}) {
  const boarding = useMemo(() => {
    const nowMs = Date.now() + clockOffsetMs;
    return findBestBoardingForRoute(
      routeName,
      userPosition,
      routeBlob,
      activeBuses,
      nowMs,
    );
  }, [routeName, userPosition, routeBlob, activeBuses, clockOffsetMs]);

  if (!boarding) return null;

  const color = routeBlob[routeName]?.route?.color ?? '#888';
  const shortName = routeBlob[routeName]?.route?.shortName ?? routeName;

  return (
    <Pressable
      onPress={() => onPress(boarding.stop, boarding.bus)}
      style={({ pressed }) => [
        styles.catchBanner,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.catchBannerChip, { backgroundColor: color }]}>
        <Text style={styles.catchBannerChipText}>{shortName}</Text>
      </View>
      <View style={styles.catchBannerBody}>
        <Text style={styles.catchBannerTitle} numberOfLines={1}>
          Walk {formatDuration(boarding.walkSeconds)} to {boarding.stop.name}
        </Text>
        <Text style={styles.catchBannerMeta} numberOfLines={1}>
          Catch Bus {boarding.bus.name} · arrives in{' '}
          {formatDuration(boarding.totalSeconds)}
        </Text>
      </View>
    </Pressable>
  );
}


function NearbyPanel({
  userPosition,
  routeBlob,
  nearbyFilter,
  onToggleFilter,
  onStopPress,
  onClose,
}: {
  userPosition: { lat: number; lng: number };
  routeBlob: Record<string, RouteDefinition>;
  nearbyFilter: string[];
  onToggleFilter: (routeName: string) => void;
  onStopPress: (stop: Stop) => void;
  onClose: () => void;
}) {
  const allRouteNames = useMemo(
    () => Object.keys(routeBlob).sort(),
    [routeBlob],
  );

  const routesToUse = nearbyFilter.length === 0 ? allRouteNames : nearbyFilter;

  const nearby = useMemo(
    () =>
      findClosestStopsOnRoutes(
        userPosition,
        routesToUse,
        routeBlob,
        MAX_NEARBY,
      ),
    [userPosition, routesToUse, routeBlob],
  );

  const subtitle =
    nearbyFilter.length === 0
      ? 'All routes'
      : 'Filtered: ' +
        nearbyFilter
          .map((r) => routeBlob[r]?.route?.shortName ?? r)
          .join(', ');

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderText}>
          <Text style={styles.panelTitle}>Nearby Stops</Text>
          <Text style={styles.panelSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeBtn,
            pressed && { opacity: 0.6 },
          ]}
          hitSlop={12}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {allRouteNames.map((name) => {
          const def = routeBlob[name];
          const shortName = def?.route?.shortName ?? name;
          const color = def?.route?.color ?? '#888';
          const active = nearbyFilter.includes(name);
          return (
            <Pressable
              key={name}
              onPress={() => onToggleFilter(name)}
              style={({ pressed }) => [
                styles.filterChip,
                { borderColor: color },
                active && { backgroundColor: color },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: active ? '#fff' : color },
                ]}
              >
                {shortName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.arrivalsScroll}
        contentContainerStyle={styles.arrivalsContent}
        showsVerticalScrollIndicator={false}
      >
        {nearby.length === 0 ? (
          <Text style={styles.arrivalsEmpty}>No stops nearby.</Text>
        ) : (
          nearby.map(({ stop, walkSeconds, walkMeters, servedBy }) => (
            <Pressable
              key={stopKeyOf(stop)}
              onPress={() => onStopPress(stop)}
              style={({ pressed }) => [
                styles.arrivalRow,
                pressed && styles.arrivalRowPressed,
              ]}
            >
              <View style={styles.nearbyInfo}>
                <Text style={styles.arrivalBus} numberOfLines={1}>
                  {stop.name}
                </Text>
                <Text style={styles.nearbyMeta}>
                  {formatDuration(walkSeconds)} · {formatDistance(walkMeters)}
                </Text>
              </View>
              <View style={styles.nearbyRouteChips}>
                {servedBy.slice(0, 3).map((r) => {
                  const c = routeBlob[r]?.route?.color ?? '#888';
                  const sn = routeBlob[r]?.route?.shortName ?? r;
                  return (
                    <View
                      key={r}
                      style={[styles.miniRouteChip, { backgroundColor: c }]}
                    >
                      <Text style={styles.miniRouteChipText}>{sn}</Text>
                    </View>
                  );
                })}
                {servedBy.length > 3 && (
                  <Text style={styles.miniRouteChipMore}>
                    +{servedBy.length - 3}
                  </Text>
                )}
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}


function ArrivalsPanel({
  stop,
  buses,
  idleBusIds,
  showIdle,
  onToggleShowIdle,
  mapRoutes,
  filterRoutes,
  onToggleFilter,
  onBusPress,
  onRouteHere,
  onClose,
  routeBlob,
  clockOffsetMs,
}: {
  stop: Stop;
  buses: Bus[];
  idleBusIds: Set<string>;
  showIdle: boolean;
  onToggleShowIdle: () => void;
  mapRoutes: string[];
  filterRoutes: string[];
  onToggleFilter: (routeName: string) => void;
  onBusPress: (bus: Bus) => void;
  onRouteHere?: () => void;
  onClose: () => void;
  routeBlob: Record<string, RouteDefinition>;
  clockOffsetMs: number;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const servingRoutesAll = useMemo(() => {
    const key = stopKeyOf(stop);
    const out: string[] = [];
    for (const [routeName, def] of Object.entries(routeBlob)) {
      const hasStop = (def.stops ?? []).some((s) => stopKeyOf(s) === key);
      if (hasStop) out.push(routeName);
    }
    out.sort((a, b) => {
      const sa = routeBlob[a]?.route?.shortName ?? a;
      const sb = routeBlob[b]?.route?.shortName ?? b;
      return sa.localeCompare(sb, undefined, { numeric: true });
    });
    return out;
  }, [stop, routeBlob]);

  const primaryRoutes = useMemo(
    () => servingRoutesAll.filter((r) => mapRoutes.includes(r)),
    [servingRoutesAll, mapRoutes],
  );

  const extraRoutes = useMemo(
    () => servingRoutesAll.filter((r) => !mapRoutes.includes(r)),
    [servingRoutesAll, mapRoutes],
  );

  const candidateRoutes = useMemo(() => {
    if (filterRoutes.length === 0) return primaryRoutes;
    return filterRoutes;
  }, [filterRoutes, primaryRoutes]);

  const arrivals = useMemo(() => {
    const candidateSet = new Set(candidateRoutes);
    const out: Array<{
      bus: Bus;
      etaISO: string;
      state: string;
      isIdle: boolean;
    }> = [];

    for (const bus of buses) {
      if (!candidateSet.has(bus.route)) continue;
      const eta = bus.etas?.[stop.name];
      if (!eta?.etaISO) continue;
      if (eta.state === 'Departed') continue;

      const isIdle = idleBusIds.has(busId(bus));
      if (isIdle && !showIdle) continue;

      out.push({ bus, etaISO: eta.etaISO, state: eta.state, isIdle });
    }

    out.sort((a, b) => {
      if (a.isIdle !== b.isIdle) return a.isIdle ? 1 : -1;
      return Date.parse(a.etaISO) - Date.parse(b.etaISO);
    });

    return out.slice(0, MAX_ARRIVALS);
  }, [buses, idleBusIds, showIdle, candidateRoutes, stop.name]);

  const idleCount = useMemo(() => {
    let n = 0;
    const candidateSet = new Set(candidateRoutes);
    for (const bus of buses) {
      if (!candidateSet.has(bus.route)) continue;
      const eta = bus.etas?.[stop.name];
      if (!eta?.etaISO) continue;
      if (eta.state === 'Departed') continue;
      if (idleBusIds.has(busId(bus))) n++;
    }
    return n;
  }, [buses, idleBusIds, candidateRoutes, stop.name]);

  const subtitle = useMemo(() => {
    if (filterRoutes.length > 0) {
      return (
        'Filtered: ' +
        filterRoutes
          .map((r) => routeBlob[r]?.route?.shortName ?? r)
          .join(', ')
      );
    }
    if (extraRoutes.length > 0) {
      return `Enabled routes · ${extraRoutes.length} more available`;
    }
    return 'Enabled routes only';
  }, [filterRoutes, extraRoutes, routeBlob]);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderText}>
          <Text style={styles.panelTitle} numberOfLines={1}>
            {stop.name}
          </Text>
          <Text style={styles.panelSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <Pressable
          onPress={onToggleShowIdle}
          style={({ pressed }) => [
            styles.idleToggle,
            showIdle && styles.idleToggleActive,
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={8}
        >
          <Text
            style={[
              styles.idleToggleText,
              showIdle && styles.idleToggleTextActive,
            ]}
          >
            IDLE
          </Text>
          {!showIdle && idleCount > 0 && (
            <View style={styles.idleToggleBadge}>
              <Text style={styles.idleToggleBadgeText}>{idleCount}</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeBtn,
            pressed && { opacity: 0.6 },
          ]}
          hitSlop={12}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      {onRouteHere && (
        <Pressable
          onPress={onRouteHere}
          style={({ pressed }) => [
            styles.routeHereBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.routeHereBtnText}>Route here →</Text>
        </Pressable>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {primaryRoutes.map((name) => {
          const def = routeBlob[name];
          const shortName = def?.route?.shortName ?? name;
          const color = def?.route?.color ?? '#888';
          const active = filterRoutes.includes(name);
          return (
            <Pressable
              key={`p-${name}`}
              onPress={() => onToggleFilter(name)}
              style={({ pressed }) => [
                styles.filterChip,
                { borderColor: color },
                active && { backgroundColor: color },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: active ? '#fff' : color },
                ]}
              >
                {shortName}
              </Text>
            </Pressable>
          );
        })}

        {primaryRoutes.length > 0 && extraRoutes.length > 0 && (
          <View style={styles.filterDivider} />
        )}

        {extraRoutes.map((name) => {
          const def = routeBlob[name];
          const shortName = def?.route?.shortName ?? name;
          const color = def?.route?.color ?? '#888';
          const active = filterRoutes.includes(name);
          return (
            <Pressable
              key={`e-${name}`}
              onPress={() => onToggleFilter(name)}
              style={({ pressed }) => [
                styles.filterChip,
                styles.filterChipExtra,
                { borderColor: color },
                active && { backgroundColor: color, borderStyle: 'solid' },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active ? { color: '#fff' } : { color, opacity: 0.7 },
                ]}
              >
                + {shortName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.arrivalsScroll}
        contentContainerStyle={styles.arrivalsContent}
        showsVerticalScrollIndicator={false}
      >
        {arrivals.length === 0 ? (
          <Text style={styles.arrivalsEmpty}>
            No upcoming buses at this stop.
          </Text>
        ) : (
          arrivals.map(({ bus, etaISO, state, isIdle }, idx) => {
            const color =
              routeBlob[bus.route]?.route?.color ?? bus.routeColor ?? '#888';
            const shortName =
              routeBlob[bus.route]?.route?.shortName ?? bus.route;
            return (
              <Pressable
                key={busKey(bus, idx)}
                onPress={() => onBusPress(bus)}
                style={({ pressed }) => [
                  styles.arrivalRow,
                  isIdle && styles.arrivalRowIdle,
                  pressed && styles.arrivalRowPressed,
                ]}
              >
                <View style={[styles.routeChip, { backgroundColor: color }]}>
                  <Text style={styles.routeChipText}>{shortName}</Text>
                </View>

                <View style={styles.arrivalBusWrap}>
                  <Text
                    style={[
                      styles.arrivalBus,
                      isIdle && styles.arrivalBusIdle,
                    ]}
                    numberOfLines={1}
                  >
                    Bus {bus.name}
                  </Text>
                  {isIdle && (
                    <View style={styles.idleBadge}>
                      <Text style={styles.idleBadgeText}>IDLE</Text>
                    </View>
                  )}
                </View>

                <Text
                  style={[
                    styles.arrivalTime,
                    isIdle && styles.arrivalTimeIdle,
                    !isIdle && state === 'Present' && { color: '#0A7' },
                  ]}
                >
                  {isIdle ? 'now' : formatEta(etaISO, clockOffsetMs)}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}



const RUTGERS_CENTER: Region = {
  latitude: 40.505,
  longitude: -74.448,
  latitudeDelta: 0.07,
  longitudeDelta: 0.07,
};



export default function MapParent() {
  const [routeBlob, setRouteBlob] = useState<Record<string, RouteDefinition>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [markerMode, setMarkerMode] = useState<MarkerMode>('pie');

  const [selectedStopKey, setSelectedStopKey] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState<string[]>([]);
  const [focusedBusId, setFocusedBusId] = useState<string | null>(null);
  const [showNearby, setShowNearby] = useState(false);
  const [nearbyFilter, setNearbyFilter] = useState<string[]>([]);
  const [journeyTo, setJourneyTo] = useState<Stop | null>(null);
  const [maxBuses, setMaxBuses] = useState(2);

  const [showIdle, setShowIdle] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [buses, setBuses] = useState<Bus[]>([]);
  const [oldBuses, setOldBuses] = useState<Bus[]>([]);
  const [liveAsOf, setLiveAsOf] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  const [placesBlob, setPlacesBlob] = useState<{
    hash: string;
    places: Place[];
  } | null>(null);

  const [region, setRegion] = useState<Region | null>(null);

  const [placeScreen, dispatchPlaceScreen] = useReducer(
    placeScreenReducer,
    null,
  );

  const [journeyAllowsStale, setJourneyAllowsStale] = useState(false);

  const mapRef = useRef<MapView | null>(null);
  const lastMarkerPressRef = useRef(0);


  const {
    status: userLocationStatus,
    position: userPosition,
    lastFixAt: userLastFixAt,
  } = useUserLocation();

  const hasUserLocation =
    userLocationStatus === 'granted' && userPosition != null;

  const isFixFresh = () => {
    if (userLocationStatus !== 'granted') return false;
    if (!userPosition || userLastFixAt == null) return false;
    return Date.now() - userLastFixAt <= FIX_FRESHNESS_MS;
  };

  useEffect(() => {
    if (userLastFixAt == null) return;
    if (Date.now() - userLastFixAt <= FIX_FRESHNESS_MS) {
      setJourneyAllowsStale(false);
    }
  }, [userLastFixAt]);

  useEffect(() => {
    const journeyOpen = journeyTo != null || placeScreen?.state === 'journey';
    if (!journeyOpen) {
      setJourneyAllowsStale(false);
    }
  }, [journeyTo, placeScreen]);


  const clearOtherPanels = () => {
    setSelectedStopKey(null);
    setShowNearby(false);
    setJourneyTo(null);
    setFocusedBusId(null);
    setShowSearch(false);
  };

  useEffect(() => {
    if (!hasUserLocation) {
      setShowNearby(false);
      setJourneyTo(null);
    }
  }, [hasUserLocation]);


  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let currentHash: string | null = null;

    const tick = async () => {
      try {
        const pointer = await api.staticPointer();
        if (cancelled) return;

        if (pointer.hash !== currentHash) {
          const blob = await api.staticBlob(pointer.hash);
          if (cancelled) return;

          currentHash = pointer.hash;
          setRouteBlob(blob.routes);

          if (selected.length === 0) {
            const preferred = ['EE Route', 'H Route'].filter(
              (n) => blob.routes[n]?.stops?.length,
            );
            const fallback = Object.entries(blob.routes)
              .filter(([, def]) => def.stops?.length)
              .slice(0, 2)
              .map(([name]) => name);
            setSelected(preferred.length ? preferred : fallback);
          }
        }

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (Object.keys(routeBlob).length === 0) {
          const msg =
            err instanceof ApiError
              ? `${err.code}: ${err.message}`
              : (err as Error).message ?? 'Unknown error';
          setError(msg);
        }
        setLoading(false);
      }
    };

    const start = () => {
      if (timer) return;
      tick();
      timer = setInterval(tick, 31 * 60 * 1000);
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    start();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const pointer = await api.placesPointer();
        if (cancelled) return;

        const cached = await readCachedPlaces(pointer.hash);
        if (cached && cached.places?.length) {
          if (!cancelled) {
            setPlacesBlob({ hash: pointer.hash, places: cached.places });
          }
          return;
        }

        const blob = await api.placesBlob(pointer.hash);
        if (cancelled) return;
        if (blob.places?.length) {
          setPlacesBlob({ hash: pointer.hash, places: blob.places });
          await writeCachedPlaces(pointer.hash, blob);
        }
      } catch (err) {
        if (__DEV__) {
          console.warn('[places] load failed:', (err as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchLive = async () => {
      try {
        const [snapshot, previous] = await Promise.all([
          api.liveSnapshot(),
          api.liveHistory().catch(() => null),
        ]);
        if (cancelled) return;

        setBuses(snapshot.buses ?? []);
        setOldBuses(previous?.buses ?? []);
        setLiveAsOf(snapshot.asOf);
        if (snapshot.serverNow) {
          setClockOffsetMs(Date.parse(snapshot.serverNow) - Date.now());
        }
      } catch {
        // Silent — next tick retries.
      }
    };

    const start = () => {
      if (timer) return;
      fetchLive();
      timer = setInterval(fetchLive, 30_000);
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    start();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, []);


  const idleBusIds = useMemo(
    () => computeIdleBusIds(buses, oldBuses),
    [buses, oldBuses],
  );

  const activeBuses = useMemo(
    () => buses.filter((b) => !idleBusIds.has(busId(b))),
    [buses, idleBusIds],
  );

  const { visibleStops, visibleStopKeys } = useMemo(() => {
    const byKey = new Map<string, { stop: Stop; servingRoutes: string[] }>();

    for (const routeName of selected) {
      const def = routeBlob[routeName];
      if (!def) continue;

      for (const stop of def.stops ?? []) {
        const key = stopKeyOf(stop);
        const existing = byKey.get(key);
        if (existing) {
          if (!existing.servingRoutes.includes(routeName)) {
            existing.servingRoutes.push(routeName);
          }
        } else {
          byKey.set(key, { stop, servingRoutes: [routeName] });
        }
      }
    }

    return {
      visibleStops: [...byKey.values()],
      visibleStopKeys: new Set(byKey.keys()),
    };
  }, [selected, routeBlob]);

  const allStopKeys = useMemo(() => {
    const s = new Set<string>();
    for (const route of Object.values(routeBlob)) {
      for (const stop of route.stops ?? []) s.add(stopKeyOf(stop));
    }
    return s;
  }, [routeBlob]);

  const allStops = useMemo(() => {
    const seen = new Map<string, Stop>();
    for (const route of Object.values(routeBlob)) {
      for (const stop of route.stops ?? []) {
        const key = stopKeyOf(stop);
        if (!seen.has(key)) seen.set(key, stop);
      }
    }
    return Array.from(seen.values());
  }, [routeBlob]);

  const routePolylines = useMemo(() => {
    const out: Record<string, RLMapCoord[]> = {};
    for (const name of selected) {
      const def = routeBlob[name];
      if (!def) continue;
      out[name] = routeToPolyline(def);
    }
    return out;
  }, [selected, routeBlob]);

  const visibleBuses = useMemo(() => {
    if (selected.length === 0) return [];
    const set = new Set(selected);
    return buses.filter((b) => b.location && set.has(b.route));
  }, [buses, selected]);

  const extraFocusedBuses = useMemo(() => {
    if (!focusedBusId) return [];
    const alreadyVisible = visibleBuses.some((b) => busId(b) === focusedBusId);
    if (alreadyVisible) return [];
    return buses.filter((b) => b.location && busId(b) === focusedBusId);
  }, [focusedBusId, buses, visibleBuses]);

  const busesToRender = useMemo(
    () => [...visibleBuses, ...extraFocusedBuses],
    [visibleBuses, extraFocusedBuses],
  );

  const selectedStop = useMemo(() => {
    if (!selectedStopKey) return null;
    return findStopByKey(routeBlob, selectedStopKey);
  }, [selectedStopKey, routeBlob]);

  const extraSelectedStop = useMemo(() => {
    if (!selectedStop || !selectedStopKey) return null;
    if (visibleStopKeys.has(selectedStopKey)) return null;

    const servingRoutes: string[] = [];
    for (const [routeName, route] of Object.entries(routeBlob)) {
      for (const stop of route.stops ?? []) {
        if (stopKeyOf(stop) === selectedStopKey) {
          servingRoutes.push(routeName);
          break;
        }
      }
    }

    const colors =
      markerMode === 'pie'
        ? servingRoutes.map((r) => routeBlob[r]?.route?.color ?? '#888')
        : [UNIFORM_MARKER_COLOR];

    return {
      stop: selectedStop,
      colors,
      servingRoutes,
    };
  }, [selectedStop, selectedStopKey, visibleStopKeys, routeBlob, markerMode]);

  useEffect(() => {
    if (selectedStopKey && !allStopKeys.has(selectedStopKey)) {
      setSelectedStopKey(null);
      setFocusedBusId(null);
      setJourneyTo(null);
    }
  }, [selectedStopKey, allStopKeys]);

  const activePlace = useMemo<Place | null>(() => {
    if (!placeScreen || !placesBlob) return null;
    return placesBlob.places.find((p) => p.id === placeScreen.placeId) ?? null;
  }, [placeScreen, placesBlob]);

  useEffect(() => {
    if (placeScreen && placesBlob && !activePlace) {
      dispatchPlaceScreen({ type: 'close' });
    }
  }, [placeScreen, placesBlob, activePlace]);

  const visiblePlaces = useMemo<Place[]>(() => {
    if (!placesBlob || !region) return [];
    if (journeyTo != null) return [];
    if (placeScreen?.state === 'journey') return [];

    const filtered = placesBlob.places.filter((p) => placeVisible(p, region));
    if (filtered.length <= PLACES_MAX_VISIBLE) return filtered;

    return filtered
      .slice()
      .sort((a, b) => b.labelRank - a.labelRank)
      .slice(0, PLACES_MAX_VISIBLE);
  }, [placesBlob, region, placeScreen, journeyTo]);

  const itineraryFrom = useMemo<StartPoint | null>(() => {
    if (placeScreen?.state === 'journey') return placeScreen.start;
    if (journeyTo) return { kind: 'current' };
    return null;
  }, [placeScreen, journeyTo]);

  const itineraryTo = useMemo(() => {
    if (placeScreen?.state === 'journey' && activePlace) {
      return {
        kind: 'point' as const,
        lat: activePlace.lat,
        lng: activePlace.lng,
        label: activePlace.name,
      };
    }
    if (journeyTo) {
      return { kind: 'stop' as const, stopKey: stopKeyOf(journeyTo) };
    }
    return null;
  }, [placeScreen, activePlace, journeyTo]);

  const { itinerary, error: itineraryError } = useItinerary({
    from: itineraryFrom,
    to: itineraryTo,
    routeBlob,
    places: placesBlob?.places ?? [],
    buses: activeBuses,
    clockOffsetMs,
    maxBuses,
    userPosition: userPosition ?? null,
    userLocationStatus,
    userLastFixAt,
    allowStale: journeyAllowsStale,
  });

  const toggleRoute = (name: string) => {
    const isRemoving = selected.includes(name);
    setSelected((prev) =>
      isRemoving ? prev.filter((r) => r !== name) : [...prev, name],
    );
    if (isRemoving) {
      setRouteFilter((f) => f.filter((r) => r !== name));
      setNearbyFilter((f) => f.filter((r) => r !== name));
    }
  };

  const toggleFilter = (name: string) => {
    setRouteFilter((prev) =>
      prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name],
    );
  };

  const toggleNearbyFilter = (name: string) => {
    setNearbyFilter((prev) =>
      prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name],
    );
  };

  const focusOnBus = (bus: Bus) => {
    if (!bus.location) return;
    setFocusedBusId(busId(bus));

    const screenHeight = Dimensions.get('window').height;
    const latitudeDelta = 0.006;
    const longitudeDelta = 0.006;
    const shiftPixels = (PANEL_HEIGHT_RATIO / 2) * screenHeight;
    const latitudeShift = latitudeDelta * (shiftPixels / screenHeight);

    mapRef.current?.animateToRegion(
      {
        latitude: bus.location.lat - latitudeShift,
        longitude: bus.location.lng,
        latitudeDelta,
        longitudeDelta,
      },
      700,
    );
  };

  const handleJourneyBusPress = (routeName: string, busName: string) => {
    const bus = buses.find(
      (b) => b.route === routeName && b.name === busName,
    );
    if (!bus?.location) return;
    focusOnBus(bus);
  };

  const recenterOnUser = () => {
    if (!hasUserLocation || !userPosition || !mapRef.current) return;
    mapRef.current.animateCamera(
      { center: { latitude: userPosition.lat, longitude: userPosition.lng } },
      { duration: 700 },
    );
  };

  const openNearbyPanel = () => {
    clearOtherPanels();
    dispatchPlaceScreen({ type: 'close' });
    setShowNearby(true);
  };

  const openSearchPanel = () => {
    clearOtherPanels();
    dispatchPlaceScreen({ type: 'close' });
    setShowSearch(true);
  };

  const handleSearchPick = (target: SearchTarget) => {
    setShowSearch(false);
    setFocusedBusId(null);
    setJourneyTo(null);
    setShowNearby(false);

    if (target.stopKey) {
      dispatchPlaceScreen({ type: 'close' });
      setSelectedStopKey(target.stopKey);
    } else if (target.placeId) {
      setSelectedStopKey(null);
      dispatchPlaceScreen({ type: 'open-detail', placeId: target.placeId });
    } else {
      dispatchPlaceScreen({ type: 'close' });
      setSelectedStopKey(null);
    }

    const delta = target.placeId ? SEARCH_PLACE_DELTA : SEARCH_STOP_DELTA;
    mapRef.current?.animateToRegion(
      {
        latitude: target.lat,
        longitude: target.lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      },
      700,
    );
  };

  const handleNearbyStopPress = (stop: Stop) => {
    clearOtherPanels();
    dispatchPlaceScreen({ type: 'close' });
    setSelectedStopKey(stopKeyOf(stop));

    if (stop.location) {
      mapRef.current?.animateToRegion(
        {
          latitude: stop.location.lat,
          longitude: stop.location.lng,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        },
        700,
      );
    }
  };

  const handleCatchPress = (stop: Stop, bus: Bus) => {
    lastMarkerPressRef.current = Date.now();
    clearOtherPanels();
    dispatchPlaceScreen({ type: 'close' });
    setSelectedStopKey(stopKeyOf(stop));
    setFocusedBusId(busId(bus));

    if (stop.location) {
      mapRef.current?.animateToRegion(
        {
          latitude: stop.location.lat,
          longitude: stop.location.lng,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        },
        700,
      );
    }
  };

  const openJourneyTo = (stop: Stop) => {
    if (!hasUserLocation) return;

    const proceed = () => {
      clearOtherPanels();
      dispatchPlaceScreen({ type: 'close' });
      setJourneyTo(stop);
    };

    if (isFixFresh()) {
      proceed();
      return;
    }

    Alert.alert(
      'Use last known location?',
      'Your GPS fix is more than a minute old. Route using the last known position?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use last fix',
          onPress: () => {
            setJourneyAllowsStale(true);
            proceed();
          },
        },
      ],
    );
  };

  const handlePlaceMarkerPress = (place: Place) => {
    lastMarkerPressRef.current = Date.now();
    clearOtherPanels();
    dispatchPlaceScreen({ type: 'open-detail', placeId: place.id });
  };

  const handlePlaceRouteHere = () => {
    dispatchPlaceScreen({
      type: 'request-route',
      locationAvailable: hasUserLocation,
    });
  };

  const handlePlaceUseCurrent = () => {
    const proceed = () => {
      dispatchPlaceScreen({
        type: 'start-picked',
        start: { kind: 'current' },
      });
    };

    if (isFixFresh()) {
      proceed();
      return;
    }

    Alert.alert(
      'Use last known location?',
      'Your GPS fix is more than a minute old. Route using the last known position?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use last fix',
          onPress: () => {
            setJourneyAllowsStale(true);
            proceed();
          },
        },
      ],
    );
  };

  const handlePlaceStartPicked = (start: StartPoint) => {
    dispatchPlaceScreen({ type: 'start-picked', start });
  };

  const handlePlaceBack = () => dispatchPlaceScreen({ type: 'back' });
  const handlePlaceClose = () => dispatchPlaceScreen({ type: 'close' });
  const handlePlaceChooseSpecific = () =>
    dispatchPlaceScreen({ type: 'pick-specific-start' });

  useEffect(() => {
    if (!mapRef.current) return;

    const coords: RLMapCoord[] = [];
    for (const name of selected) {
      const poly = routePolylines[name];
      if (poly && poly.length) coords.push(...poly);
    }
    if (coords.length === 0) {
      for (const { stop } of visibleStops) {
        if (stop.location) coords.push(toMapCoord(stop.location));
      }
    }
    if (coords.length === 0) return;

    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 80, left: 60 },
        animated: true,
      });
    }, 200);
    return () => clearTimeout(t);
  }, [selected, routePolylines, visibleStops]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#CC0033" />
        <Text style={styles.centeredText}>Loading routes…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Couldn't load routes</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }

  const routeNames = Object.keys(routeBlob);

  const showCatchBanner =
    hasUserLocation &&
    userPosition &&
    selected.length === 1 &&
    !selectedStop &&
    !showNearby &&
    !journeyTo &&
    placeScreen === null &&
    !showSearch;

  const journeyActive = placeScreen?.state === 'journey' || journeyTo != null;
  const placeDestinationLabel = activePlace?.name ?? '';

  return (
    <View style={styles.container}>
      <View style={styles.selectorWrap}>
        <View style={styles.selectorHeaderRow}>
          <Text style={styles.selectorLabel}>Routes</Text>

          <View style={styles.markerModeGroup}>
            <Pressable
              onPress={() => setMarkerMode('pie')}
              style={[
                styles.markerModeBtn,
                markerMode === 'pie' && styles.markerModeBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.markerModeBtnText,
                  markerMode === 'pie' && styles.markerModeBtnTextActive,
                ]}
              >
                Pie
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMarkerMode('uniform')}
              style={[
                styles.markerModeBtn,
                markerMode === 'uniform' && styles.markerModeBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.markerModeBtnText,
                  markerMode === 'uniform' && styles.markerModeBtnTextActive,
                ]}
              >
                Solid
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selectorRow}
        >
          {routeNames.map((name) => {
            const def = routeBlob[name];
            const shortName = def.route?.shortName ?? name;
            const color = def.route?.color ?? '#888';
            const isOn = selected.includes(name);
            return (
              <Pressable
                key={name}
                onPress={() => toggleRoute(name)}
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: color },
                  isOn && { backgroundColor: color },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[styles.chipText, { color: isOn ? '#fff' : color }]}
                >
                  {shortName}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={RUTGERS_CENTER}
          mapType="none"
          showsMyLocationButton={false}
          onRegionChangeComplete={(r) => setRegion(r as Region)}
          onPress={() => {
            if (Date.now() - lastMarkerPressRef.current < 300) return;
            if (placeScreen?.state !== 'journey') {
              dispatchPlaceScreen({ type: 'close' });
            }
            setSelectedStopKey(null);
            setFocusedBusId(null);
            setJourneyTo(null);
            setShowSearch(false);
          }}
        >
          <UrlTile
            urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19}
            shouldReplaceMapContent={true}
            flipY={false}
          />

          {selected.map((name) => {
            const def = routeBlob[name];
            const points = routePolylines[name];
            if (!def || !points || points.length < 2) return null;
            return (
              <Polyline
                key={`poly-${name}`}
                coordinates={points}
                strokeColor={def.route?.color ?? '#888'}
                strokeWidth={4}
                lineCap="round"
                lineJoin="round"
              />
            );
          })}
          {visiblePlaces.map((place) => {
            const isIcon =
              place.labelRank >= PLACE_ICON_MIN_RANK &&
              region != null &&
              region.latitudeDelta <= PLACE_ICON_DELTA;
            const isSelected = placeScreen?.placeId === place.id;
            if (isIcon) {
              return (
                <PlaceIconMarker
                  key={`pi-${place.id}`}
                  place={place}
                  selected={isSelected}
                  onPress={() => handlePlaceMarkerPress(place)}
                />
              );
            }
            return (
              <PlaceDotMarker
                key={`pd-${place.id}`}
                place={place}
                size={placeDotSize(place.labelRank)}
                onPress={() => handlePlaceMarkerPress(place)}
              />
            );
          })}

          {visibleStops.map(({ stop, servingRoutes }) => {
            if (!stop.location) return null;

            const key = stopKeyOf(stop);
            const isSelected = selectedStopKey === key;

            const colors =
              markerMode === 'pie'
                ? servingRoutes.map((r) => routeBlob[r]?.route?.color ?? '#888')
                : [UNIFORM_MARKER_COLOR];

            const shortNames = servingRoutes
              .map((r) => routeBlob[r]?.route?.shortName ?? r)
              .join(', ');

            return (
              <StableMarker
                key={`${key}-${markerMode}-${colors.join(',')}`}
                coordinate={toMapCoord(stop.location)}
                title={stop.name}
                description={`Served by: ${shortNames}`}
                colors={colors}
                size={isSelected ? MARKER_SIZE_SELECTED : MARKER_SIZE_REST}
                onPress={() => {
                  lastMarkerPressRef.current = Date.now();
                  clearOtherPanels();
                  dispatchPlaceScreen({ type: 'close' });
                  setSelectedStopKey(key);
                }}
              />
            );
          })}

          {extraSelectedStop && extraSelectedStop.stop.location && (
            <StableMarker
              key={`extra-selected-${selectedStopKey}-${markerMode}`}
              coordinate={toMapCoord(extraSelectedStop.stop.location)}
              title={extraSelectedStop.stop.name}
              description={`Served by: ${extraSelectedStop.servingRoutes
                .map((r) => routeBlob[r]?.route?.shortName ?? r)
                .join(', ')}`}
              colors={extraSelectedStop.colors}
              size={MARKER_SIZE_SELECTED}
              onPress={() => {
                lastMarkerPressRef.current = Date.now();
              }}
            />
          )}

          {placeScreen?.state === 'journey' && activePlace && (
            <PlaceDestinationMarker place={activePlace} />
          )}

          {busesToRender.map((bus, idx) => (
            <LiveBusMarker
              key={busKey(bus, idx)}
              bus={bus}
              highlighted={focusedBusId === busId(bus)}
              idle={idleBusIds.has(busId(bus))}
            />
          ))}

          {hasUserLocation && userPosition && (
            <UserLocationMarker position={userPosition} />
          )}
        </MapView>

        {showCatchBanner && (
          <CatchBanner
            routeName={selected[0]}
            userPosition={userPosition!}
            routeBlob={routeBlob}
            activeBuses={activeBuses}
            clockOffsetMs={clockOffsetMs}
            onPress={handleCatchPress}
          />
        )}

        {hasUserLocation &&
          !selectedStop &&
          !showNearby &&
          !journeyActive &&
          placeScreen === null &&
          !showSearch && (
            <Pressable
              onPress={openNearbyPanel}
              style={({ pressed }) => [
                styles.nearbyBtn,
                pressed && styles.nearbyBtnPressed,
              ]}
              hitSlop={8}
            >
              <Text style={styles.nearbyIcon}>📍</Text>
            </Pressable>
          )}

        {!selectedStop &&
          !showNearby &&
          !journeyActive &&
          placeScreen === null &&
          !showSearch && (
            <Pressable
              onPress={openSearchPanel}
              style={({ pressed }) => [
                styles.searchBtn,
                pressed && styles.nearbyBtnPressed,
              ]}
              hitSlop={8}
            >
              <Text style={styles.searchIcon}>🔍</Text>
            </Pressable>
          )}

        {hasUserLocation && !showSearch && (
          <Pressable
            onPress={recenterOnUser}
            style={({ pressed }) => [
              styles.recenterBtn,
              pressed && { opacity: 0.7 },
            ]}
            hitSlop={8}
          >
            <Text style={styles.recenterIcon}>◎</Text>
          </Pressable>
        )}
      </View>

      {showSearch ? (
        <MapSearchPanel
          stops={allStops}
          places={placesBlob?.places ?? []}
          onPick={handleSearchPick}
          onClose={() => setShowSearch(false)}
        />
      ) : placeScreen?.state === 'journey' && activePlace ? (
        <JourneyPanel
          destinationLabel={placeDestinationLabel}
          itinerary={itinerary}
          error={itineraryError}
          focusedBusId={focusedBusId}
          routeBlob={routeBlob}
          maxBuses={maxBuses}
          onMaxBusesChange={setMaxBuses}
          onBusPress={handleJourneyBusPress}
          onBack={handlePlaceBack}
          onClose={handlePlaceClose}
        />
      ) : placeScreen?.state === 'pick-start' && activePlace ? (
        <PlaceStartPickerPanel
          stops={allStops}
          places={placesBlob?.places ?? []}
          onPick={handlePlaceStartPicked}
          onBack={handlePlaceBack}
          onClose={handlePlaceClose}
        />
      ) : placeScreen?.state === 'choose-start' && activePlace ? (
        <PlaceChooseStartPanel
          place={activePlace}
          onUseCurrent={handlePlaceUseCurrent}
          onPickSpecific={handlePlaceChooseSpecific}
          onBack={handlePlaceBack}
          onClose={handlePlaceClose}
        />
      ) : placeScreen?.state === 'detail' && activePlace ? (
        <PlaceDetailPanel
          place={activePlace}
          onRouteHere={handlePlaceRouteHere}
          onClose={handlePlaceClose}
        />
      ) : journeyTo && hasUserLocation && userPosition ? (
        <JourneyPanel
          destinationLabel={journeyTo.name}
          itinerary={itinerary}
          error={itineraryError}
          focusedBusId={focusedBusId}
          routeBlob={routeBlob}
          maxBuses={maxBuses}
          onMaxBusesChange={setMaxBuses}
          onBusPress={handleJourneyBusPress}
          onClose={() => setJourneyTo(null)}
        />
      ) : selectedStop ? (
        <ArrivalsPanel
          stop={selectedStop}
          buses={buses}
          idleBusIds={idleBusIds}
          showIdle={showIdle}
          onToggleShowIdle={() => setShowIdle((v) => !v)}
          mapRoutes={selected}
          filterRoutes={routeFilter}
          onToggleFilter={toggleFilter}
          onBusPress={focusOnBus}
          onRouteHere={
            hasUserLocation ? () => openJourneyTo(selectedStop) : undefined
          }
          onClose={() => {
            setSelectedStopKey(null);
            setFocusedBusId(null);
          }}
          routeBlob={routeBlob}
          clockOffsetMs={clockOffsetMs}
        />
      ) : showNearby && hasUserLocation && userPosition ? (
        <NearbyPanel
          userPosition={userPosition}
          routeBlob={routeBlob}
          nearbyFilter={nearbyFilter}
          onToggleFilter={toggleNearbyFilter}
          onStopPress={handleNearbyStopPress}
          onClose={() => setShowNearby(false)}
        />
      ) : null}

      {selected.length === 0 && (
        <View pointerEvents="none" style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>
            Tap a route above to see its path and stops.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  centeredText: { marginTop: 12, fontSize: 14, color: '#555' },
  errorTitle: { fontSize: 16, fontWeight: '700', color: '#B00020', marginBottom: 8 },
  errorBody: { fontSize: 13, color: '#555', textAlign: 'center' },

  selectorWrap: {
    paddingTop: 56,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  selectorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 12,
    marginBottom: 6,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#888',
    marginLeft: 16,
  },
  selectorRow: { paddingHorizontal: 12, gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    marginHorizontal: 4,
    backgroundColor: '#fff',
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 14, fontWeight: '700' },

  markerModeGroup: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
  },
  markerModeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  markerModeBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  markerModeBtnText: { fontSize: 12, fontWeight: '600', color: '#666' },
  markerModeBtnTextActive: { color: '#111' },

  mapWrap: { flex: 1, position: 'relative' },
  map: { flex: 1 },

  catchBanner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  catchBannerChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 36,
    alignItems: 'center',
  },
  catchBannerChipText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  catchBannerBody: { flex: 1 },
  catchBannerTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  catchBannerMeta: { fontSize: 11, color: '#555', marginTop: 1 },

  nearbyBtn: {
    position: 'absolute',
    right: 16,
    bottom: 72,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  nearbyBtnPressed: { opacity: 0.7 },
  nearbyIcon: { fontSize: 20 },

  searchBtn: {
    position: 'absolute',
    right: 16,
    bottom: 128,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  searchIcon: { fontSize: 20 },

  recenterBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  recenterIcon: {
    fontSize: 22,
    color: '#CC0033',
    fontWeight: '700',
    marginTop: -2,
  },

  emptyOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    fontSize: 14,
    color: '#333',
  },

  userLocationWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationHalo: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10, 132, 255, 0.20)',
  },
  userLocationDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#0A84FF',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 3,
  },

  busMarkerWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busMarkerWrapHighlighted: {
    transform: [{ scale: 1.3 }],
  },
  busArrowOrbit: { ...StyleSheet.absoluteFill },
  busArrow: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -4,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  busMarker: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
  busMarkerIdle: {
    opacity: 0.55,
    borderColor: '#e0e0e0',
  },
  busMarkerHighlighted: {
    borderColor: '#FFD700',
    borderWidth: 3.5,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 10,
    opacity: 1,
  },
  busMarkerText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  panel: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    maxHeight: '55%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  panelHeaderText: { flex: 1, paddingRight: 8 },
  panelTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  panelSubtitle: { fontSize: 11, color: '#888', marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f2',
  },
  closeBtnText: { fontSize: 14, color: '#555', fontWeight: '700' },

  idleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    gap: 4,
  },
  idleToggleActive: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  idleToggleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#888',
    letterSpacing: 0.5,
  },
  idleToggleTextActive: { color: '#fff' },
  idleToggleBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  idleToggleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#111',
  },

  filterRow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1.5,
    marginHorizontal: 3,
    backgroundColor: '#fff',
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipExtra: {
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  filterDivider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    backgroundColor: '#ccc',
    marginHorizontal: 6,
  },

  arrivalsScroll: { flexGrow: 0 },
  arrivalsContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
  arrivalsEmpty: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 16,
    textAlign: 'center',
  },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  arrivalRowPressed: { backgroundColor: '#f2f2f2' },
  arrivalRowIdle: { backgroundColor: '#fffbf0' },
  arrivalBusWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 32,
    alignItems: 'center',
  },
  routeChipText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  arrivalBus: { fontSize: 13, color: '#333' },
  arrivalBusIdle: { color: '#888', fontStyle: 'italic' },
  arrivalTime: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
    fontVariant: ['tabular-nums'],
  },
  arrivalTimeIdle: {
    color: '#B08000',
    fontStyle: 'italic',
    fontWeight: '800',
  },

  idleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#FFD700',
  },
  idleBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#111',
    letterSpacing: 0.5,
  },

  routeHereBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#CC0033',
    alignItems: 'center',
  },
  routeHereBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  nearbyInfo: { flex: 1, paddingRight: 10 },
  nearbyMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  nearbyRouteChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniRouteChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    minWidth: 22,
    alignItems: 'center',
  },
  miniRouteChipText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  miniRouteChipMore: { fontSize: 10, color: '#888', fontWeight: '700' },
});