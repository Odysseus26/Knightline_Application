import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { Place } from '../../components/api';
import { placeColor } from './placeCategoryColor';

export default function PlaceIconMarker({
  place,
  selected,
  onPress,
}: {
  place: Place;
  selected: boolean;
  onPress: () => void;
}) {
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 100);
    return () => clearTimeout(t);
  }, [selected, place.id]);

  return (
    <Marker
      coordinate={{ latitude: place.lat, longitude: place.lng }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracks}
      zIndex={100}
      onPress={onPress}
    >
      <View style={[styles.pill, selected && styles.pillSelected]}>
        <View style={[styles.glyph, { backgroundColor: placeColor(place) }]} />
        {selected && (
          <Text style={styles.label} numberOfLines={1}>
            {place.name}
          </Text>
        )}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 4,
    maxWidth: 220,
  },
  pillSelected: {
    borderColor: '#CC0033',
    borderWidth: 2.5,
    paddingHorizontal: 8,
  },
  glyph: { width: 10, height: 10, borderRadius: 2 },
  label: { fontSize: 12, fontWeight: '700', color: '#111' },
});