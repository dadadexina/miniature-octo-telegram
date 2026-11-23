import * as THREE from 'three';

/**
 * Convert latitude/longitude (degrees) to a point on a sphere.
 * y-up convention: lat 90 = north pole, lng 0 = +x direction.
 */
export function latLngToVector3(lat, lng, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Build a curved arc (great-circle-like) between two points on a sphere,
 * raised above the surface by `arcHeight` as a fraction of the radius.
 */
export function buildArcCurve(start, end, radius = 1, arcHeight = 0.25) {
  const mid = start.clone().add(end).multiplyScalar(0.5);
  if (mid.lengthSq() < 1e-6) {
    mid.set(0, radius, 0);
  }
  mid.normalize().multiplyScalar(radius * (1 + arcHeight));
  return new THREE.CatmullRomCurve3([start, mid, end]);
}

/** Create line geometry for an arc with `segments` samples. */
export function buildArcLine(start, end, radius = 1, arcHeight = 0.25, segments = 64) {
  const curve = buildArcCurve(start, end, radius, arcHeight);
  return new THREE.BufferGeometry().setFromPoints(curve.getPoints(segments));
}

/**
 * Create arc line geometry carrying a per-vertex `aProgress` (0..1) attribute
 * so a shader can animate a flowing dash / travel pulse along the arc.
 */
export function buildArcFlowLine(start, end, radius = 1, arcHeight = 0.22, segments = 96) {
  const curve = buildArcCurve(start, end, radius, arcHeight);
  const points = curve.getPoints(segments);
  const positions = new Float32Array(points.length * 3);
  const progress = new Float32Array(points.length);
  points.forEach((p, i) => {
    positions.set([p.x, p.y, p.z], i * 3);
    progress[i] = i / (points.length - 1);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));
  return geometry;
}

/**
 * Procedural street grid around a city, built on the tangent plane at
 * (lat, lng) and projected back onto the sphere. Returns line-segments
 * geometry suitable for `<lineSegments>`.
 */
export function buildStreetGrid(lat, lng, radius = 1, halfSize = 0.06, spacing = 0.015, lift = 1.001) {
  const up = latLngToVector3(lat, lng, radius).normalize();
  const reference = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const east = new THREE.Vector3().crossVectors(reference, up).normalize();
  const north = new THREE.Vector3().crossVectors(up, east).normalize();

  const toPoint = (x, y) =>
    up
      .clone()
      .addScaledVector(east, x)
      .addScaledVector(north, y)
      .normalize()
      .multiplyScalar(radius * lift);

  const lines = [];
  const SAMPLES = 8;
  for (let y = -halfSize; y <= halfSize + 1e-6; y += spacing) {
    const line = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const x = -halfSize + (s / SAMPLES) * 2 * halfSize;
      line.push(toPoint(x, y));
    }
    lines.push(line);
  }
  for (let x = -halfSize; x <= halfSize + 1e-6; x += spacing) {
    const line = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const y = -halfSize + (s / SAMPLES) * 2 * halfSize;
      line.push(toPoint(x, y));
    }
    lines.push(line);
  }

  const positions = [];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      positions.push(line[i].x, line[i].y, line[i].z);
      positions.push(line[i + 1].x, line[i + 1].y, line[i + 1].z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/** Deterministic pseudo-random color from a string key. */
export function colorFromKey(key, saturation = 0.75, lightness = 0.6) {
  let hash = 0;
  const s = String(key);
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return new THREE.Color().setHSL(hue / 360, saturation, lightness);
}
