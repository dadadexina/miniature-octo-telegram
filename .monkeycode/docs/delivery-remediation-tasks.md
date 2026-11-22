# 交付整改任务清单

- 基线：`main @ 42a16d8`，版本 1.0.0，0 git tag
- 来源：四份审计（前端体验 / 后端安全 / 工程交付 / 产品路线）+ 既有 `delivery-checklist.md` 核实
- 原则：先复核再动手；改动前先 `git status`/`git diff`；每项完成需 `npm run lint`（0 errors）、`npm run test`、`npm run build` 全绿，涉及 SQL 同步 `src/lib/sql.js` 并提醒执行 `CLOUD_SQL`
- 负责标注：`我` = Agent 可直接做；`用户` = 需用户操作/授权；`共同` = 需先决策再实施

## 0. 复核审计结论（先做，避免误改）

> 四份审计与既有文档存在冲突，以下项先核实真实现状，再决定是否纳入整改。

- [x] **0.1 朋友圈点赞/评论是否落库** —— 结论：**已落库**。`src/lib/moments.js:105-151` 的 `likeMoment`/`unlikeMoment`/`addMomentComment`/`deleteMomentComment` 写 `moment_likes`/`moment_comments`，`fetchMomentInteractions` 读回；前端审计“纯前端未落库”不成立。仅需确认 UI 全走云端路径（本地演示降级除外）。
- [x] **0.2 通话链路真实度** —— 结论：**真实 WebRTC**。`src/lib/call.js:34-49` 配 STUN + OpenRelay TURN，`src/hooks/useVoiceCall.js:194` 用 `new RTCPeerConnection`；全仓无 `peerjs` 代码引用。`roadmap-to-production.md` 的“PeerJS 演示”已过时。沙箱出网白名单不含 openrelay，实际接通需真机双端验证。
- [ ] **0.3 备份与恢复现状**：`backup.yml` 已存在（每日 pg_dump → AES 加密 → artifact 30 天，含恢复命令注释）。确认 Secrets 是否仍在、补一次**恢复演练记录**（报告原称“0 备份”不准确）。负责：我
- [x] **0.4 `can_view_moment` 是否排除拉黑** —— 结论：**未排除**。`src/lib/schema_v2.js:181-188` 仅判 `author_id = auth.uid() or are_contacts(...)`，拉黑不解除好友关系，故拉黑后仍可见。需修复（见 3.2）。
- [x] **0.5 `friends` 是否有 `owner_id <> friend_id` 约束** —— 结论：**缺失**。`src/lib/friends.js` 的 `FRIENDS_SQL` 仅 `unique(owner_id, friend_id)`。需加约束（见 3.3）。
- [x] **0.6 `message_media` 桶公开性** —— 结论：**私有桶**。`src/lib/schema_v2.js:59` 建桶 `public = false`，读取走配对目录 RLS。无需改。
- [x] **0.7 关系函数 PUBLIC EXECUTE 权限** —— 结论：**PUBLIC 可执行**（四个函数 `proacl` 均为 `null`，即默认 PUBLIC EXECUTE，且均为 `SECURITY DEFINER`）。已通过 Management API 收紧（见 3.4），验证后 `proacl` 为 `{postgres=X/postgres,authenticated=X/postgres}`。负责：我

## 1. 环境隔离（P0，报告一致项）

- [ ] **1.1 拆分 Supabase 项目**：production 与 staging 两套独立项目。需用户在 Supabase 控制台创建 staging 项目并提供 URL/anon key（沙箱无 Management API token，无法代建）。负责：用户 + 共同
- [ ] **1.2 CI e2e 改指 staging**：`.github/workflows/ci.yml` 的 e2e job 构建与账号 secrets 全部换 staging，杜绝测试写生产库。负责：共同（依赖 1.1）
- [ ] **1.3 本地环境分层**：`.env.local` 保留 staging，新增 `.env.production.local`（gitignore）供生产；`.env.production` 仅留占位或改用平台注入，避免仓库内生产凭据。负责：我
- [ ] **1.4 CI verify job 补生产构建校验**：verify 的 `npm run build` 注入 staging 变量，验证真实配置构建（当前只构建演示模式）。负责：我
- [ ] **1.5 Vercel 环境变量核对**：确认生产项目注入 `VITE_SUPABASE_*` 指向 production，Preview 环境指向 staging。负责：共同

## 2. 数据变更治理（P0，需架构决策）

> 现状：无 `supabase/migrations/`，DDL 以 `src/lib/schema_v2.js` 的 `CLOUD_SQL` 幂等脚本为单一真源（`roadmap-to-production.md` 第 45 行明确此设计）。引入 migrations 会推翻既有运维方式，需用户选型。

