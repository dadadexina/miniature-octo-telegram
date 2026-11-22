import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import GlobeScene from './GlobeScene';
import { useGlobeControls } from './useGlobeControls';

const DEFAULT_HOME = { lat: 39.9042, lng: 116.4074 };

/**
 * Reusable 3D globe network component.
 *
 * Props:
 * - friends: [{ id, name, lat, lng, color?, weather? }]
 * - home: { lat, lng } anchor the arcs connect from
 * - onNodePress(friend): called when a friend node is tapped
 * - style: extra container style
 */
export default function GlobeNetwork({ friends = [], home = DEFAULT_HOME, onNodePress, style }) {
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
        />
      </Canvas>
      <View style={StyleSheet.absoluteFill} {...panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030812',
  },
});
