import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import GlobeNetwork from './globe/GlobeNetwork';

const HOME = { lat: 39.9042, lng: 116.4074 };

const FRIENDS = [
  { id: 'tokyo', name: 'Tokyo', lat: 35.6762, lng: 139.6503, weather: 'rain' },
  { id: 'london', name: 'London', lat: 51.5074, lng: -0.1278, weather: 'snow' },
  { id: 'nyc', name: 'New York', lat: 40.7128, lng: -74.006, weather: 'sunny' },
  { id: 'sf', name: 'San Francisco', lat: 37.7749, lng: -122.4194, weather: 'cloudy' },
  { id: 'sydney', name: 'Sydney', lat: -33.8688, lng: 151.2093, weather: 'sunny' },
  { id: 'sao-paulo', name: 'Sao Paulo', lat: -23.5505, lng: -46.6333, weather: 'rain' },
];

export default function App() {
  const [selected, setSelected] = useState(null);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <GlobeNetwork friends={FRIENDS} home={HOME} onNodePress={setSelected} />
      {selected ? (
        <View pointerEvents="none" style={styles.badge}>
          <Text style={styles.badgeText}>{selected.name}</Text>
        </View>
      ) : null}
      <View pointerEvents="none" style={styles.hint}>
        <Text style={styles.hintText}>Drag to rotate · Pinch to zoom · Tap a node</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030812',
  },
  badge: {
    position: 'absolute',
    top: 64,
    alignSelf: 'center',
    backgroundColor: 'rgba(58, 168, 255, 0.25)',
    borderColor: '#6ad4ff',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#eaf6ff',
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
  hintText: {
    color: 'rgba(234, 246, 255, 0.55)',
    fontSize: 12,
  },
});
