# 交付任务清单（2026-11-20 审计）

审计范围：`main` 分支 `6326c80`，云端 Supabase 项目 `ljlvqnhzewzxpyhgumnp`。
已具备：代码入库 + CI 全绿、RLS/外键/索引/长度约束、ErrorBoundary、环境变量分离、31 个单元测试、资料/搜索/好友/消息全链路实测通过、README。

## P0 — 不修不能交付

- [x] **1. 忘记密码找回**：Login 入口 + `resetPasswordForEmail` + `/reset-password` 重置页已实现；经 Management API 确认 `uri_allow_list` 已含 `<域名>/reset-password` 与 `<域名>/login`、`site_url` 为预览域名 ｜ 剩余仅用户用真实邮箱走通一次重置闭环
- [x] **2. 注册邮箱验证**：signUp 带 `emailRedirectTo`、无 session 显示等待验证提示；`mailer_autoconfirm=false`（Confirm email 已开），注册探针返回 pending（`identities:[]`、无 access_token）验证通过
- [x] **3. 账号注销**：Edge Function `delete-account` 已用 CLI 部署上线（实测无令牌 401 / anon 401 invalid token），「我的」页两步确认 + 级联清理已实现
- [x] **4. 隐私政策 / 用户协议**：`/legal/terms`、`/legal/privacy` 页面，登录页与「我的」页已挂链接
- [x] **5. LICENSE**：MIT（仓库根目录，如需换协议告知）
- [x] **2b. 邮件服务 SMTP 配置**：已启用自有 SMTP（QQ `smtp.qq.com:465`，Username=Sender=`471092554@qq.com`）。原授权码格式错误被 QQ 判 535，直连 AUTH 验证正确的 16 位授权码返回 235 后，经 Management API PATCH `smtp_pass`，注册探针端到端发信恢复（status 200 / PASS）
- [x] **6. 正式托管**：Vercel git 集成部署成功（2026-11-20），生产域名 `https://miniature-octo-telegram-puce.vercel.app`（200：标题/manifest/sw.js/SPA 兜底全正常，`.env.production` + `vercel.json` 零配置生效）。注：Vercel 项目子域带随机颜色后缀（-puce），无后缀裸域名属他人占位（探测返回 451 勿误判）｜ Supabase Auth URL Configuration 已切生产域名（Management API 核实：site_url + login/reset-password 重定向 4 条齐备，预览域名保留双跑）

## P1 — 交付后一周内

- [x] **7. 删除好友**：已实现 —— `friends_delete_own` 策略 + `grant delete` 并入 CLOUD_SQL（2026-11-20 用户已重跑生效）；`deleteFriend()`；store `removeFriend` 同步清理本地好友镜像对、本机会话消息、收件箱与未读；通讯录「编辑」模式行内确认删除 ｜ 边界：单向删除（对方云端记录保留）；云端历史消息未删除，重新登录后该会话可能随收件箱重新出现，彻底删除列为 P2
- [x] **8. e2e 测试**：Playwright 已接入（`npm run test:e2e`，webServer 自动拉起 preview:4173），全量 8 例全过：`e2e/public.spec.js` 公开页 6 例 + `e2e/chat.spec.js` 云端双人聊天流 2 例（登录/搜索加好友/发消息/未读角标+预览往返）。云端账号由 `e2e/provision-accounts.mjs`（mail.tm 一次性邮箱）自动开通，GitHub Secrets 9 项已配齐（VITE_SUPABASE_* + E2E_USER_A/B_*）。期间修复两个真实缺陷：ChatDetail 竞态（云端对快速发送误入本地路径，`cloudReady` 强制云端发送）与会话未读角标缺失（新增 `readAt` 本地已读水位，`mergeInbox` 重算未读）
- [x] **9. 错误监控**：轻量自建方案已上线（`41a179b`）：`client_errors` 表（insert-only RLS）+ `src/lib/telemetry.js` 限流上报（12 条/60s、同键 5s 冷却）+ window.onerror / unhandledrejection / ErrorBoundary 捕获，`__APP_VERSION__` 随版本注入 ｜ **可选升级**：接入 Sentry 需用户提供 DSN
- [x] **10. 分包优化**：`manualChunks` 拆出 react / supabase vendor；构建产物主 chunk gzip 14.53KB、react 59.28KB、supabase 59.72KB，均低于 80KB 目标
- [x] **11. 数据备份**：全链路闭环（2026-11-20 实测绿）。`BACKUP_ENCRYPTION_KEY` + `SUPABASE_DB_URL` 均已配齐；DB 密码经 Management API `PATCH /database/password` 轮换（旧密码作废），连接串走 Supavisor **Session 模式 `aws-1-ap-northeast-1.pooler.supabase.com:5432`**（`db.*.supabase.co` 仅 IPv6，runner/沙箱不可达；aws-0 无此租户）。workflow_dispatch 实测：pg_dump 17.12 全库 438KB（含 auth/storage/public 全部核心表）→ AES-256 加密 → artifact `db-backup-*`（30 天）。runner 自带 client 16 低于服务端会拒 dump，已改 PGDG 源装最新客户端 ｜ 密钥副本：`当前工作区/.monkeycode/secrets/backup-key.txt` 与 `db-url.txt`（均 gitignore），**待用户转存后提醒删除令牌与副本风险自控**

