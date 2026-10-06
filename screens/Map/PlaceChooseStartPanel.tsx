import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Place } from '../../components/api';


export default function PlaceChooseStartPanel({
  place,
  onUseCurrent,
  onPickSpecific,
  onBack,
  onClose,
}: {
  place: Place;
  onUseCurrent: () => void;
  onPickSpecific: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
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
          To {place.name}
        </Text>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
          hitSlop={12}
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Pressable
          onPress={onUseCurrent}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.primaryBtnText}>Route From Current Location</Text>
        </Pressable>
        <Pressable
          onPress={onPickSpecific}
          style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.outlineBtnText}>Route From Specific Location</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
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
  body: { padding: 16, gap: 10 },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#CC0033',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  outlineBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CC0033',
    alignItems: 'center',
  },
  outlineBtnText: { color: '#CC0033', fontSize: 14, fontWeight: '800' },
});