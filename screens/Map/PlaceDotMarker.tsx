import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { Place } from '../../components/api';
import { placeColor } from './placeCategoryColor';

export default function PlaceDotMarker({
  place,
  size,
  onPress,
}: {
  place: Place;
  size: number;
  onPress: () => void;
}) {
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 100);
    return () => clearTimeout(t);
  }, [size, place.id]);

  return (
    <Marker
      coordinate={{ latitude: place.lat, longitude: place.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      zIndex={100}
      onPress={onPress}
    >
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: placeColor(place),
          },
        ]}
      />
    </Marker>
  );
}

const styles = StyleSheet.create({
  dot: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 1.5,
    elevation: 2,
  },
});