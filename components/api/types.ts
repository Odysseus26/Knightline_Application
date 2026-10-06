// ---------------------------------------------------------------------------
// Live tier
// ---------------------------------------------------------------------------

export type LatLng = { lat: number; lng: number };

export type Bus = {
  route: string;
  routeShortName: string | null;
  routeColor: string | null;
  name: string;
  vehicleId: string | null;
  location: LatLng | null;
  speed: number | null;
  bearing: number | null;
  updatedAt: string | null;
  nextStop: {
    name: string | null;
    etaISO: string | null;
    state: string;
  } | null;
  riders: {
    estimated: number;
    capacity: number | null;
    percentFull: number | null;
  };
  bikes: number;
  wheelchairCapacity: number | null;
  navigationId: string | null;
  detourSuspected: boolean;
  etas?: Record<string, { etaISO: string; state: string; source: string }>;
};

export type LiveWindow = 'current' | 'old';

export type LiveResponse = {
  asOf: string | null;
  serverNow: string;
  ageMs: number | null;
  stale: boolean;
  window: LiveWindow;
  requestedWindow?: LiveWindow;
  fellBack?: boolean;
  routeCount: number;
  busCount: number;
  timedOutRoutes: string[];
  buses: Bus[];
  alerts: unknown[];
  schedule: unknown;
};

export type LiveBusesResponse = {
  serverNow: string;
  asOf: string | null;
  stale: boolean;
  window: LiveWindow;
  requestedWindow?: LiveWindow;
  fellBack?: boolean;
  busCount: number;
  buses: Bus[];
};

export type LiveBusResponse = {
  serverNow: string;
  asOf: string | null;
  stale: boolean;
  window: LiveWindow;
  fellBack?: boolean;
  bus: Bus;
};

export type LiveAlertsResponse = {
  serverNow: string;
  asOf: string | null;
  stale: boolean;
  window: LiveWindow;
  alerts: unknown[];
};

export type LiveScheduleResponse = {
  serverNow: string;
  asOf: string | null;
  stale: boolean;
  window: LiveWindow;
  schedule: unknown;
};

// ---------------------------------------------------------------------------
// Static tier
// ---------------------------------------------------------------------------

export type Stop = {
  order: number;
  name: string;
  location: LatLng | null;
  gtfsId: string | null;
  sharedStopId: string | null;
  stopId: string | null;
  geofence: unknown;
  routes?: string[];
  ttsStopName?: string;
};

export type StreetSegment = {
  street: string | null;
  entry: LatLng | null;
  exit: LatLng | null;
  durationSec: number;
  distanceMeters: number;
};

export type RouteIdentity = {
  name: string;
  shortName: string | null;
  color: string | null;
  type: string | null;
  loopMinutes: number | null;
  serviceDay: { day: string; startTime: string; endTime: string } | null;
  direction: string | null;
  directionName: string | null;
  regionId: string | null;
  effectiveThrough: unknown;
  headwayRangeSec: [number, number] | number[] | null;
};


export type RouteSummary = {
  name: string;
  route: RouteIdentity | null;
  stopCount: number;
  streetCount: number;
  lastGoodAt: string | null;
  staleSince: string | null;
  stale: boolean;
};

export type StaticPointerResponse = {
  hash: string;
  routeVersion: string;
  window?: 'current' | 'old';
  requestedWindow?: 'current' | 'old';
  fellBack?: boolean;
};

export type StaticBlobResponse = {
  capturedAt: string;
  routeCount: number;
  routes: Record<string, RouteDefinition>;
  hash: string;
};

export type IndexBlobResponse = {
  derivedAt: string;
  fromStaticHash: string;
  stopsByName: Record<string, string[]>;
  stopsById: Record<string, string[]>;
  stopsByGtfsId: Record<string, string[]>;
  streetsByName: Record<string, string[]>;
};

export type RoutesListResponse = {
  routeVersion: string;
  routeCount: number;
  routes: RouteSummary[];
};

export type RouteStreetsResponse = {
  route: string;
  routeVersion: string;
  streetCount: number;
  streets: StreetSegment[];
  staleSince: string | null;
};

export type StopsListResponse = {
  routeVersion: string;
  stopCount: number;
  stops: Stop[];
};

export type StopResponse = Stop & { routes: string[] };

export type StopRoutesResponse = {
  routeVersion: string;
  stopId: string;
  matchedBy: 'stopId' | 'gtfsId' | 'sharedStopId';
  routes: string[];
};

export type StreetsListResponse = {
  routeVersion: string;
  streetCount: number;
  streets: { name: string; routes: string[] }[];
};

export type StreetResponse = {
  routeVersion: string;
  name: string;
  routes: string[];
};

export type ActiveRoutesResponse = {
  serverNow: string;
  asOf: string | null;
  window: LiveWindow;
  activeRoutes: string[];
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export type BootstrapResponse = {
  routeVersion: string | null;
  staticWindow: 'current' | 'old' | null;
  staticFellBack: boolean;
  serverNow: string;
  haveMatches: boolean;
  static: StaticBlobResponse | null;
  index: IndexBlobResponse | null;
  live: LiveResponse | null;
};


export type GeometryStep = {
  stepStart: { lt: number; lg: number } | null;
  stepEnd: { lt: number; lg: number } | null;
  polyline: string | Array<{ lat: number; lng: number }> | null;
  durationSec: number | null;
  distanceMeters: number | null;
  roadProximity: string | null;
  street: string | null;
  instructionsHtml: string;
};

export type GeometryLeg = {
  startStopId: string | null;
  endStopId: string | null;
  transitNominalSec: number | null;
  transitInTrafficSec: number | null;
  steps: GeometryStep[];
};

export type Navigation = {
  navigationId: string;
  legs: GeometryLeg[];
};

export type RouteGeometry = {
  canonicalNavigationId: string | null;
  defaultNavigationId: string | null;
  navigations: Record<string, Navigation>;
};

export type RouteDefinition = {
  route: RouteIdentity;
  stops: Stop[];
  streets: StreetSegment[];
  geometry: RouteGeometry;
  lastGoodAt: string | null;
  staleSince: string | null;
  lastError: string | null;
};

export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  categories: string[];
  labelRank: number;
};

export type PlacesPointerResponse = {
  hash: string;
  version: string;
  count: number | null;
  generatedAt: string | null;
  sourceSyncId: string | null;
  stale: boolean;
};

export type PlacesBlobResponse = {
  version: string;
  schemaVersion?: number;
  generatedAt: string;
  count: number;
  sourceSyncId: string;
  places: Place[];
  hash: string;
};

export type PlaceResponse = {
  hash: string;
  place: Place;
};

export type PlacesMetaResponse = {
  hash?: string;
  count?: number;
  sourceSyncId?: string;
  stale?: boolean;
  lastError?: string | null;
  lastAttemptAt?: string;
  lastFailedAt?: string;
  checkedAt?: string;
  capturedAt?: string;
  updatedAt?: string;
};