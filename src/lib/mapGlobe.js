export const MAP_THEMES = {
  light: {
    paper: '#f4f3ee',
    surface: '#f1f0eb',
    water: '#dde4e6',
    waterLine: '#c4ced1',
    waterLabel: '#7f8c90',
    park: '#e9ece3',
    landuse: '#efeee8',
    building: '#e6e4dc',
    boundary: '#c9c7bf',
    roadCasing: '#e8e6df',
    roadMajor: '#7c7b75',
    roadPrimary: '#96958e',
    roadSecondary: '#b0afa7',
    roadMinor: '#cbcac2',
    sub: '#5c5c5c',
    labelText: '#191919',
    labelHalo: '#f4f3ee',
    arcBase: '#1f7fdc',
    arcActive: '#0fb4f0',
    me: '#d08a12',
  },
  sepia: {
    paper: '#fdf6e3',
    surface: '#f5eeda',
    water: '#e6dcc2',
    waterLine: '#d3c4a2',
    waterLabel: '#9a7f5a',
    park: '#efe6cc',
    landuse: '#f3ecd8',
    building: '#efe7d2',
    boundary: '#d3c3a3',
    roadCasing: '#efe4cc',
    roadMajor: '#8a7359',
    roadPrimary: '#a58c6e',
    roadSecondary: '#c0a988',
    roadMinor: '#d8c9ad',
    sub: '#6f5d4b',
    labelText: '#3b2f25',
    labelHalo: '#fdf6e3',
    arcBase: '#c8681c',
    arcActive: '#f08a2a',
    me: '#a9410f',
  },
  moss: {
    paper: '#f7f3e3',
    surface: '#efebd9',
    water: '#dbe3d2',
    waterLine: '#c2cbae',
    waterLabel: '#6f8468',
    park: '#e7ecda',
    landuse: '#eef0e0',
    building: '#e9eedd',
    boundary: '#c2cbae',
    roadCasing: '#e6ead8',
    roadMajor: '#5f7358',
    roadPrimary: '#7b8f71',
    roadSecondary: '#9fb091',
    roadMinor: '#c3cfb5',
    sub: '#5c6a5e',
    labelText: '#3c473e',
    labelHalo: '#f7f3e3',
    arcBase: '#2f9c60',
    arcActive: '#2fd07e',
    me: '#1c6b3e',
  },
  blue: {
    paper: '#eceff4',
    surface: '#e5e9f0',
    water: '#d3dfec',
    waterLine: '#bcc6d6',
    waterLabel: '#6a7f99',
    park: '#e2e8ea',
    landuse: '#e8ecf1',
    building: '#e1e5ee',
    boundary: '#bcc6d6',
    roadCasing: '#e0e5ec',
    roadMajor: '#5f7591',
    roadPrimary: '#7c8fa8',
    roadSecondary: '#9caec3',
    roadMinor: '#c3ccd9',
    sub: '#4c566a',
    labelText: '#2e3440',
    labelHalo: '#eceff4',
    arcBase: '#2f8fe6',
    arcActive: '#1fc2ee',
    me: '#1c5f9e',
  },
  dark: {
    paper: '#121212',
    surface: '#232323',
    water: '#1b2733',
    waterLine: '#2b3a48',
    waterLabel: '#5f7791',
    park: '#1a1f18',
    landuse: '#191919',
    building: '#1a1a1a',
    boundary: '#3a3a3a',
    roadCasing: '#1d1d1d',
    roadMajor: '#6a6a6a',
    roadPrimary: '#555555',
    roadSecondary: '#404040',
    roadMinor: '#2e2e2e',
    sub: '#b9b8b1',
    labelText: '#edede6',
    labelHalo: '#121212',
    arcBase: '#5fc6ff',
    arcActive: '#caf6ff',
    me: '#ffd166',
  },
}

export function mapTheme(id) {
  return MAP_THEMES[id] || MAP_THEMES.light
}

export function roadKind(layerId) {
  const id = String(layerId || '')
  if (id.includes('casing')) return 'casing'
  if (id.includes('motorway') || id.includes('trunk')) return 'major'
  if (id.includes('primary')) return 'primary'
  if (id.includes('secondary') || id.includes('tertiary')) return 'secondary'
  return 'minor'
}

export function roadColor(theme, layerId) {
  const kind = roadKind(layerId)
  if (kind === 'casing') return theme.roadCasing
  if (kind === 'major') return theme.roadMajor
  if (kind === 'primary') return theme.roadPrimary
  if (kind === 'secondary') return theme.roadSecondary
  return theme.roadMinor
}

export function isHiddenLayer(layer) {
  const id = layer?.id || ''
  const sourceLayer = layer?.['source-layer'] || ''
  if (layer?.type === 'raster' || layer?.type === 'fill-extrusion') return true
  if (sourceLayer === 'aerodrome_label') return true
  if (id === 'road_one_way_arrow' || id === 'road_one_way_arrow_opposite') return true
  return false
}

function setPaint(map, id, prop, value) {
  try {
    map.setPaintProperty(id, prop, value)
  } catch {
    // 该图层不支持此属性时忽略
  }
}

