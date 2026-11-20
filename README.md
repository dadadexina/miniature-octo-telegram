# 纸墨信笺 · E-Ink Chat

一个墨水屏（E-Ink）视觉风格的即时聊天应用，交互形态参考微信：会话列表、好友通讯录、朋友圈、个人资料，支持真实的多账号云端消息互通。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 18 + Vite 7 + React Router 7 |
| 样式 | Tailwind CSS 3（自定义 e-ink 设计令牌） |
| 后端 | Supabase（Auth + PostgreSQL + Realtime） |
| 测试 | Vitest 4 |
| 代码检查 | ESLint 10（flat config）+ react-hooks v7 / react-refresh 插件 |

## 功能清单

- 注册 / 登录 / 登出（Supabase Auth，邮箱账号）
- 忘记密码：邮件链接重置（/reset-password 页）
- 账号注销：云端级联删除资料 / 好友 / 消息（依赖 delete-account Edge Function）
- 用户协议与隐私政策页（/legal/terms、/legal/privacy）
- 单聊消息：发送、历史加载（每页 50 条、支持向前分页）、Realtime 实时推送
- 消息可靠性：乐观发送（sending → sent/failed 状态队列、失败一键重试）、断网横幅与跨端未读水位同步（`read_cursors`）、realtime 断线自动重同步
- 已读回执：对端打开会话回写读水位，发送方可实时看到「已读」
- 消息撤回与删除：发送后 2 分钟内可撤回（双端显示占位提示）；删除仅对自己不可见（`message_hides`），不影响对方
- 会话列表：按最新消息时间排序、未读红点（登录态持久化到 localStorage）
- 好友系统：好友请求 → 对方验证的双向流程（`friend_requests`，realtime 实时通知）、云端好友边存储（friends 表）、公开 ID 精确搜索添加（RPC 防用户名枚举）
- 拉黑防护：单向拒收（被拉黑方消息被 RLS 拒绝并收到明确提示）、「我的」页黑名单管理；陌生人（非好友）无法发起私聊
- 个人资料：头像（本地图片上传，自动降采样 256px、灰度显示；未上传时回退灰阶色板首字块）、昵称编辑（云端 + 本地降级）
- 朋友圈（云端）：发布文字/图片（自动降采样、灰度呈现）、点赞、评论、分页加载、删除自己的动态；动态仅好友可见（RLS）。通讯录含好友请求列表
- 语音通话基于 WebRTC（PeerJS 云信令，`peerjs`）：仅云端登录账号可用，双方需各自停留在与对方的聊天页；首次呼叫需授权麦克风，来电页支持接听/拒绝，通话中可静音与查看计时
- 未执行云端 SQL 时自动降级为本地演示模式（演示账号仍可完整体验）
- PWA 离线支持：`vite-plugin-pwa` 生成 service worker 预缓存静态资源，断网时可打开应用并读取本地缓存会话（`registerType: autoUpdate` 自动更新）

## 快速开始

```bash
# 安装依赖
npm install

# 配置 Supabase（复制模板并填入项目 URL 与 anon key，缺省时自动降级为本地演示模式）
cp .env.example .env.local

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 生产构建（输出到 dist/）
npm run build

# 预览生产构建
npm run preview

# 代码检查
npm run lint

# 单元测试与组件测试
npm run test
```

## Supabase 初始化

