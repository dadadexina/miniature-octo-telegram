import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import GlobeScene from './GlobeScene';
import { useGlobeControls } from './useGlobeControls';

const DEFAULT_HOME = { lat: 39.9042, lng: 116.4074 };

const MODES = [
  { key: 'satellite', label: '卫星' },
  { key: 'explore', label: '探索' },
];

/**
 * Reusable 3D globe network component.
 *
 * Props:
 * - friends: [{ id, name, lat, lng, color?, weather? }]
 * - home: { lat, lng } anchor the arcs connect from
 * - onNodePress(friend): called when a friend node is tapped
 * - initialMode: 'satellite' | 'explore'
 * - style: extra container style
 */
export default function GlobeNetwork({
  friends = [],
  home = DEFAULT_HOME,
  onNodePress,
  initialMode = 'satellite',
  style,
}) {
  const [mode, setMode] = useState(initialMode);
  const sceneApi = useRef(null);

  const handleTap = useCallback(
    (x, y) => {
      const friend = sceneApi.current?.pick(x, y);
      if (friend) onNodePress?.(friend);
    },
    [onNodePress],
  );

  const { controls, panHandlers } = useGlobeControls({ onTap: handleTap });

  const handleReady = useCallback((api) => {
    sceneApi.current = api;
  }, []);

  return (
    <View style={[styles.container, style]}>
      <Canvas
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0, 3], fov: 45, near: 0.1, far: 100 }}
      >
        <GlobeScene
          friends={friends}
          home={home}
          controls={controls}
          onReady={handleReady}
          mode={mode}
        />
      </Canvas>
      <View style={StyleSheet.absoluteFill} {...panHandlers} />
      <View style={styles.modeBar} pointerEvents="box-none">
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => setMode(m.key)}
              style={[styles.modeButton, active && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030812',
  },
  modeBar: {
    position: 'absolute',
    top: 60,
    right: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 20,
    padding: 3,
  },
  modeButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 17,
  },
  modeButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  modeText: {
    color: '#eaf2f8',
    fontSize: 14,
    fontWeight: '500',
  },
  modeTextActive: {
    color: '#1b2733',
    fontWeight: '700',
  },
});