export function applyMapTheme(map, themeId) {
  const theme = mapTheme(themeId)
  let style
  try {
    style = map.getStyle()
  } catch {
    return
  }
  if (!style || !Array.isArray(style.layers)) return

  for (const layer of style.layers) {
    const id = layer.id
    const sourceLayer = layer['source-layer'] || ''
    try {
      if (isHiddenLayer(layer)) {
        map.setLayoutProperty(id, 'visibility', 'none')
        continue
      }
      if (layer.type === 'background') {
        setPaint(map, id, 'background-color', theme.paper)
        continue
      }
      if (layer.type === 'fill') {
        if (sourceLayer === 'water') {
          setPaint(map, id, 'fill-color', theme.water)
          setPaint(map, id, 'fill-outline-color', theme.waterLine)
        } else if (sourceLayer === 'building') {
          setPaint(map, id, 'fill-color', theme.building)
          setPaint(map, id, 'fill-opacity', 0.55)
        } else if (sourceLayer === 'park' || sourceLayer === 'landcover') {
          setPaint(map, id, 'fill-color', theme.park)
          setPaint(map, id, 'fill-opacity', 0.6)
        } else if (sourceLayer === 'landuse') {
          setPaint(map, id, 'fill-color', theme.landuse)
          setPaint(map, id, 'fill-opacity', 0.5)
        } else if (sourceLayer === 'aeroway') {
          setPaint(map, id, 'fill-color', theme.surface)
          setPaint(map, id, 'fill-opacity', 0.6)
        } else {
          setPaint(map, id, 'fill-color', theme.surface)
        }
        continue
      }
      if (layer.type === 'line') {
        if (sourceLayer === 'transportation') {
          setPaint(map, id, 'line-color', roadColor(theme, id))
        } else if (sourceLayer === 'waterway') {
          setPaint(map, id, 'line-color', theme.waterLine)
        } else if (sourceLayer === 'aeroway') {
          setPaint(map, id, 'line-color', theme.roadMinor)
        } else {
          setPaint(map, id, 'line-color', theme.boundary)
        }
        continue
      }
      if (layer.type === 'symbol') {
        if (sourceLayer === 'place') {
          setPaint(map, id, 'text-color', theme.labelText)
          setPaint(map, id, 'text-halo-color', theme.labelHalo)
          setPaint(map, id, 'text-halo-width', 1.4)
        } else if (sourceLayer === 'water_name' || sourceLayer === 'waterway') {
          setPaint(map, id, 'text-color', theme.waterLabel)
          setPaint(map, id, 'text-halo-color', theme.paper)
        } else if (sourceLayer === 'transportation_name') {
          setPaint(map, id, 'text-color', theme.sub)
          setPaint(map, id, 'text-halo-color', theme.paper)
        } else {
          setPaint(map, id, 'text-color', theme.sub)
          setPaint(map, id, 'text-halo-color', theme.paper)
        }
      }
    } catch {
      // 单个图层异常不影响其余图层
    }
  }
}

const DEG = Math.PI / 180

export function greatCircleLine(a, b, steps = 64) {
  const lat1 = a.lat * DEG
  const lng1 = a.lng * DEG
  const lat2 = b.lat * DEG
  const lng2 = b.lng * DEG
  const x1 = Math.cos(lat1) * Math.cos(lng1)
  const y1 = Math.cos(lat1) * Math.sin(lng1)
  const z1 = Math.sin(lat1)
  const x2 = Math.cos(lat2) * Math.cos(lng2)
  const y2 = Math.cos(lat2) * Math.sin(lng2)
  const z2 = Math.sin(lat2)
  const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2))
  const omega = Math.acos(dot)
  if (omega < 1e-6) {
    return [
      [a.lng, a.lat],
      [b.lng, b.lat],
    ]
  }
  const sinOmega = Math.sin(omega)
  const coords = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const s1 = Math.sin((1 - t) * omega) / sinOmega
    const s2 = Math.sin(t * omega) / sinOmega
    const x = s1 * x1 + s2 * x2
    const y = s1 * y1 + s2 * y2
    const z = s1 * z1 + s2 * z2
    const lat = Math.atan2(z, Math.hypot(x, y)) / DEG
    const lng = Math.atan2(y, x) / DEG
    coords.push([lng, lat])
  }
  return coords
}

export function pseudoCoords(id) {
  let hash = 2166136261
  const text = String(id || '')
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const a = (hash >>> 0) / 4294967296
  const b = ((hash >>> 11) >>> 0) / 4294967296
  return { lat: -55 + a * 110, lng: -180 + b * 360 }
}

export function buildNodes(people = [], me = {}) {
  const nodes = []
  const seen = new Set()
  const meLat = Number.isFinite(me.coords?.lat) ? me.coords.lat : pseudoCoords(me.id || 'me').lat
  const meLng = Number.isFinite(me.coords?.lng) ? me.coords.lng : pseudoCoords(me.id || 'me').lng
  const meId = me.id || '__me'
  nodes.push({ id: meId, name: me.name || '你', lat: meLat, lng: meLng, me: true })
  seen.add(meId)
  for (const person of people) {
    if (!person?.id || seen.has(person.id)) continue
    seen.add(person.id)
    const fallback = pseudoCoords(person.id)
    nodes.push({
      id: person.id,
      name: person.name || '朋友',
      lat: Number.isFinite(person.lat) ? person.lat : fallback.lat,
      lng: Number.isFinite(person.lng) ? person.lng : fallback.lng,
      me: false,
    })
  }
  return nodes
}

export function buildArcsGeoJSON(nodes = [], links = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const features = []
  for (const pair of links) {
    if (!Array.isArray(pair) || pair.length !== 2) continue
    const from = byId.get(pair[0])
    const to = byId.get(pair[1])
    if (!from || !to) continue
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: greatCircleLine(from, to) },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function buildRouteLine(route) {
  const coordinates = Array.isArray(route?.coordinates) ? route.coordinates : []
  const valid =
    coordinates.length >= 2 &&
    coordinates.every(
      (coord) => Array.isArray(coord) && Number.isFinite(coord[0]) && Number.isFinite(coord[1])
    )
  if (!valid) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          mode: route.mode === 'driving' ? 'driving' : 'walking',
          fallback: Boolean(route.fallback),
        },
        geometry: { type: 'LineString', coordinates },
      },
    ],
  }
}
