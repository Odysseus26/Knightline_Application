import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Place } from '../../components/api';
import { placeColor } from './placeCategoryColor';

const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export default function PlaceDetailPanel({
  place,
  onRouteHere,
  onClose,
}: {
  place: Place;
  onRouteHere: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: placeColor(place) }]} />
        <Text style={styles.title} numberOfLines={1}>
          {place.name}
        </Text>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
          hitSlop={12}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {place.categories.length > 0 && (
          <View style={styles.chipRow}>
            {place.categories.map((c) => (
              <View key={c} style={styles.chip}>
                <Text style={styles.chipText}>{titleCase(c)}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.coords}>
          {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
        </Text>
      </ScrollView>

      <Pressable
        onPress={onRouteHere}
        style={({ pressed }) => [styles.routeBtn, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.routeBtnText}>Route Here</Text>
      </Pressable>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 10,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
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
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
  },
  chipText: { fontSize: 12, color: '#333', fontWeight: '600' },
  coords: { fontSize: 11, color: '#999', fontVariant: ['tabular-nums'] },
  routeBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#CC0033',
    alignItems: 'center',
  },
  routeBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});