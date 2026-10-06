import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RouteDefinition } from '../../components/api';
import type {
  Itinerary,
  WalkEndpoint,
} from '../../components/Location_Suite/journey-planner';

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Presentational journey panel. Renders whatever itinerary it is
 * given — the caller is responsible for computing it.
 */
export default function JourneyPanel({
  destinationLabel,
  itinerary,
  error,
  focusedBusId,
  routeBlob,
  maxBuses,
  onMaxBusesChange,
  onBusPress,
  onWalkEndpointPress,
  onBack,
  onClose,
}: {
  destinationLabel: string;
  itinerary: Itinerary | null;
  error: 'no-route' | 'stale-location' | 'invalid-start' | null;
  focusedBusId: string | null;
  routeBlob: Record<string, RouteDefinition>;
  maxBuses: number;
  onMaxBusesChange: (n: number) => void;
  onBusPress: (routeName: string, busName: string) => void;
  onWalkEndpointPress?: (endpoint: WalkEndpoint) => void;
  onBack?: () => void;
  onClose: () => void;
}) {
  const subtitle =
    error === 'stale-location'
      ? 'Location is out of date'
      : error === 'invalid-start'
      ? 'Start point unavailable'
      : itinerary
      ? `${formatDuration(itinerary.totalSeconds)} total`
      : 'No route found';

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        {onBack && (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            hitSlop={12}
          >
            <Text style={styles.iconBtnText}>‹</Text>
          </Pressable>
        )}
        <View style={styles.panelHeaderText}>
          <Text style={styles.panelTitle} numberOfLines={2}>
            To {destinationLabel}
          </Text>
          <Text style={styles.panelSubtitle}>{subtitle}</Text>
        </View>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
          hitSlop={12}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      {error === 'stale-location' && (
        <View style={styles.warnBanner}>
          <Text style={styles.warnBannerText}>
            Your location is more than a minute old. Re-enable GPS for
            accurate routing.
          </Text>
        </View>
      )}

      <View style={styles.maxBusesRow}>
        <Text style={styles.maxBusesLabel}>Max buses:</Text>
        {[1, 2, 3].map((n) => (
          <Pressable
            key={n}
            onPress={() => onMaxBusesChange(n)}
            style={({ pressed }) => [
              styles.maxBusesChip,
              maxBuses === n && styles.maxBusesChipActive,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              style={[
                styles.maxBusesChipText,
                maxBuses === n && styles.maxBusesChipTextActive,
              ]}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.arrivalsScroll}
        contentContainerStyle={styles.arrivalsContent}
        showsVerticalScrollIndicator={false}
      >
        {!itinerary ? (
          <Text style={styles.arrivalsEmpty}>
            {error === 'stale-location'
              ? 'Waiting for a fresh location fix.'
              : error === 'invalid-start'
              ? 'The starting point could not be resolved.'
              : `No route found within ${maxBuses} bus${maxBuses > 1 ? 'es' : ''}.`}
          </Text>
        ) : (
          itinerary.legs.map((leg, idx) => {
            if (leg.kind === 'walk') {
              const toLabel =
                leg.to.kind === 'stop' ? leg.to.stop.name : 'destination';
              const fromLabel =
                leg.from.kind === 'stop' ? leg.from.stop.name : 'your location';
              return (
                <Pressable
                  key={`leg-${idx}`}
                  onPress={() => onWalkEndpointPress?.(leg.to)}
                  style={({ pressed }) => [
                    styles.journeyLeg,
                    styles.journeyLegAlignTop,
                    pressed && styles.journeyLegPressed,
                  ]}
                >
                  <View style={[styles.legIcon, styles.legIconWalk]}>
                    <Text style={styles.legIconEmoji}>🚶</Text>
                  </View>
                  <View style={styles.legBody}>
                    <Text style={styles.legTitle}>Walk to {toLabel}</Text>
                    <Text style={styles.legMeta}>
                      From {fromLabel} · {formatDuration(leg.seconds)}
                    </Text>
                  </View>
                  <Text style={styles.legChevron}>›</Text>
                </Pressable>
              );
            }

            const color = routeBlob[leg.routeName]?.route?.color ?? '#888';
            const shortName =
              routeBlob[leg.routeName]?.route?.shortName ?? leg.routeName;
            const isFocused = focusedBusId === `${leg.routeName}|${leg.busName}`;
            return (
              <Pressable
                key={`leg-${idx}`}
                onPress={() => onBusPress(leg.routeName, leg.busName)}
                style={({ pressed }) => [
                  styles.journeyLeg,
                  styles.journeyLegAlignTop,
                  isFocused && styles.journeyLegFocused,
                  pressed && styles.journeyLegPressed,
                ]}
              >
                <View style={[styles.legIcon, { backgroundColor: color }]}>
                  <Text style={styles.legIconText}>{shortName}</Text>
                </View>
                <View style={styles.legBody}>
                  <Text style={styles.legTitle}>
                    {leg.boardAt.name} → {leg.alightAt.name}
                  </Text>
                  <Text style={styles.legMeta}>
                    Bus {leg.busName} · {formatDuration(leg.seconds)}
                  </Text>
                </View>
                <Text style={styles.legChevron}>›</Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    lineHeight: 21,
  },
  panelSubtitle: { fontSize: 11, color: '#888', marginTop: 2 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 24, color: '#555', marginTop: -4 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f2',
  },
  closeBtnText: { fontSize: 14, color: '#555', fontWeight: '700' },
  warnBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fff5e0',
    borderWidth: 1,
    borderColor: '#ffd28c',
  },
  warnBannerText: { fontSize: 12, color: '#7a4a00' },
  maxBusesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  maxBusesLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  maxBusesChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    minWidth: 28,
    alignItems: 'center',
  },
  maxBusesChipActive: { backgroundColor: '#111', borderColor: '#111' },
  maxBusesChipText: { fontSize: 12, fontWeight: '700', color: '#666' },
  maxBusesChipTextActive: { color: '#fff' },
  arrivalsScroll: { flexGrow: 0 },
  arrivalsContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
  arrivalsEmpty: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 16,
    textAlign: 'center',
  },
  journeyLeg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  journeyLegAlignTop: {
    alignItems: 'flex-start',
  },
  journeyLegPressed: { backgroundColor: '#f2f2f2' },
  journeyLegFocused: {
    backgroundColor: '#fff8e1',
    borderColor: '#FFD700',
  },
  legIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legIconWalk: { backgroundColor: '#e5e5ea' },
  legIconText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  legIconEmoji: { fontSize: 16 },
  legBody: { flex: 1, minWidth: 0 },
  legTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    lineHeight: 17,
  },
  legMeta: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
    lineHeight: 15,
  },
  legChevron: { fontSize: 22, color: '#bbb', fontWeight: '300', marginLeft: 4 },
});