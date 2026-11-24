export const POI_CATEGORIES = [
  {
    id: 'all',
    label: '全部',
    classes: [],
  },
  {
    id: 'food',
    label: '餐饮',
    classes: [
      'restaurant',
      'cafe',
      'fast_food',
      'bar',
      'pub',
      'food_court',
      'ice_cream',
      'bakery',
    ],
  },
  {
    id: 'lodging',
    label: '酒店',
    classes: ['lodging', 'hotel', 'motel', 'hostel', 'guest_house', 'apartment'],
  },
  {
    id: 'shopping',
    label: '购物',
    classes: ['shop', 'marketplace', 'convenience', 'supermarket', 'mall', 'department_store'],
  },
  {
    id: 'attraction',
    label: '景点',
    classes: [
      'attraction',
      'museum',
      'art_gallery',
      'viewpoint',
      'theme_park',
      'zoo',
      'aquarium',
      'castle',
      'monument',
      'memorial',
      'picnic_site',
      'camp_site',
    ],
  },
  {
    id: 'transit',
    label: '交通',
    classes: ['airport', 'bus', 'rail', 'ferry', 'tram', 'subway'],
  },
  {
    id: 'community',
    label: '小区',
    classes: [],
  },
]

export const POI_LAYER_IDS = ['poi_r20', 'poi_r7', 'poi_r1', 'poi_transit']

const POI_LAYER_MIN_ZOOM = {
  poi_r20: 16,
  poi_r7: 14.5,
  poi_r1: 13.5,
  poi_transit: 11.5,
}

const CATEGORY_BY_ID = new Map(POI_CATEGORIES.map((category) => [category.id, category]))

export function poiCategoryOf(id) {
  return CATEGORY_BY_ID.get(String(id || '')) || CATEGORY_BY_ID.get('all')
}

export function poiCategoryClasses(id) {
  return poiCategoryOf(id).classes
}

export function poiLayerVisible(layerId, categoryId) {
  if (!POI_LAYER_IDS.includes(layerId)) return false
  if (categoryId === 'community') return false
  if (categoryId === 'transit') return layerId === 'poi_transit'
  if (layerId === 'poi_transit') return categoryId === 'all'
  return true
}

export function buildPoiFilter(originalFilter, categoryId) {
  const category = poiCategoryOf(categoryId)
  if (!category.classes.length) return originalFilter || null
  const classFilter = ['match', ['get', 'class'], category.classes, true, false]
  return originalFilter ? ['all', originalFilter, classFilter] : classFilter
}

const originalFilters = new WeakMap()

function originalFilterOf(map, layerId, layer) {
  let byLayer = originalFilters.get(map)
  if (!byLayer) {
    byLayer = new Map()
    originalFilters.set(map, byLayer)
  }
  if (!byLayer.has(layerId)) byLayer.set(layerId, layer.filter || null)
  return byLayer.get(layerId)
}

export function applyPoiLayers(map, categoryId, theme) {
  if (!map || !theme) return
  const category = poiCategoryOf(categoryId)
  let layers
  try {
    layers = map.getStyle()?.layers || []
  } catch {
    return
  }
  const byId = new Map(layers.map((layer) => [layer.id, layer]))

  for (const layerId of POI_LAYER_IDS) {
    const layer = byId.get(layerId)
    if (!layer) continue
    const visible = poiLayerVisible(layerId, category.id)
    try {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
      if (!visible) continue
      map.setLayerZoomRange(layerId, POI_LAYER_MIN_ZOOM[layerId] || layer.minzoom || 0, 24)
      map.setFilter(layerId, buildPoiFilter(originalFilterOf(map, layerId, layer), category.id))
      map.setLayoutProperty(layerId, 'text-field', [
        'coalesce',
        ['get', 'name:nonlatin'],
        ['get', 'name'],
        ['get', 'name_en'],
      ])
      map.setLayoutProperty(layerId, 'text-anchor', 'center')
      map.setLayoutProperty(layerId, 'text-offset', [0, 0])
      map.setLayoutProperty(layerId, 'text-max-width', 8)
      map.setLayoutProperty(layerId, 'text-padding', 2)
      map.setLayoutProperty(layerId, 'icon-size', 0)
      map.setLayoutProperty(layerId, 'text-size', [
        'interpolate',
        ['linear'],
        ['zoom'],
        11.5,
        9,
        14,
        10,
        17,
        11.5,
      ])
      map.setPaintProperty(layerId, 'icon-opacity', 0)
      map.setPaintProperty(layerId, 'text-color', theme.labelText)
      map.setPaintProperty(layerId, 'text-halo-color', theme.labelHalo)
      map.setPaintProperty(layerId, 'text-halo-width', 1.3)
      map.setPaintProperty(layerId, 'text-halo-blur', 0.4)
      map.setPaintProperty(layerId, 'text-opacity', 1)
    } catch {
      // 单个图层不可用时继续处理其余图层
    }
  }
}
