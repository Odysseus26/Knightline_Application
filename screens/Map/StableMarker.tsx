import React, { useEffect, useState } from 'react';
import { Marker } from 'react-native-maps';
import MultiColorPin from './MultiColorPin';

type RLMapCoord = { latitude: number; longitude: number };

export default function StableMarker({
  coordinate,
  colors,
  size = 34,
  title,
  description,
  onPress,
}: {
  coordinate: RLMapCoord;
  colors: string[];
  size?: number;
  title?: string;
  description?: string;
  onPress?: () => void;
}) {
  const [tracks, setTracks] = useState(true);
  const colorKey = colors.join(',');

  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 100);
    return () => clearTimeout(t);
  }, [colorKey, size]);

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      onPress={onPress}
      title={onPress ? undefined : title}
      description={onPress ? undefined : description}
    >
      <MultiColorPin colors={colors} size={size} />
    </Marker>
  );
}