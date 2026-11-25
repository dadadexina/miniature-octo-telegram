# Design Document

## 1. 目标

将发现页地球页从 MapLibre 单文件重写为自研 Canvas 2D 正交投影地球，移除全部第三方底图与署名，保留全部既有交互功能，并将代码拆分为模块。

## 2. 架构

```
src/lib/discover/geometry.js      # 纯几何：正交投影、大圆弧、节点/弧线构建、坐标包装
src/features/discover/
  engine/globeEngine.js           # 框架无关 Canvas 2D 引擎（渲染 + 交互 + 动画循环）
  GlobeCanvas.jsx                 # <canvas> 挂载 + 引擎生命周期
  useGlobeEngine.js               # 引擎 hook（主题/resize/数据同步）
  useGeolocation.js               # 定位：权限、单次、持续监听
  usePlaceSearch.js               # 地名/经纬度搜索（防抖 + 本地 + 在线合并）
  useRoutePlanning.js             # 目的地预览 + 路线规划状态机
  useWeather.js                   # 天气查询（跟随视野中心/我的位置）
  useClock.js                     # 每分钟时间戳
  FriendCard.jsx                  # 好友卡片（发消息/语音/敲一敲/主页/飞到/共同好友）
  CitySheet.jsx                   # 城市漫游抽屉
  SearchSheet.jsx                 # 搜索抽屉
  RoutePanel.jsx                  # 路线规划/导航面板
  LocationPanel.jsx               # 我的位置 + 经纬度读数 + 定位提示
  GlobeFallback.jsx               # 不支持渲染时的关系列表
src/components/DiscoverGlobe.jsx  # 顶层装配（约 100 行）
```

## 3. 渲染引擎

- 正交投影（含纬向倾斜）：`x = cosφ·sinΔλ`，`y = sinφ·cosφ0 − cosφ·sinφ0·cosΔλ`，`z = sinφ·sinφ0 + cosφ·cosφ0·cosΔλ`，`z ≥ 0` 为前半球。
- 经纬网格：赤道 + 经线（步长 30°）+ 纬线（步长 30°），采样后按前半球裁剪。
- 关系弧线：大圆插值（64 步）后投影，按前半球分段。
- 节点：投影后绘制圆点与名称，带命中测试（pointerdown 命中半径）。
- 交互：水平拖动旋转经度、垂直拖动调整倾斜（±60°）、滚轮缩放（0.6–3）、惯性衰减、交互后 2.6s 暂停自转；存在我的位置或导航目的地时暂停自转。
- 主题：从 `document.documentElement.dataset.theme` 读取，映射到纸墨配色。

## 4. 状态与数据流

- `Discover.jsx` 继续负责好友/关系/位置数据源（`useLocatedPeople`、`useLinks`）。
- `DiscoverGlobe.jsx` 作为装配层，用 `useGeolocation`、`usePlaceSearch`、`useRoutePlanning`、`useWeather`、`useClock` 组合状态，通过 `useGlobeEngine` 把节点/弧线/路线/目的地同步进引擎。
- 引擎通过 `onPickNode`、`onDragEnd` 等回调把交互事件回传 React。

## 5. 兼容与测试

- 保留全部 `data-testid` 与现有状态机语义；`Discover.test.jsx` 中的 fallback 路径由「Canvas 2D 不可用」触发（jsdom 下 `getContext('2d')` 返回 null，等价于旧 WebGL 检测）。
- 新增 `geometry.test.js` 覆盖投影、前半球裁剪、大圆弧、节点构建。
- 移除 `maplibre-gl` 依赖；保留 `mapGlobe.js`、`mapStyle.js`、`globe.js` 及对应测试作为遗留（不再被地球页引用）。

## 6. 实施阶段

1. 纯几何库 + 单测。
2. Canvas 引擎 + 交互。
3. 拆 hook（定位/搜索/路线/天气/时钟）。
4. 拆展示组件 + 顶层装配。
5. 全量测试 + lint + build + 5173 预览。
