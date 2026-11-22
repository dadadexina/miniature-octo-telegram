import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber/native';
import FriendNetwork from './FriendNetwork';
import { latLngToVector3 } from './geometry';
import {
  atmosphereFragment,
  atmosphereVertex,
  earthFragment,
  earthVertex,
} from './shaders';

const SUN_DIRECTION = new THREE.Vector3(1, 0.35, 0.6).normalize();

function Stars({ count = 800, radius = 9 }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(radius);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [count, radius]);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        color="#cfdfff"
        size={0.025}
        sizeAttenuation
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </points>
  );
}

function Weather({ home, radius = 1, count = 140 }) {
  const pointsRef = useRef(null);

  const geometry = useMemo(() => {
    const origin = latLngToVector3(home.lat, home.lng, radius);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.5;
      positions[i * 3 + 1] = origin.y + Math.random() * 0.6;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [home.lat, home.lng, radius, count]);

  useFrame((_, delta) => {
    const g = pointsRef.current?.geometry;
    if (!g) return;
    const attr = g.attributes.position;
    const origin = latLngToVector3(home.lat, home.lng, radius);
    const speed = delta * 0.15;
    for (let i = 0; i < count; i++) {
      let y = attr.array[i * 3 + 1] - speed;
      if (y < origin.y - 0.05) y = origin.y + 0.6;
      attr.array[i * 3 + 1] = y;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#bfe3ff"
        size={0.012}
        sizeAttenuation
        transparent
        opacity={0.8}
        depthWrite={false}
      />
    </points>
  );
}

/**
 * Full 3D scene: procedural earth, rim atmosphere, starfield, the friends
 * network and a weather particle placeholder. Exposes `pick(x, y)` through
 * `onReady` for tap-to-select of friend nodes.
 */
export default function GlobeScene({ friends = [], home, controls, onReady }) {
  const { camera, size } = useThree();
  const globeRef = useRef(null);
  const hitMeshes = useRef([]);

  const earthUniforms = useMemo(
    () => ({
      uSunDirection: { value: SUN_DIRECTION.clone() },
      uOceanColor: { value: new THREE.Color('#0a2a4a') },
      uLandColor: { value: new THREE.Color('#1d4d3a') },
      uNightLightColor: { value: new THREE.Color('#ffb74d') },
      uNoiseScale: { value: 1.6 },
    }),
    [],
  );

  const atmosphereUniforms = useMemo(
    () => ({
      uAtmosphereColor: { value: new THREE.Color('#3aa8ff') },
    }),
    [],
  );

  useEffect(() => {
    if (!onReady) return undefined;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const api = {
      pick: (px, py) => {
        ndc.set((px / size.width) * 2 - 1, -(py / size.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(hitMeshes.current.filter(Boolean), false);
        return hits.length ? hits[0].object.userData.friend : null;
      },
    };
    onReady(api);
    return () => onReady(null);
  }, [onReady, camera, size]);

  useFrame((_, delta) => {
    const c = controls.current;
    const t = 1 - Math.exp(-delta * 6);
    c.lon += (c.targetLon - c.lon) * t;
    c.lat += (c.targetLat - c.lat) * t;
    c.zoom += (c.targetZoom - c.zoom) * t;

    if (globeRef.current) {
      globeRef.current.rotation.y = c.lon;
      globeRef.current.rotation.x = c.lat;
    }

    camera.position.set(0, 0, 3 * c.zoom);
    camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <Stars />
      <group ref={globeRef}>
        <mesh>
          <sphereGeometry args={[1, 64, 64]} />
          <shaderMaterial
            vertexShader={earthVertex}
            fragmentShader={earthFragment}
            uniforms={earthUniforms}
          />
        </mesh>
        <mesh scale={1.025}>
          <sphereGeometry args={[1, 48, 48]} />
          <shaderMaterial
            vertexShader={atmosphereVertex}
            fragmentShader={atmosphereFragment}
            uniforms={atmosphereUniforms}
            side={THREE.BackSide}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <FriendNetwork friends={friends} home={home} radius={1} hitMeshes={hitMeshes} />
        <Weather home={home} radius={1} />
      </group>
    </>
  );
}
