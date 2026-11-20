# 交付任务清单（2026-11-20 审计）

审计范围：`main` 分支 `6326c80`，云端 Supabase 项目 `ljlvqnhzewzxpyhgumnp`。
已具备：代码入库 + CI 全绿、RLS/外键/索引/长度约束、ErrorBoundary、环境变量分离、31 个单元测试、资料/搜索/好友/消息全链路实测通过、README。

## P0 — 不修不能交付

- [x] **1. 忘记密码找回**：已实现 Login 入口 + `resetPasswordForEmail` + `/reset-password` 重置页 ｜ **待用户**：Supabase Auth → URL Configuration → Redirect URLs 添加 `<域名>/reset-password` 与 `<域名>/login`
- [x] **2. 注册邮箱验证**：代码已支持（signUp 带 `emailRedirectTo`、无 session 时显示等待验证提示）｜ **待用户**：Supabase 后台开启 Confirm email（开启前注册的账号不受影响）
- [x] **3. 账号注销**：Edge Function 源码（`supabase/functions/delete-account/index.ts`）+ 「我的」页注销入口级联清理已实现 ｜ **待用户**：Dashboard → Edge Functions 部署 `delete-account`
- [x] **4. 隐私政策 / 用户协议**：`/legal/terms`、`/legal/privacy` 页面，登录页与「我的」页已挂链接
- [x] **5. LICENSE**：MIT（仓库根目录，如需换协议告知）
- [ ] **2b. 邮件服务 SMTP 配置**：内置发信限每小时约 2 封（实测触发 `email rate limit exceeded`，导致「忘记密码」提示繁忙）。需在 Auth → SMTP Settings 启用自有 SMTP（QQ 邮箱 `smtp.qq.com:465` + 16 位授权码即可），验证/重置邮件才具备生产可用性 ｜ **待用户**：后台填写
- [ ] **6. 正式托管**：选定静态托管（Vercel / Netlify / OSS+CDN），注入构建期变量 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`，Supabase Auth URL Configuration 添加生产域名 ｜ **待用户**：确定托管平台

## P1 — 交付后一周内

- [x] **7. 删除好友**：已实现 —— `friends_delete_own` 策略 + `grant delete` 并入 CLOUD_SQL（需在 SQL 编辑器重新执行一次）；`deleteFriend()`；store `removeFriend` 同步清理本地好友镜像对、本机会话消息、收件箱与未读；通讯录「编辑」模式行内确认删除 ｜ 边界：单向删除（对方云端记录保留）；云端历史消息未删除，重新登录后该会话可能随收件箱重新出现，彻底删除列为 P2
- [ ] **8. e2e 测试**：Playwright 覆盖「注册→完善资料→搜索加好友→互发消息→未读角标」；CI 增加 e2e job（需两个自动注册测试账号）
- [ ] **9. 错误监控**：接入 Sentry（或 Supabase Logs + 前端 window.onerror 上报），捕获 ErrorBoundary 兜住的异常
- [x] **10. 分包优化**：`manualChunks` 拆出 react / supabase vendor；构建产物主 chunk gzip 14.53KB、react 59.28KB、supabase 59.72KB，均低于 80KB 目标
- [ ] **11. 数据备份**：`pg_dump` 定时导出（Supabase 后台可下载，或 GitHub Actions 定时任务 + service_role 密钥，注意密钥只存 CI Secrets）

## P2 — 可选

- [ ] **12. 头像上传**：启用 Supabase Storage bucket（policy 限制每人自己的目录），EditProfile 增加上传
- [ ] **13. PWA 离线**：`vite-plugin-pwa` 补 service worker，离线显示本地缓存会话
- [ ] **14. CD 自动部署**：CI 通过后自动发布到托管平台（GitHub Actions deploy job）
- [ ] **15. 消息撤回/删除**：产品决策后再做；需 messages update/delete 策略 + 前端状态机
- [x] **16. 清理死资源**：`public/vite.svg` 已移除

## 验收口径

- P0 全勾 + CI/e2e 绿 + 正式域名可访问注册登录收发 → 达到对外交付标准
- 每项完成后：lint 0 errors、vitest 全过、build 成功、涉及 SQL 的同步更新 `src/lib/sql.js` 并提醒重新执行 CLOUD_SQL
