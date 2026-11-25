# Requirements Document

## Introduction

本需求为「纸墨信笺」发现页的地球页做整页重构：彻底移除高德地图、CARTO、OpenStreetMap、MapLibre 底图及一切署名控件，改用自研的 Canvas 2D 正交投影地球（仅经纬网格，不绘制大陆轮廓），并保留好友节点/弧线、城市漫游、天气、地名搜索、路线导航、敲一敲、世界聊天、定位等全部既有功能，同时将 1886 行的单文件拆分为可测试的模块。

## Glossary

- **地球页**：路由 `/discover` 下「关系网」页面中的地图区域，即 `DiscoverGlobe` 组件。
- **正交投影地球**：以画布绘制，将经纬度投影到面向观察者的球面半球，可拖动旋转、缩放、自动自转。
- **经纬网格**：程序化生成的赤道、经线、纬线，无任何外部地图数据。
- **关系节点**：好友（含自己）在地球上的定位点。
- **关系弧线**：好友之间（含我与好友）的球面大圆弧连线。

## Requirements

### Requirement 1

**User Story:** AS 用户，I want 看到符合纸墨风格的可交互旋转地球，so that 页面成为纯粹的视觉与交互展示页。

#### Acceptance Criteria

1. WHEN 用户打开关系网页，THE System SHALL 显示自研 Canvas 2D 正交投影地球。
2. WHEN 地球渲染，THE System SHALL 仅绘制经纬网格、关系节点与关系弧线，不绘制任何大陆轮廓。
3. WHEN 地球渲染，THE System SHALL 不请求任何外部地图瓦片、不显示任何署名或版权控件。
4. WHEN 用户拖动球面，THE System SHALL 旋转视角并带有惯性。
5. WHEN 用户滚轮或双指缩放，THE System SHALL 缩放地球。
6. WHEN 无定位且无导航时，THE System SHALL 让地球缓慢自动自转。

### Requirement 2

**User Story:** AS 用户，I want 在地球上看到自己与好友的关系节点和弧线，so that 我能直观了解关系分布。

#### Acceptance Criteria

1. WHEN 有好友共享位置，THE System SHALL 在地球对应位置显示好友节点及名称。
2. WHEN 我共享了位置，THE System SHALL 显示我的节点，且样式区别于好友。
3. WHEN 存在好友关系，THE System SHALL 绘制连接双方的大圆弧线。
4. WHEN 点击好友节点，THE System SHALL 打开该好友卡片并聚焦相关弧线。
5. WHEN 未共享位置的好友，THE System SHALL 显示降级节点并标注未共享位置。

### Requirement 3

**User Story:** AS 用户，I want 城市漫游、天气、搜索、路线、定位、敲一敲、世界聊天保持可用，so that 重构不丢失既有功能。

#### Acceptance Criteria

1. WHEN 用户点击城市漫游，THE System SHALL 展示按城市分组的好友并支持进入/退出某城市。
2. WHEN 用户搜索地名或经纬度，THE System SHALL 展示搜索结果并支持选中目的地。
3. WHEN 用户选择出行方式，THE System SHALL 规划真实路线并显示全程与时长。
4. WHEN 用户开启定位，THE System SHALL 获取并持续更新精准经纬度。
5. WHEN 用户点击敲一敲，THE System SHALL 发送敲一敲并反馈结果。
6. WHEN 用户打开世界频道，THE System SHALL 进入世界聊天。

### Requirement 4

**User Story:** AS 用户，I want 在地图渲染不可用时仍能使用关系列表，so that 功能始终可用。

#### Acceptance Criteria

1. WHEN 环境不支持 Canvas 渲染，THE System SHALL 切换为关系列表兜底展示。
2. WHEN 用户点击兜底列表项，THE System SHALL 打开对应好友卡片。

### Requirement 5

**User Story:** AS 开发者，I want 地球页拆分为可测试的模块，so that 维护与回归成本降低。

#### Acceptance Criteria

1. THE System SHALL 将正交投影、大圆弧线、节点构建等纯几何逻辑置于独立模块并配备单元测试。
2. THE System SHALL 将渲染引擎、定位、搜索、路线、天气、城市、好友卡片拆分为独立 hook 或组件。
3. THE System SHALL 保持现有全部测试通过。
