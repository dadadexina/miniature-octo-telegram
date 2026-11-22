import * as THREE from 'three';
import { useMemo } from 'react';
import { buildArcLine, colorFromKey, latLngToVector3 } from './geometry';

const HIT_RADIUS = 0.075;

/**
 * Friends network overlay: home marker, curved connection arcs and clickable
 * friend nodes rendered on the unit globe surface.
 *
 * `hitMeshes` is a ref array that receives the invisible hit spheres so the
 * parent scene can raycast taps against them.
 */
export default function FriendNetwork({ friends = [], home, radius = 1, hitMeshes }) {
  const homePos = useMemo(
    () => latLngToVector3(home.lat, home.lng, radius),
    [home.lat, home.lng, radius],
  );

  const nodes = useMemo(
    () =>
      friends.map((friend) => ({
        friend,
        position: latLngToVector3(friend.lat, friend.lng, radius),
      })),
    [friends, radius],
  );

  const arcs = useMemo(
    () =>
      nodes.map(({ friend, position }) => {
        const geometry = buildArcLine(homePos, position, radius, 0.22, 64);
        const material = new THREE.LineBasicMaterial({
          color: colorFromKey(friend.id),
          transparent: true,
          opacity: 0.55,
        });
        return new THREE.Line(geometry, material);
      }),
    [nodes, homePos, radius],
  );

  return (
    <group>
      {arcs.map((arc, i) => (
        <primitive key={`arc-${nodes[i].friend.id}`} object={arc} />
      ))}

      {nodes.map(({ friend, position }, i) => (
        <group key={friend.id} position={position}>
          <mesh
            ref={(el) => {
              if (hitMeshes) hitMeshes.current[i] = el;
            }}
            visible={false}
            userData={{ friend }}
          >
            <sphereGeometry args={[HIT_RADIUS, 8, 8]} />
            <meshBasicMaterial />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.018, 16, 16]} />
            <meshBasicMaterial color={colorFromKey(friend.id)} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.034, 16, 16]} />
            <meshBasicMaterial
              color={colorFromKey(friend.id)}
              transparent
              opacity={0.25}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}

      <group position={homePos}>
        <mesh>
          <sphereGeometry args={[0.028, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshBasicMaterial color="#6ad4ff" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
