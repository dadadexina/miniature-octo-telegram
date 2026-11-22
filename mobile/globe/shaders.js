const NOISE_GLSL = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = p * 2.0 + vec3(1.7, 9.2, 5.1);
      amplitude *= 0.5;
    }
    return value;
  }
`;

export const earthVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Apple Maps-style natural-color earth: bright water, soft vegetation/desert
// land, polar ice and a gentle, low-contrast daylight terminator.
export const earthFragment = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform vec3 uWaterDeep;
  uniform vec3 uWaterShallow;
  uniform vec3 uLandLow;
  uniform vec3 uLandHigh;
  uniform vec3 uSnow;
  uniform float uNoiseScale;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  ${NOISE_GLSL}

  void main() {
    vec3 n = normalize(vNormal);
    vec3 dir = normalize(vWorldPosition);

    float continent = fbm(dir * uNoiseScale);
    float landMask = smoothstep(0.47, 0.60, continent);

    float detail = fbm(dir * uNoiseScale * 3.0 + vec3(4.2, 7.3, 1.9));

    float lat = dir.y;
    float polar = smoothstep(0.60, 0.85, abs(lat));

    // Water: shallow turquoise near the equator -> deeper blue near the poles.
    vec3 water = mix(uWaterDeep, uWaterShallow, 1.0 - abs(lat) * 0.85);

    // Land: lowland vegetation -> highland sand/rock.
    float elevation = smoothstep(0.28, 0.72, detail);
    vec3 land = mix(uLandLow, uLandHigh, elevation);

    // Snow on high mountains and polar ice caps.
    float mountainSnow = smoothstep(0.68, 0.90, detail);
    float snow = clamp(polar * 0.9 + mountainSnow * 0.7, 0.0, 1.0);
    land = mix(land, uSnow, snow);
    water = mix(water, uSnow, polar * 0.85);

    vec3 surface = mix(water, land, landMask);

    // Gentle, mostly-ambient lighting with a soft half-lambert falloff.
    vec3 sun = normalize(uSunDirection);
    float ndl = dot(n, sun);
    float light = ndl * 0.30 + 0.70;
    surface *= light;

    // Subtle sun glint on water.
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float spec = pow(max(dot(reflect(-sun, n), viewDir), 0.0), 48.0);
    surface += (1.0 - landMask) * spec * 0.35;

    gl_FragColor = vec4(surface, 1.0);
  }
`;

export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const atmosphereFragment = /* glsl */ `
  uniform vec3 uAtmosphereColor;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - abs(dot(viewDirection, normalize(vNormal))), 3.0);
    gl_FragColor = vec4(uAtmosphereColor, fresnel * 0.65);
  }
`;

export const cloudVertex = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const cloudFragment = /* glsl */ `
  uniform float uNoiseScale;
  uniform float uTime;

  varying vec3 vWorldPosition;

  ${NOISE_GLSL}

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float t = uTime * 0.015;
    float c = fbm(dir * uNoiseScale + vec3(t, t * 0.6, 0.0));
    float clouds = smoothstep(0.58, 0.74, c);
    float polar = smoothstep(0.6, 0.92, abs(dir.y));
    clouds *= 1.0 - polar * 0.85;
    gl_FragColor = vec4(vec3(1.0), clouds * 0.9);
  }
`;
