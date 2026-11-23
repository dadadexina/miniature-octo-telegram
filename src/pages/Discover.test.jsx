// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Discover from './Discover'

const FRIEND_A = '22222222-2222-4222-8222-222222222222'

const users = vi.hoisted(() => ({
  '11111111-1111-4111-8111-111111111111': { id: '11111111-1111-4111-8111-111111111111', nickname: '我', avatarUrl: '' },
  '22222222-2222-4222-8222-222222222222': { id: '22222222-2222-4222-8222-222222222222', nickname: '阿哲', avatarUrl: '' },
}))
const storeState = vi.hoisted(() => ({ friends: [] }))
const searchMock = vi.hoisted(() => vi.fn())
const planRouteMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/routing', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, planRoute: planRouteMock }
})

vi.mock('../lib/geocode', () => ({
  searchPlacesOnline: searchMock,
  mergePlaceResults: (online, local) => {
    const merged = [...online]
    local.forEach((place) => {
      if (!merged.some((item) => item.name === place.name)) merged.push(place)
    })
    return merged
  },
}))

vi.mock('../store', () => ({
  useStore: () => ({
    currentUser: users['11111111-1111-4111-8111-111111111111'],
    profile: { nickname: '我', avatarUrl: '', signature: '见字如面' },
    avatarColor: () => '#191919',
    getUser: (id) => users[id] || null,
    upsertUsers: vi.fn(),
    syncTick: 0,
    displayNameOf: (id) => users[id]?.nickname || '',
    friendsOf: () => storeState.friends,
    momentsFeed: () => [],
    publishMoment: vi.fn(() => ({ ok: true })),
  }),
}))

vi.mock('../lib/locations', () => ({
  fetchLocations: vi.fn(() => Promise.resolve({ ok: true, locations: [] })),
}))

function setup() {
  render(
    <MemoryRouter initialEntries={['/discover']}>
      <Discover />
    </MemoryRouter>
  )
}

let writeText
let geoWatch

