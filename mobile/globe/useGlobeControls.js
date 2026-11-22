import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';

const ROTATE_SPEED = 0.005;
const ZOOM_SPEED = 0.004;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.6;
const MAX_LAT = 1.3;
const TAP_SLOP = 6;

/**
 * Imperative gesture controls for the globe. The returned `controls` ref is
 * mutated directly and read inside `useFrame` for smooth (lerped) motion.
 */
export function useGlobeControls({ onTap } = {}) {
  const controls = useRef({
    lon: 0,
    lat: 0.15,
    zoom: 1,
    targetLon: 0,
    targetLat: 0.15,
    targetZoom: 1,
    dragging: false,
  });

  const drag = useRef({ lastDx: 0, lastDy: 0, pinchDist: 0 });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          drag.current = { lastDx: 0, lastDy: 0, pinchDist: 0 };
          controls.current.dragging = true;
        },
        onPanResponderMove: (evt, gesture) => {
          const touches = evt.nativeEvent.touches;

          if (touches && touches.length >= 2) {
            const a = touches[0];
            const b = touches[1];
            const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            if (drag.current.pinchDist === 0) {
              drag.current.pinchDist = dist;
              return;
            }
            const delta = dist - drag.current.pinchDist;
            drag.current.pinchDist = dist;
            controls.current.targetZoom = clamp(
              controls.current.targetZoom * (1 + delta * ZOOM_SPEED),
              MIN_ZOOM,
              MAX_ZOOM,
            );
            return;
          }

          const dx = gesture.dx - drag.current.lastDx;
          const dy = gesture.dy - drag.current.lastDy;
          drag.current.lastDx = gesture.dx;
          drag.current.lastDy = gesture.dy;

          controls.current.targetLon += dx * ROTATE_SPEED;
          controls.current.targetLat = clamp(
            controls.current.targetLat + dy * ROTATE_SPEED,
            -MAX_LAT,
            MAX_LAT,
          );
        },
        onPanResponderRelease: (evt, gesture) => {
          controls.current.dragging = false;
          if (Math.hypot(gesture.dx, gesture.dy) < TAP_SLOP && onTap) {
            const x = evt.nativeEvent.locationX ?? gesture.x0;
            const y = evt.nativeEvent.locationY ?? gesture.y0;
            onTap(x, y);
          }
        },
        onPanResponderTerminate: () => {
          controls.current.dragging = false;
        },
      }),
    [onTap],
  );

  return { controls, panHandlers: panResponder.panHandlers };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
