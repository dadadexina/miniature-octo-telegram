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
- [ ] **6. 正式托管**：用户已选定 Vercel。仓库侧准备完毕（`9b23e03` 后追加）：`vercel.json`（Vite + SPA rewrites）、`.env.production`（VITE_SUPABASE_* 构建期公开配置，anon key 本就随客户端产物下发，RLS 保障安全）、`package.json engines: node 22.x`（匹配 CI 与 Vite 7 要求） ｜ **待用户**：vercel.com GitHub OAuth 导入仓库一键部署（零配置），部署后告知域名，agent 更新 Supabase Auth URL Configuration

## P1 — 交付后一周内

- [x] **7. 删除好友**：已实现 —— `friends_delete_own` 策略 + `grant delete` 并入 CLOUD_SQL（2026-11-20 用户已重跑生效）；`deleteFriend()`；store `removeFriend` 同步清理本地好友镜像对、本机会话消息、收件箱与未读；通讯录「编辑」模式行内确认删除 ｜ 边界：单向删除（对方云端记录保留）；云端历史消息未删除，重新登录后该会话可能随收件箱重新出现，彻底删除列为 P2
- [x] **8. e2e 测试**：Playwright 已接入（`npm run test:e2e`，webServer 自动拉起 preview:4173），全量 8 例全过：`e2e/public.spec.js` 公开页 6 例 + `e2e/chat.spec.js` 云端双人聊天流 2 例（登录/搜索加好友/发消息/未读角标+预览往返）。云端账号由 `e2e/provision-accounts.mjs`（mail.tm 一次性邮箱）自动开通，GitHub Secrets 9 项已配齐（VITE_SUPABASE_* + E2E_USER_A/B_*）。期间修复两个真实缺陷：ChatDetail 竞态（云端对快速发送误入本地路径，`cloudReady` 强制云端发送）与会话未读角标缺失（新增 `readAt` 本地已读水位，`mergeInbox` 重算未读）
- [x] **9. 错误监控**：轻量自建方案已上线（`41a179b`）：`client_errors` 表（insert-only RLS）+ `src/lib/telemetry.js` 限流上报（12 条/60s、同键 5s 冷却）+ window.onerror / unhandledrejection / ErrorBoundary 捕获，`__APP_VERSION__` 随版本注入 ｜ **可选升级**：接入 Sentry 需用户提供 DSN
- [x] **10. 分包优化**：`manualChunks` 拆出 react / supabase vendor；构建产物主 chunk gzip 14.53KB、react 59.28KB、supabase 59.72KB，均低于 80KB 目标
- [x] **11. 数据备份**：`.github/workflows/backup.yml` 每日 03:15 UTC pg_dump → AES-256 加密 → 密文 artifact 保留 30 天（公开仓库 artifact 可被任意下载，故强制加密）。README 含恢复步骤。`BACKUP_ENCRYPTION_KEY` 已由 agent 生成并写入 Secrets（本地副本 `.monkeycode/secrets/backup-key.txt`，请用户转存后删除该文件）；缺 `SUPABASE_DB_URL` 时优雅跳过路径已实测验证（workflow_dispatch run success，guard 短路输出配置指引） ｜ **待用户**：提供 `SUPABASE_DB_URL`（Dashboard → Project Settings → Database → Connection string，URI 版）后执行 `gh secret set SUPABASE_DB_URL` 即闭环

## P2 — 可选

- [x] **12. 头像上传**：`avatars` Storage bucket（公开只读、每人仅写自己 `<uid>/` 目录，策略并入 CLOUD_SQL）+ `profiles.avatar_url` 列；EditProfile 选图 → canvas 降采样 256px JPEG → 上传 → 写入云端；本地演示模式降级存 dataURL；全站 Avatar 组件支持图片（灰度滤镜、加载失败回退首字块）；云端缺列时提示重跑 SQL ｜ 云端已生效（2026-11-20 用户重跑 CLOUD_SQL，REST 探针确认 `avatars` bucket 存在且公开可读、`client_errors` 表存在）
- [x] **13. PWA 离线**：`vite-plugin-pwa`（generateSW，registerType autoUpdate）预缓存 16 项静态资源，离线可打开应用壳并读取 localStorage 缓存会话；保留现有 `public/manifest.webmanifest`（`manifest: false` 不重复生成），`navigateFallback: '/index.html'` 兜底 SPA 路由；构建产物 `sw.js` + `registerSW.js` 自动注入
- [ ] **14. CD 自动部署**：用户已选定 Vercel——git 集成导入后每次 push 自动构建发布，无需额外 deploy job；随 #6 用户导入即闭环
- [ ] **15. 消息撤回/删除**：用户决策暂缓（2026-11-20），产品需要时再启动（需 messages update/delete 策略 + 前端状态机）
- [~] **17. qa.* 遗留测试账号清理**：用户决策不处理（2026-11-20）——惰性账号无危害，保留现状
- [x] **16. 清理死资源**：`public/vite.svg` 已移除

## 验收口径

- P0 全勾 + CI/e2e 绿 + 正式域名可访问注册登录收发 → 达到对外交付标准
- 每项完成后：lint 0 errors、vitest 全过、build 成功、涉及 SQL 的同步更新 `src/lib/sql.js` 并提醒重新执行 CLOUD_SQL