- [ ] **2.0 选定方案**（二选一）：
  - 方案 A（轻量，推荐）：保留 `CLOUD_SQL` 真源，新增 `supabase/migrations/` 存每次变更的带时间戳 `.sql` 只读快照，用 `supabase db diff` 校验生产与真源一致。风险低，不动现有控制台执行流程。
  - 方案 B（标准）：正式改用 Supabase CLI migrations，`CLOUD_SQL` 变为迁移拼接产物，重写部署与文档流程。改动大。
  - 负责：用户决策
- [ ] **2.1 落地所选方案**：按 2.0 选型执行；若 A，补首个基线快照 + diff 校验脚本 + README 说明。负责：共同
- [ ] **2.2 迁移执行纳入 CI 校验**（仅 B 需要）：PR 上 `supabase db diff` 无漂移方可合并。负责：我

## 3. 安全与合规（P0，代码可做）

- [x] **3.1 注销清理 Storage 媒体** —— 已完成（commit `f2d4ccc`）：先删 `avatars/<uid>/`、`moments/<uid>/` 前缀与 `messages.attachments.path` 指向的 `message_media` 文件，再删账号；清理失败则中止。需重新部署 Edge Function 生效。
- [x] **3.2 朋友圈拉黑隔离** —— 已完成（commit `feb1970`）：`can_view_moment` 增加双向拉黑排除；需重跑 `CLOUD_SQL` 生效。
- [x] **3.3 好友自约束** —— 已完成（commit `feb1970`）：`friends` 增加 `friends_no_self` 约束 + 幂等补丁；需重跑 `CLOUD_SQL` 生效。
- [x] **3.4 关系函数权限收紧** —— 已完成：`src/lib/schema_v2.js` 与基线快照对四个函数加 `revoke execute ... from public, anon` + `grant ... to authenticated`；生产已执行，验证 `proacl` 仅含 `postgres` 与 `authenticated`。负责：我
- [x] **3.5 私有桶复核** —— 无需改：`message_media` 已是私有桶（`schema_v2.js:59`）。

## 4. 交付体验与合规文案（P0，代码可做）

- [x] **4.1 移除生产 SQL 入口** —— 已完成（commit `feb1970`）：`CopySql` 在 `!import.meta.env.DEV` 时返回 null。
- [x] **4.2 修正法律文案** —— 已完成（commit `feb1970`）：去除“演示”口径，更新日期 2026-11-22。
- [x] **4.3 非好友隐藏“发送信息”** —— 已完成（commit `feb1970`）：按 `friendMetaOf` 判定，非好友显示提示。
- [x] **4.4 朋友圈点赞/评论落库** —— 无需改：0.1 复核确认已落库（`moments.js:105-151`）。

## 5. 部署健壮性（P1）

- [x] **5.1 `vercel.json` 改 `npm ci`** —— 已完成（commit `b19a240`）。
- [ ] **5.2 修正 catch-all 状态码**：SPA rewrite 对未知资源返回正确状态。需先在 Vercel 预览验证改法，避免破坏 SPA 路由。负责：我（待验证）
- [x] **5.3 安全响应头** —— 已完成基础三项（commit `b19a240`）；CSP 待后续以 report-only 引入。
- [x] **5.4 健康检查端点** —— 已完成：`public/health.json`（commit `b19a240`），构建产物 `dist/health.json`。
- [x] **5.5 CI 并发控制** —— 已完成（commit `b19a240`）。

## 6. 产品功能（P1/F2，择机）

- [ ] **6.1 举报与屏蔽词**：打通现有黑名单，新增举报入口与敏感词过滤。负责：我
- [ ] **6.2 登录设备管理 + 账号冷静期**：会话列表、异地登录提醒、注销延迟执行。负责：我
- [ ] **6.3 收件摘要**：每日/每周聚合通知。负责：我
- [ ] **6.4 Web Push**：后台触达通道。负责：共同（需 VAPID/推送服务）
- [ ] **6.5 数据导出**：个人数据打包下载。负责：我

## 7. 性能与体验（P2）

- [ ] **7.1 长列表虚拟化**：消息/朋友圈大列表。负责：我
- [ ] **7.2 PWA 离线增强**：完善离线壳与缓存策略。负责：我
- [ ] **7.3 版本 tag 与发布说明**：建立 `vX.Y.Z` tag 与 CHANGELOG。负责：共同
- [ ] **7.4 监控告警策略**：基于 `client_errors` 建告警与看板。负责：共同

## 8. 暂不做

- 端到端加密（M4.4）：待用户规模与合规诉求明确后评估
- 多语言 i18n、帮助中心：当前用户群单一，非瓶颈

## 验收口径

- 内测放行：第 1、3、4 节全勾 + 一次恢复演练 + CI 全绿
- 公开注册：内测口径 + 第 5 节 + 6.1/6.2
- 正式运营：以上 + 第 6/7 节完成度按里程碑推进
