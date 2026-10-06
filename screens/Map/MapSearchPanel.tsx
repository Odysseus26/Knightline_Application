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
import type { Place, Stop } from '../../components/api';
import { searchPlaces } from '@/components/Location_Suite/places-search';

export type SearchTarget = {
  lat: number;
  lng: number;
  label: string;
  stopKey?: string;
  placeId?: string;
  placeRank?: number;
};

function stopKeyOf(s: Stop): string {
  return s.sharedStopId || s.stopId || s.gtfsId || s.name;
}

const STOP_FILTERED_CAP = 15;
const PLACE_FILTERED_CAP = 20;
const STOP_EMPTY_CAP = 8;
const PLACE_EMPTY_CAP = 12;

export default function MapSearchPanel({
  stops,
  places,
  onPick,
  onClose,
}: {
  stops: Stop[];
  places: Place[];
  onPick: (target: SearchTarget) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const storableStops = useMemo(
    () => stops.filter((s) => s.location != null),
    [stops],
  );

  const stopResults = useMemo<Stop[]>(() => {
    if (q.length === 0) {
      return [...storableStops]
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, STOP_EMPTY_CAP);
    }
    return storableStops
      .filter((s) => s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, STOP_FILTERED_CAP);
  }, [storableStops, q]);

  const placeResults = useMemo<Place[]>(() => {
    if (q.length < 2) {
      return [...places]
        .sort((a, b) => {
          if (a.labelRank !== b.labelRank) return b.labelRank - a.labelRank;
          return a.name.localeCompare(b.name);
        })
        .slice(0, PLACE_EMPTY_CAP);
    }
    return searchPlaces(places, query, PLACE_FILTERED_CAP).map((m) => m.place);
  }, [places, q, query]);

  const total = stopResults.length + placeResults.length;

  const handleStop = (stop: Stop) => {
    if (!stop.location) return;
    onPick({
      lat: stop.location.lat,
      lng: stop.location.lng,
      label: stop.name,
      stopKey: stopKeyOf(stop),
    });
  };

  const handlePlace = (place: Place) => {
    onPick({
      lat: place.lat,
      lng: place.lng,
      label: place.name,
      placeId: place.id,
      placeRank: place.labelRank,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.wrap}
    >
      <View style={styles.panel}>
        <View style={styles.header}>
          <Text style={styles.title}>Search</Text>
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

        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Search buildings and stops"
          placeholderTextColor="#999"
          style={styles.input}
        />

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {total === 0 ? (
            <Text style={styles.empty}>No matches.</Text>
          ) : (
            <>
              {stopResults.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Stops</Text>
                  {stopResults.map((stop) => (
                    <Pressable
                      key={`s-${stopKeyOf(stop)}`}
                      onPress={() => handleStop(stop)}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <Text style={styles.rowLabel} numberOfLines={1}>
                        {stop.name}
                      </Text>
                    </Pressable>
                  ))}
                </>
              )}

              {placeResults.length > 0 && (
                <>
                  <Text
                    style={[
                      styles.sectionLabel,
                      stopResults.length > 0 && styles.sectionLabelSpaced,
                    ]}
                  >
                    Buildings
                  </Text>
                  {placeResults.map((place) => (
                    <Pressable
                      key={`p-${place.id}`}
                      onPress={() => handlePlace(place)}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <Text style={styles.rowLabel} numberOfLines={1}>
                        {place.name}
                      </Text>
                      {place.categories.length > 0 && (
                        <Text style={styles.rowSublabel} numberOfLines={1}>
                          {place.categories.join(' · ')}
                        </Text>
                      )}
                    </Pressable>
                  ))}
                </>
              )}
            </>
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
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
  rowSublabel: { fontSize: 11, color: '#999', marginTop: 2 },
  empty: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
});