1. 在 [Supabase](https://supabase.com) 创建项目。
2. 打开项目内「资料」页的 SQL 初始化入口（CopySql 组件），或直接从数据库复制脚本，将 `CLOUD_SQL` 完整粘贴到 Supabase SQL Editor 并执行。脚本可重复执行，会创建并加固：
   - `profiles` 表（含 RLS：仅好友/请求关系可见，本人可写；`search_profile` RPC 精确匹配防枚举）
   - `messages` 表（含 RLS：仅收发双方可读写、陌生人拒收、2 分钟撤回窗口校验）、realtime publication、复合索引、外键与 4000 字符长度约束、`recalled_at` 撤回列
   - `friends` / `friend_requests` 表（好友边与请求验证流，pending 幂等唯一约束，双向策略）
   - `blocks`（单向拒收）、`read_cursors`（已读水位）、`message_hides`（单方删除）表
   - `moments` / `moment_likes` / `moment_comments` 表与 `moments` Storage bucket（公开读、本人目录写）
   - `client_errors` 表（前端错误监控上报，登录用户仅可写入，触发器限流 5 分钟 30 条）
   - `profiles.avatar_url` 列与 `avatars` Storage bucket（公开只读，每人仅能写自己 `<uid>/` 目录）
   - security definer 辅助函数 `are_contacts` / `can_view_profile` / `can_message` / `can_view_moment`
3. 邮箱验证（二选一）：
   - **正式交付推荐**：在 Authentication → Providers → Email 中开启 Confirm email（应用已支持「等待验证」提示与验证邮件回跳）；同时在 Authentication → URL Configuration 的 Redirect URLs 中加入 `<站点域名>/login` 与 `<站点域名>/reset-password`
   - 仅演示调试：开启 auto confirm（免验证直接登录）
4. 部署账号注销 Edge Function：Dashboard → Edge Functions → Create a new function，名称 `delete-account`，内容粘贴仓库中 `supabase/functions/delete-account/index.ts`，Deploy（无需额外配置，运行时自动注入 `SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY`）
5. 将项目 URL 与 anon key 填入 `.env.local`（参考 `.env.example`）：
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
6. 部署生产环境时，在托管平台的构建环境变量中配置同名的 `VITE_SUPABASE_*` 变量，并在 Supabase Auth → URL Configuration 中将生产域名加入 Site URL 与 Redirect URLs。

云端 SQL 未执行时，应用仍可用演示账号在本地模式下运行。

## 演示账号

| 昵称 | 手机号 | 密码 | 公开 ID |
|---|---|---|---|
| 小明 | 13800000001 | 1234 | 12345 |
| 小红 | 13800000002 | 1234 | 23456 |
| 老王 | 13800000003 | 1234 | 34567 |
| 小李 | 13800000004 | 1234 | 45678 |

演示账号仅存在于本机 localStorage（键 `wechat-chat-app-v3`），消息不经过云端。跨设备真实互通需注册两个云端账号（UUID 用户之间才会同步消息与好友）。

## 目录结构

```
src/
  store.jsx              全局状态：认证、用户、消息、未读、好友云同步、Realtime 订阅
  App.jsx                路由定义（/chats /contacts /discover /profile /profile/edit 等）
  main.jsx               入口
  index.css              纸纹背景、选中反白、气泡尾巴等全局样式
  utils.js               时间格式化、ID 工具
  lib/
    supabase.ts          Supabase 客户端（URL + anon key）
    sql.js               CLOUD_SQL：全部表结构 / RLS / 索引脚本
    messages.js          消息读写、分页、排序合并、会话分组（纯函数为主）
    profiles.js          资料读写、昵称更新（含列名回退）
    friends.js           好友表 SQL、fetchFriends、upsertFriend
    authErrors.js        认证错误码翻译
  components/            Avatar、NavBar、TabBar、AuthBar、CallOverlay、CopySql、ErrorBoundary
  pages/                 各路由页面（含 ResetPassword 重置密码、Legal 协议/隐私）
  hooks/                 通用 hooks
supabase/functions/
  delete-account/        账号注销 Edge Function（Deno，需按上文部署）
.github/workflows/ci.yml CI：push/PR 自动执行 lint + test + build
```

## 架构要点

- **状态管理**：`store.jsx` 单一 Provider，`useStore()` 暴露状态与操作；无额外状态库。
- **消息流**：本地 `localStorage` 为第一数据源保证秒开；云端登录后拉取收件箱（最新 500 条）并与本地合并；Realtime 通过 `chat-sync:<uid>` 单一频道订阅 messages INSERT/UPDATE（含撤回传播）、`read_cursors`（已读回执）与 `friend_requests`（好友请求实时通知），断线重连后自动全量重同步（resyncCloud）。
- **消息分页**：`fetchThread(meId, peerId, { before, limit=50 })` 以 `created_at` 为游标，单条 `or()` 查询取双向消息；`ChatDetail` 顶部「加载更早的消息」按钮保持滚动位置。
- **好友同步**：好友请求（`friend_requests`，pending 幂等）→ 对方接受后写入双向好友边（`friends` 单向边 `owner_id` = 我）；登录时云端 → 本地合并。
- **未读计数**：进入会话即回写云端读水位（`read_cursors`）；未读数由「最新消息 + 读水位（云端与本地取较新）」确定性重算（`recomputeUnreadCounts`），多端共享同一水位。
- **降级策略**：所有 Supabase 调用失败均静默捕获并回退本地行为，保证界面不出现报错。

## E-Ink 设计规范

- 色板：纸白 `#F4F3EE`、面板 `#F1F0EB`、墨黑 `#191919`、次级灰 `#5C5C5C`、分隔线 `#D8D6CE`
- 全部直角（`rounded-none`）、高对比、无彩色、无阴影；头像与朋友圈封面均为灰阶
- Tailwind 令牌定义于 `tailwind.config.js` 的 `eink` 命名空间

## 部署

`npm run build` 产物为纯静态站点，可部署到任意静态托管（Vercel、Netlify、Nginx 等），无需服务端运行时。已配置 PWA manifest 与矢量图标，支持添加到主屏幕。

**Vercel（推荐，零配置）**：仓库已含 `vercel.json`（Vite 框架 + SPA rewrites）与 `.env.production`（构建期公开配置：`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`，anon key 设计上随客户端产物公开，安全性由 RLS 保障），导入仓库即可直接部署。其他平台构建时注入同名环境变量，或直接复用 `.env.production`；未注入时站点仍能以本地演示模式运行。部署完成后，需在 Supabase Auth → URL Configuration 将生产域名加入 Site URL 与 Redirect URLs。

## 数据备份

`.github/workflows/backup.yml` 提供每日自动备份（03:15 UTC，也可手动触发）：`pg_dump` 导出 → AES-256 加密 → 以密文 artifact 保留 30 天。因本仓库公开，artifact 任何人可下载，**必须加密后才会上传**；未配置密钥时工作流自动跳过。

需在 GitHub 仓库 Settings → Secrets and variables → Actions 配置两个 secret：

| Secret | 说明 |
| --- | --- |
| `SUPABASE_DB_URL` | 数据库连接串，取自 Supabase Dashboard → Project Settings → Database → Connection string（URI 格式，含密码） |
| `BACKUP_ENCRYPTION_KEY` | 自行生成的强随机口令，仅自己保存，丢失则备份不可恢复 |

恢复备份（在本地执行）：

```bash
# 解密
openssl enc -d -aes-256-cbc -pbkdf2 -in backup-<时间戳>.dump.enc -out backup.dump -pass pass:<BACKUP_ENCRYPTION_KEY>

# 恢复到目标库
pg_restore --clean --if-exists -d "<目标库连接串>" backup.dump
```

## E2E 测试

基于 Playwright（`npm run test:e2e`，自动拉起 `vite preview` 于 4173 端口）：

- `e2e/public.spec.js`：公开页冒烟（登录页渲染/表单校验、重定向、协议页、重置密码失效提示），无需后端凭据，CI 常驻。
- `e2e/chat.spec.js`：云端双人聊天流（登录、好友请求 → 接受、发消息与未读角标、已读回执、2 分钟内撤回双端占位、单方删除、拉黑/解除），由环境变量门控，未配置时自动跳过：

| 变量 | 说明 |
| --- | --- |
| `E2E_USER_A_EMAIL` / `E2E_USER_A_PASSWORD` / `E2E_USER_A_USERNAME` | 已完成邮箱验证的测试账号 A |
| `E2E_USER_B_EMAIL` / `E2E_USER_B_PASSWORD` / `E2E_USER_B_USERNAME` | 测试账号 B |

CI 的 e2e job 从 GitHub Secrets 读取以上变量及 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（构建期注入）。首次本地运行需 `npx playwright install chromium`。

## 已知边界

- 单聊仅支持一对一文本消息（无图片 / 语音 / 表情回应）
- 通话界面为 UI 演示，无真实音视频
- 演示账号数据仅存于本机浏览器
