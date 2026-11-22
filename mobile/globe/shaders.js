export const earthVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const earthFragment = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform vec3 uOceanColor;
  uniform vec3 uLandColor;
  uniform vec3 uNightLightColor;
  uniform float uNoiseScale;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

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

  void main() {
    vec3 n = normalize(vNormal);
    vec3 sun = normalize(uSunDirection);
    float dayFactor = dot(n, sun);

    vec3 dir = normalize(vWorldPosition);
    float land = fbm(dir * uNoiseScale);
    float landMask = smoothstep(0.46, 0.62, land);

    vec3 surface = mix(uOceanColor, uLandColor, landMask);

    // Ocean gets a subtle specular sheen on the day side.
    float oceanSpecular = pow(max(dot(reflect(-sun, n), normalize(-vWorldPosition)), 0.0), 24.0);
    surface += (1.0 - landMask) * oceanSpecular * 0.4;

    // Night side: dim the surface and add warm city lights on land.
    float night = smoothstep(-0.15, 0.25, -dayFactor);
    float cityMask = landMask * smoothstep(0.5, 0.7, land) * (0.4 + 0.6 * noise(dir * 6.0));
    vec3 nightColor = surface * 0.06 + uNightLightColor * cityMask * 1.6;

    float mixFactor = clamp(dayFactor * 0.5 + 0.5, 0.0, 1.0);
    vec3 color = mix(nightColor, surface, mixFactor);

    // Soft terminator band tint.
    float terminator = 1.0 - smoothstep(0.0, 0.3, abs(dayFactor));
    color += vec3(0.9, 0.55, 0.3) * terminator * 0.15;

    gl_FragColor = vec4(color, 1.0);
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
    float fresnel = pow(1.0 - abs(dot(viewDirection, normalize(vNormal))), 2.0);
    gl_FragColor = vec4(uAtmosphereColor, fresnel);
  }
`;
