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
