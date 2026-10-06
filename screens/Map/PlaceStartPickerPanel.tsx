import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Place,Stop } from '@/components/api';
import { searchPlaces } from '@/components/Location_Suite/places-search';
import type { StartPoint } from '../../hooks/useItinerary';

const CAP_PER_SECTION = 20;
const CAP_TOTAL_FILTERED = 30;

function rawStopKey(s: Stop): string {
  return s.sharedStopId || s.stopId || s.gtfsId || s.name;
}


function stopRowLabel(stop: Stop, all: Stop[]): string {
  const sameName = all.filter((s) => s.name === stop.name);
  if (sameName.length <= 1) return stop.name;

  const tts = stop.ttsStopName;
  if (tts && tts !== stop.name) return tts;
  if (/\(NB\)|\(SB\)|\(EB\)|\(WB\)/i.test(stop.name)) return stop.name;
  return `${stop.name} (${rawStopKey(stop).slice(-3)})`;
}

type Row =
  | { kind: 'stop'; stop: Stop; label: string; key: string }
  | { kind: 'place'; place: Place; label: string; key: string };


export default function PlaceStartPickerPanel({
  stops,
  places,
  onPick,
  onBack,
  onClose,
}: {
  stops: Stop[];
  places: Place[];
  onPick: (start: StartPoint) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const uniqueStops = useMemo(() => {
    const seen = new Map<string, Stop>();
    for (const s of stops) {
      const key = rawStopKey(s);
      if (!seen.has(key)) seen.set(key, s);
    }
    return Array.from(seen.values());
  }, [stops]);

  const q = query.trim().toLowerCase();

  const stopRows = useMemo<Row[]>(() => {
    const base = uniqueStops
      .map<Row>((stop) => ({
        kind: 'stop',
        stop,
        key: rawStopKey(stop),
        label: stopRowLabel(stop, uniqueStops),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (q.length < 2) return base.slice(0, CAP_PER_SECTION);
    return base.filter((r) => r.label.toLowerCase().includes(q));
  }, [uniqueStops, q]);

  const placeRows = useMemo<Row[]>(() => {
    if (q.length < 2) {
      return [...places]
        .sort((a, b) => {
          if (a.labelRank !== b.labelRank) return b.labelRank - a.labelRank;
          return a.name.localeCompare(b.name);
        })
        .slice(0, CAP_PER_SECTION)
        .map<Row>((place) => ({
          kind: 'place',
          place,
          key: place.id,
          label: place.name,
        }));
    }
    return searchPlaces(places, q, CAP_PER_SECTION).map<Row>(({ place }) => ({
      kind: 'place',
      place,
      key: place.id,
      label: place.name,
    }));
  }, [places, q]);

  const total = stopRows.length + placeRows.length;
  const overCap = q.length >= 2 && total > CAP_TOTAL_FILTERED;
  const stopSlice = overCap ? stopRows.slice(0, CAP_TOTAL_FILTERED) : stopRows;
  const placeSlice = overCap
    ? placeRows.slice(0, Math.max(0, CAP_TOTAL_FILTERED - stopSlice.length))
    : placeRows;

  const handle = (row: Row) => {
    if (row.kind === 'stop') onPick({ kind: 'stop', stop: row.stop });
    else onPick({ kind: 'place', placeId: row.place.id });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.wrap}
    >
      <View style={styles.panel}>
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            hitSlop={12}
          >
            <Text style={styles.iconBtnText}>‹</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            Route from…
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            hitSlop={12}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Search stops and buildings"
          placeholderTextColor="#999"
          style={styles.input}
        />

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>Stops</Text>
          {stopSlice.length === 0 ? (
            <Text style={styles.empty}>No stops match.</Text>
          ) : (
            stopSlice.map((row) => (
              <Pressable
                key={`s-${row.key}`}
                onPress={() => handle(row)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {row.label}
                </Text>
              </Pressable>
            ))
          )}

          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
            Buildings
          </Text>
          {placeSlice.length === 0 ? (
            <Text style={styles.empty}>No buildings match.</Text>
          ) : (
            placeSlice.map((row) => (
              <Pressable
                key={`p-${row.key}`}
                onPress={() => handle(row)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {row.label}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 24, color: '#555', marginTop: -4 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f2',
  },
  closeBtnText: { fontSize: 14, color: '#555', fontWeight: '700' },
  input: {
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f2f2f2',
    fontSize: 14,
    color: '#111',
  },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#888',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionLabelSpaced: { marginTop: 16 },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowPressed: { backgroundColor: '#f2f2f2' },
  rowLabel: { fontSize: 14, color: '#111' },
  empty: { fontSize: 12, color: '#999', fontStyle: 'italic', paddingVertical: 8 },
});