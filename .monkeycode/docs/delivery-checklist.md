# 交付任务清单（2026-11-20 审计）

审计范围：`main` 分支 `6326c80`，云端 Supabase 项目 `ljlvqnhzewzxpyhgumnp`。
已具备：代码入库 + CI 全绿、RLS/外键/索引/长度约束、ErrorBoundary、环境变量分离、31 个单元测试、资料/搜索/好友/消息全链路实测通过、README。

## P0 — 不修不能交付

- [ ] **1. 忘记密码找回**：Login 页增加入口，实现 `supabase.auth.resetPasswordForEmail` + 重置密码页；需在 Supabase Auth → URL Configuration 配置 Redirect URL
- [ ] **2. 注册邮箱验证**：Supabase 后台开启 email confirmation（Auth → Providers → Email），处理 `signUp` 返回无 session 的「等待验证」态
- [ ] **3. 账号注销**：设置页提供注销入口；因 anon key 无法删 `auth.users`，需新增 Edge Function（或 SQL 定时清理申请）执行级联删除
- [ ] **4. 隐私政策 / 用户协议**：新增静态页面（数据收集范围：邮箱、昵称、聊天内容；存储方：Supabase）
- [ ] **5. LICENSE**：仓库根目录添加开源许可证（建议 MIT，或与需求方确认）
- [ ] **6. 正式托管**：选定静态托管（Vercel / Netlify / OSS+CDN），注入构建期变量 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`，Supabase Auth URL Configuration 添加生产域名，预览域名加入允许列表或下线

## P1 — 交付后一周内

- [ ] **7. 删除好友**：CLOUD_SQL 增加 friends delete 策略（`using (auth.uid() = owner_id)`）+ `deleteFriend()` + UI 长按/资料页入口；同步清理本地会话
- [ ] **8. e2e 测试**：Playwright 覆盖「注册→完善资料→搜索加好友→互发消息→未读角标」；CI 增加 e2e job（需两个自动注册测试账号）
- [ ] **9. 错误监控**：接入 Sentry（或 Supabase Logs + 前端 window.onerror 上报），捕获 ErrorBoundary 兜住的异常
- [ ] **10. 分包优化**：`manualChunks` 拆出 supabase-js / react 全家桶，目标主 chunk gzip < 80KB
- [ ] **11. 数据备份**：`pg_dump` 定时导出（Supabase 后台可下载，或 GitHub Actions 定时任务 + service_role 密钥，注意密钥只存 CI Secrets）

## P2 — 可选

- [ ] **12. 头像上传**：启用 Supabase Storage bucket（policy 限制每人自己的目录），EditProfile 增加上传
- [ ] **13. PWA 离线**：`vite-plugin-pwa` 补 service worker，离线显示本地缓存会话
- [ ] **14. CD 自动部署**：CI 通过后自动发布到托管平台（GitHub Actions deploy job）
- [ ] **15. 消息撤回/删除**：产品决策后再做；需 messages update/delete 策略 + 前端状态机
- [ ] **16. 清理死资源**：删除 `public/vite.svg` 及 manifest/index.html 中的引用残留

## 验收口径

- P0 全勾 + CI/e2e 绿 + 正式域名可访问注册登录收发 → 达到对外交付标准
- 每项完成后：lint 0 errors、vitest 全过、build 成功、涉及 SQL 的同步更新 `src/lib/sql.js` 并提醒重新执行 CLOUD_SQL