beforeEach(() => {
  localStorage.clear()
  storeState.friends = [users[FRIEND_A]]
  vi.stubGlobal('WebGLRenderingContext', undefined)
  writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  searchMock.mockReset()
  searchMock.mockResolvedValue({ ok: true, places: [] })
  planRouteMock.mockReset()
  planRouteMock.mockImplementation(({ mode }) =>
    Promise.resolve({
      mode,
      distanceKm: 1.4,
      durationMin: mode === 'driving' ? 4 : 18,
      coordinates: [
        [121.4737, 31.2304],
        [121.48, 31.235],
        [121.49, 31.24],
      ],
      fallback: false,
    })
  )
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn(() => Promise.resolve({ state: 'prompt' })) },
  })
  geoWatch = { success: null, error: null, cleared: 0 }
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success) =>
        success({
          coords: { latitude: 31.2304, longitude: 121.4737, accuracy: 6.4 },
          timestamp: Date.now(),
        }),
      watchPosition: (success, error) => {
        geoWatch.success = success
        geoWatch.error = error
        return 7
      },
      clearWatch: () => {
        geoWatch.cleared += 1
      },
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Discover 关系网页', () => {
  it('展示关系地球、标题与实时天气，且移除信息流互动', async () => {
    setup()
    expect(await screen.findByTestId('relationship-globe')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '关系网' })).toBeTruthy()
    expect(screen.getByTestId('globe-weather').textContent).toContain('此刻')
    expect(screen.queryByTestId('like-btn')).toBeNull()
    expect(screen.queryByTestId('comment-btn')).toBeNull()
    expect(screen.queryByTestId('discover-write')).toBeNull()
    expect(screen.queryByTestId('route-card')).toBeNull()
  })

  it('复制按钮把经纬度写入剪贴板', async () => {
    setup()
    const copy = await screen.findByTestId('globe-copy-coords')
    fireEvent.click(copy)
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain('°')
    await waitFor(() => expect(screen.getByTestId('globe-copy-coords').textContent).toBe('已复制'))
  })

  it('不支持地图渲染时以关系列表兜底展示好友', async () => {
    setup()
    expect(await screen.findByTestId('globe-fallback')).toBeTruthy()
    expect(screen.getByText('阿哲')).toBeTruthy()
  })

  it('首次进入提示授权，允许后显示精准经纬度且刷新不再弹提示', async () => {
    setup()
    const allow = await screen.findByTestId('globe-locate-allow')
    fireEvent.click(allow)
    await waitFor(() =>
      expect(screen.getByTestId('globe-coords').textContent).toContain('N 31.230400°  E 121.473700°')
    )
    expect(screen.getByTestId('globe-coords').textContent).toContain('±6.4 m')
    expect(screen.queryByTestId('globe-locate-prompt')).toBeNull()
    expect(localStorage.getItem('globe.geoAsked')).toBe('1')

    cleanup()
    setup()
    await waitFor(() => expect(screen.getByTestId('relationship-globe')).toBeTruthy())
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(screen.queryByTestId('globe-locate-prompt')).toBeNull()
  })

  it('选中搜索结果先展示目的地，不自动进入导航', async () => {
    searchMock.mockResolvedValue({
      ok: true,
      places: [
        {
          id: 'osm:1',
          name: '外滩',
          detail: '黄浦区 · 上海',
          lat: 31.24,
          lng: 121.49,
          kind: 'attraction',
          source: 'osm',
        },
      ],
    })
    setup()
    fireEvent.click(await screen.findByTestId('globe-search-toggle'))
    fireEvent.change(await screen.findByTestId('globe-search-input'), { target: { value: '外滩' } })
    const result = await screen.findByTestId('globe-place-result')
    expect(result.textContent).toContain('外滩')
    expect(result.textContent).toContain('黄浦区 · 上海')
    fireEvent.click(result)
    const card = await screen.findByTestId('globe-place-preview')
    expect(card.textContent).toContain('目的地 外滩')
    expect(card.textContent).toContain('开车约')
    expect(card.textContent).toContain('步行约')
    expect(screen.queryByTestId('globe-route-info')).toBeNull()
    expect(planRouteMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('globe-open-maps')).toBeNull()
    expect(screen.getByTestId('globe-route-drive')).toBeTruthy()
    expect(screen.getByTestId('globe-route-walk')).toBeTruthy()
  })

  it('点击步行导航后规划步行路线并显示全程与时长', async () => {
    searchMock.mockResolvedValue({
      ok: true,
      places: [{ id: 'osm:1', name: '外滩', detail: '黄浦区 · 上海', lat: 31.24, lng: 121.49, kind: 'attraction' }],
    })
    setup()
    fireEvent.click(await screen.findByTestId('globe-search-toggle'))
    fireEvent.change(await screen.findByTestId('globe-search-input'), { target: { value: '外滩' } })
    fireEvent.click(await screen.findByTestId('globe-place-result'))
    fireEvent.click(await screen.findByTestId('globe-route-walk'))
    const title = await screen.findByTestId('globe-route-title')
    await waitFor(() => expect(title.textContent).toContain('步行导航 · 外滩'))
    await waitFor(() =>
      expect(screen.getByTestId('globe-route-status').textContent).toContain('全程 1.4 km')
    )
    expect(screen.getByTestId('globe-route-status').textContent).toContain('约 18 分钟')
    expect(screen.getByTestId('globe-route-status').textContent).toContain('向')
    expect(screen.getByTestId('globe-route-mode').textContent).toBe('导航中')
    expect(planRouteMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'walking' }))
    expect(screen.queryByTestId('globe-open-maps')).toBeNull()
    expect(screen.getByTestId('globe-route-clear').textContent).toBe('结束导航')
  })

  it('点击开车导航改用开车路线并可在导航中切换方式', async () => {
    searchMock.mockResolvedValue({
      ok: true,
      places: [{ id: 'osm:4', name: '外滩', lat: 31.24, lng: 121.49, kind: 'attraction' }],
    })
    setup()
    fireEvent.click(await screen.findByTestId('globe-search-toggle'))
    fireEvent.change(await screen.findByTestId('globe-search-input'), { target: { value: '外滩' } })
    fireEvent.click(await screen.findByTestId('globe-place-result'))
    fireEvent.click(await screen.findByTestId('globe-route-drive'))
    const title = await screen.findByTestId('globe-route-title')
    await waitFor(() => expect(title.textContent).toContain('开车导航 · 外滩'))
    await waitFor(() =>
      expect(screen.getByTestId('globe-route-status').textContent).toContain('约 4 分钟')
    )
    expect(planRouteMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'driving' }))
    expect(screen.getByTestId('globe-mode-drive').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByTestId('globe-mode-walk'))
    await waitFor(() => expect(title.textContent).toContain('步行导航 · 外滩'))
    expect(planRouteMock).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'walking' }))
    expect(screen.getByTestId('globe-mode-walk').getAttribute('aria-pressed')).toBe('true')
  })

  it('授权后持续接收实时定位并更新坐标', async () => {
    setup()
    fireEvent.click(await screen.findByTestId('globe-locate-allow'))
    await waitFor(() => expect(screen.getByTestId('globe-coords').textContent).toContain('31.230400'))
    await waitFor(() => expect(typeof geoWatch.success).toBe('function'))
    act(() => {
      geoWatch.success({
        coords: { latitude: 31.2311, longitude: 121.4742, accuracy: 3.2 },
        timestamp: Date.now(),
      })
    })
    await waitFor(() =>
      expect(screen.getByTestId('globe-coords').textContent).toContain('N 31.231100°  E 121.474200°')
    )
    expect(screen.getByTestId('globe-coords').textContent).toContain('±3.2 m')
  })

  it('支持输入经纬度并直接导航到坐标', async () => {
    setup()
    fireEvent.click(await screen.findByTestId('globe-search-toggle'))
    fireEvent.change(await screen.findByTestId('globe-search-input'), {
      target: { value: '31.2304, 121.4737' },
    })
    const result = await screen.findByTestId('globe-place-result')
    expect(result.textContent).toContain('坐标 31.230400, 121.473700')
    fireEvent.click(result)
    const card = await screen.findByTestId('globe-place-preview')
    expect(card.textContent).toContain('目的地 坐标 31.230400, 121.473700')
    expect(screen.queryByTestId('globe-search-sheet')).toBeNull()
    fireEvent.click(screen.getByTestId('globe-route-walk'))
    const title = await screen.findByTestId('globe-route-title')
    await waitFor(() => expect(title.textContent).toContain('步行导航 · 坐标 31.230400, 121.473700'))
  })

  it('定位失败时导航条提示原因并可重试', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_success, error) => error({ code: 1 }),
        watchPosition: () => 9,
        clearWatch: () => {},
      },
    })
    searchMock.mockResolvedValue({
      ok: true,
      places: [{ id: 'osm:2', name: '人民广场', detail: '黄浦区', lat: 31.233, lng: 121.475, kind: 'attraction' }],
    })
    setup()
    fireEvent.click(await screen.findByTestId('globe-search-toggle'))
    fireEvent.change(await screen.findByTestId('globe-search-input'), { target: { value: '人民广场' } })
    fireEvent.click(await screen.findByTestId('globe-place-result'))
    fireEvent.click(await screen.findByTestId('globe-route-walk'))
    const status = await screen.findByTestId('globe-route-status')
    await waitFor(() => expect(status.textContent).toContain('定位权限被拒绝'))
    expect(screen.getByTestId('globe-route-locate')).toBeTruthy()
    expect(status.textContent).not.toContain('正在获取我的位置')
    expect(planRouteMock).not.toHaveBeenCalled()
  })

  it('到达目的地附近时提示已到达', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success) =>
          success({
            coords: { latitude: 31.2304, longitude: 121.4737, accuracy: 4 },
            timestamp: Date.now(),
          }),
        watchPosition: () => 3,
        clearWatch: () => {},
      },
    })
    searchMock.mockResolvedValue({
      ok: true,
      places: [{ id: 'osm:3', name: '目的地', lat: 31.2304, lng: 121.4737, kind: 'poi' }],
    })
    setup()
    fireEvent.click(await screen.findByTestId('globe-locate-allow'))
    await waitFor(() => expect(screen.getByTestId('globe-coords').textContent).toContain('31.230400'))
    fireEvent.click(screen.getByTestId('globe-search-toggle'))
    fireEvent.change(screen.getByTestId('globe-search-input'), { target: { value: '目的地' } })
    fireEvent.click(await screen.findByTestId('globe-place-result'))
    fireEvent.click(await screen.findByTestId('globe-route-walk'))
    const info = await screen.findByTestId('globe-route-info')
    await waitFor(() => expect(info.textContent).toContain('已到达目的地附近'))
    expect(screen.getByTestId('globe-route-mode').textContent).toBe('已到达')
  })
})