## P2 — 可选

- [x] **12. 头像上传**：`avatars` Storage bucket（公开只读、每人仅写自己 `<uid>/` 目录，策略并入 CLOUD_SQL）+ `profiles.avatar_url` 列；EditProfile 选图 → canvas 降采样 256px JPEG → 上传 → 写入云端；本地演示模式降级存 dataURL；全站 Avatar 组件支持图片（灰度滤镜、加载失败回退首字块）；云端缺列时提示重跑 SQL ｜ 云端已生效（2026-11-20 用户重跑 CLOUD_SQL，REST 探针确认 `avatars` bucket 存在且公开可读、`client_errors` 表存在）
- [x] **13. PWA 离线**：`vite-plugin-pwa`（generateSW，registerType autoUpdate）预缓存 16 项静态资源，离线可打开应用壳并读取 localStorage 缓存会话；保留现有 `public/manifest.webmanifest`（`manifest: false` 不重复生成），`navigateFallback: '/index.html'` 兜底 SPA 路由；构建产物 `sw.js` + `registerSW.js` 自动注入
- [x] **14. CD 自动部署**：随 #6 Vercel git 集成闭环——import 后 commit `9110e5b` 自动构建发布，GitHub commit status 上 Vercel 检查 = success；后续每次 push main 自动上线
- [x] **15. 消息撤回/删除**：2026-11-20 投产波次用户决策启动并完成——撤回 ≤2 分钟（RLS `messages_update_recall` 窗口校验 + `recalled_at`，双端 realtime 显示占位）；删除为单方隐藏（`message_hides`，重进会话过滤）
- [~] **17. qa.* 遗留测试账号清理**：用户决策不处理（2026-11-20）——惰性账号无危害，保留现状
- [x] **16. 清理死资源**：`public/vite.svg` 已移除

## 验收口径

- P0 全勾 + CI/e2e 绿 + 正式域名可访问注册登录收发 → 达到对外交付标准
- 每项完成后：lint 0 errors、vitest 全过、build 成功、涉及 SQL 的同步更新 `src/lib/sql.js` 并提醒重新执行 CLOUD_SQL

## v2 投产波次（2026-11-20 用户决策扩围：A 可靠性 + B 安全 + D 撤回/删除 + F 朋友圈云端）

- [x] **W1. schema v2 应用生产库**：psql 直连执行 `UPGRADE_SQL`（单一真源 `src/lib/schema_v2.js`，并入 `CLOUD_SQL`）——新表 `friend_requests/blocks/read_cursors/message_hides/moments/moment_likes/moment_comments`、`messages.recalled_at`、security definer 函数 4 枚 + `search_profile` RPC、`client_errors_throttle` 触发器、`moments` Storage 桶、realtime publication 追加；清除遗留危险策略（"Messages are viewable by everyone."、profiles public 三策略）；12 表 RLS 全开验证通过
- [x] **W2a. lib 数据层**：`readCursors/blocks/friendRequests/moments/momentImage/syncHelpers` 新增；`messages.js` 撤回/隐藏；`profiles.js` 切 `search_profile` RPC（带表查询回退）
- [x] **W2b. store 集成**：`read_cursors` 水位（已读回执 + 跨端未读确定性重算 `recomputeUnreadCounts`）、realtime 单频道 `chat-sync:<uid>`（messages INSERT/UPDATE + read_cursors + friend_requests，SUBSCRIBED 重连补拉 resyncCloud）、`online/offline` 横幅、请求/拉黑状态
- [x] **W2c. UI**：ChatDetail 乐观发送/失败重试/撤回删除面板/已读回执/拉黑菜单；Contacts 好友请求流（新的朋友：接受/拒绝/取消）；Discover 真实朋友圈（发布含图/点赞/评论/分页/删除，仅好友可见）+ 本地演示降级；Profile 黑名单管理；CallOverlay「演示」徽标；Layout 离线横幅
- [x] **W3a. 测试**：vitest 87/87（`cloud-v2.spec.jsx` 27 条覆盖撤回窗口/合并纯函数/读水位/拉黑/请求流）；lint 0 errors；build 通过
- [x] **W3b. e2e 全链路**：`chat.spec.js` serial 五用例（登录、请求→接受→收发→未读、已读回执→撤回双端占位、单方删除、拉黑/解除）本地与生产均 11/11 绿
- [x] **W3c. 上线**：push main → Vercel CD（05663b9）→ 生产冒烟通过（e2e 11/11 + 朋友圈发布/点赞/评论/删除）；修复 supabase-js 2.119 `insert()` 静默忽略 `ignoreDuplicates` 导致的 409（friends/blocks/message_hides/moment_likes 改用 `upsert()` + `onConflict`）
- [x] **W4. 文档**：README 功能表/数据流/SQL 清单如实更新（通话标注演示、频道名 chat-sync、朋友圈仅好友可见）
