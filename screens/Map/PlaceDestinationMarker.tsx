import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { Place } from '../../components/api';

export default function PlaceDestinationMarker({ place }: { place: Place }) {
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setTracks(false), 150);
    return () => clearTimeout(t);
  }, [place.id]);

  return (
    <Marker
      coordinate={{ latitude: place.lat, longitude: place.lng }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracks}
      zIndex={400}
    >
      <View style={styles.wrap}>
        <View style={styles.head} />
        <View style={styles.tail} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  head: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#CC0033',
    borderWidth: 3,
    borderColor: '#fff',
  },
  tail: {
    marginTop: -4,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#CC0033',
  },
});