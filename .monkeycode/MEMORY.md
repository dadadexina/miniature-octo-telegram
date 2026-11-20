# User Instruction Memory

This file records user instructions, preferences, and teachings for reference in future interactions.

## Entries

[构建、测试与代码检查命令]
- Date: 2026-11-20
- Context: Discovered by Agent while completing delivery task list
- Category: Build & Compilation
- Instructions:
  - 构建：`npm run build`（vite 7，产物 dist/，纯静态，vite-plugin-pwa 同时生成 sw.js）
  - 测试：`npm run test`（vitest run，86 个用例：lib 纯函数 + 组件测试 + `src/lib/__tests__/cloud-v2.spec.jsx` v2 波次 26 条；`test:e2e` 跑 Playwright：公开页 6 例无需凭据 + `chat.spec.js` 云端 serial 5 例由 E2E_USER_A/B_* 环境变量门控，凭据在仓库外 `/tmp/opencode/e2e-env.sh`）
  - 代码检查：`npm run lint`（eslint 10 flat config，标准：0 errors，警告基线 13 条存量，多为 react-compiler 对 setState-in-effect 的风格提示）
  - 提交前必须三项全部通过

[npm 安装依赖必须 legacy-peer-deps（已固化为 .npmrc）]
- Date: 2026-11-20
- Context: Discovered by Agent while upgrading vitest 与接入 vite-plugin-pwa（arborist 在 vitest 4 browser peer 循环链崩溃；CI `npm ci` 严格 peer 校验因 workbox-build 的 ajv@8 与 eslint 的 ajv@6 嵌套冲突而失败）
- Category: Environment Configuration
- Instructions:
  - 仓库根 `.npmrc` 已设 `legacy-peer-deps=true`，**不可删除**：本地 npm install 与 CI `npm ci` 都依赖它，否则 arborist 崩溃或 ERESOLVE 拒装
  - 新增依赖后若 CI `npm ci` 报 lockfile 不同步，先 `npm install --package-lock-only` 重生 lock 再 `npm ci --dry-run` 验证
  - @testing-library/react 需手动补装 peer 依赖 @testing-library/dom
  - 依赖版本组合（勿随意升降）：vite ^7 + vitest ^4 + eslint ^10 + eslint-plugin-react-hooks ^7 + react-router-dom ^7 + react 18 + vite-plugin-pwa 2（manifest:false，沿用 public/manifest.webmanifest）

[GitHub Actions 工作流与 API 查询]
- Date: 2026-11-20
- Context: Discovered by Agent while delivering CI/e2e/backup workflows
- Category: Operations & Deployment
- Instructions:
  - 工作流：`ci.yml`（verify：npm ci+lint+test+build；e2e：Playwright 公开页用例）、`backup.yml`（每日 03:15 UTC pg_dump→AES-256 加密→artifact 30 天；需 Secrets：SUPABASE_DB_URL、BACKUP_ENCRYPTION_KEY）
  - 匿名 curl api.github.com 会触发 rate limit；查 runs 需认证：`TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git -c credential.helper= -c credential.helper=/root/gitcred-netrc.sh credential fill | sed -n 's/^password=//p')` 后带 `Authorization: Bearer`（勿回显 token）
  - 推送命令固定：`git -c credential.helper= -c credential.helper=/root/gitcred-netrc.sh push origin main`

[Supabase 配置来自 .env.local，代码零硬编码]
- Date: 2026-11-20
- Context: Discovered by Agent while doing delivery phase 1（配置分离）
- Category: Environment Configuration
- Instructions:
  - `src/lib/supabase.ts` 读取 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（import.meta.env），本地值在 `.env.local`（已被 .gitignore 忽略）
  - 未配置 env 时应用自动降级为本地演示模式，不报错
  - `SQL_EDITOR_URL` 由 supabase.ts 导出的 `supabaseUrl` 派生；CLOUD_SQL 唯一真源是 `src/lib/sql.js`（含建表/RLS/索引/外键，可重复执行）
  - 修改任何表结构相关 SQL 后，需提醒用户在 Supabase SQL Editor 重新执行 CLOUD_SQL（应用「资料」页有复制入口）
  - 生产部署需在托管平台注入同名 VITE_SUPABASE_* 构建期变量，并在 Supabase Auth → URL Configuration 配置生产域名

[长驻服务与验证方式]
- Date: 2026-11-20
- Context: Discovered by Agent while doing delivery phase 5（部署验证）
- Category: Operations & Deployment
- Instructions:
  - dev 服务器用 background terminal 跑 `npm run dev`（端口 5173，预览域名 5173-1b428f154a1564ff.monkeycode-ai.online）
  - 生产验证：`npm run build` 后 `npm run preview -- --port 5173 --host`，验证完杀进程并换回 dev
  - 无浏览器环境的应用冒烟方式：curl 各 `/src/*.jsx` 模块（vite 转换 200 即无编译错误）+ 检查 dev/preview 日志无 error
   - 云端表探测：curl `https://ljlvqnhzewzxpyhgumnp.supabase.co/rest/v1/<table>` 带 anon key；返回 42501 permission denied 属预期（RLS 生效，仅 authenticated 可访问）

[云端 profiles/messages 表结构约束]
- Date: 2026-11-20
- Context: Discovered by Agent while debugging「按 ID 搜索找不到对方」缺陷（实测 POST 探测列存在性）
- Category: Troubleshooting & Debugging
- Instructions:
  - 线上旧版 `profiles` 表原生只有 `id`/`username`/`avatar_url`/`created_at`；`nickname` 列由 CLOUD_SQL 的 `ADD COLUMN IF NOT EXISTS` 规范化补齐（已于 2026-11-20 执行生效）
  - 线上 `messages` 旧外键 `messages_*_id_fkey`（指向 `profiles(id)`）已于 2026-11-20 通过 CLOUD_SQL 的 DROP CONSTRAINT 移除，否则会拦截云端无 profiles 行的用户发消息（409/23503）；现由指向 `auth.users` 的 `messages_sender_fk`/`messages_receiver_fk` 保障完整性
  - ProfileGate 启动时自愈：云端确认无资料行会自动用本地缓存 `insertProfile` 重建
  - PostgREST 缺列错误码为 PGRST204，文案是单引号（`Could not find the 'nickname' column`）；代码内 `isMissingColumn`（src/lib/profiles.js）已兼容单双引号两种文案
  - 排查此类问题用 `auth/v1/signup`（autoconfirm）拿到 access_token 后带 `Authorization: Bearer` 直接 REST 实测，比猜测表结构可靠
  - 调试遗留测试账号前缀 `qa.`（qa.smoke/qa.probe/qa.fix/qa.norm，密码 qaTest123456），邮箱含历史 Date.now() 时间戳无法复原，只能由用户在 Supabase 后台 Authentication → Users 删除

[Supabase 自助运维(Management API 已随 token 吊销失效,现仅 psql 直连)]
- Date: 2026-11-20
- Context: Discovered by Agent while closing #6 Auth URL 切换与 #11 备份闭环(用户提供 sbp_ token,交付后已吊销并验证 401;schema v2 改用 psql 直连应用)
- Category: Operations & Deployment
- Instructions:
  - **现状(2026-11-20 起)**:`sbp_` 令牌已吊销,Management API 不可用;数据库唯一自助通道是 psql 直连,连接串在 `.monkeycode/secrets/db-url.txt`(pooler 5432,IPv4 可达);执行 SQL 用 `psql "$DB_URL" -f xx.sql -v ON_ERROR_STOP=1`
  - 备份 workflow 用 DB 密码(GH Secret SUPABASE_DB_URL),与已吊销令牌无关,不受影响
  - 历史经验(如用户再提供 token 可复用):认证配置 `GET/PATCH https://api.supabase.com/v1/projects/<ref>/config/auth`;免 SQL Editor 执行 SQL `POST .../database/query`;`pg_dump` 客户端必须 ≥ 服务端(PG 17.12,用 PGDG 源)
  - **连接串勿猜主机**:pooler host 是 aws-1-ap-northeast-1.pooler.supabase.com(Session 模式 5432);`db.<ref>.supabase.co` 仅 IPv6,沙箱与 GH runner 不可达
  - `gh secret set` 用 `--body "$VAR"`;勿用 stdin `--body -`(曾污染 secret)
  - SMTP 教训:API 存储的 `smtp_pass` 是 64 位密文,直连 AUTH 535;邮件能力只能走 Supabase 内置或用户自配明文授权码

[生产托管:Vercel 部署与域名探测经验]
- Date: 2026-11-20
- Context: Discovered by Agent while delivering #6 正式托管（Vercel git 集成）
- Category: Operations & Deployment
- Instructions:
  - 生产域名 `https://miniature-octo-telegram-puce.vercel.app`（已验证：标题/manifest/sw.js/SPA 兜底 200）；仓库零配置（`vercel.json` + `.env.production` + engines node 22.x），push main 自动构建发布
  - Vercel 项目子域带随机颜色后缀（-puce）；探测「项目名.vercel.app」裸域名的 451 DEPLOYMENT_DISABLED 是他人占位域名，勿误判为自己被法律阻断；真实部署状态以 GitHub commit status 的 `Vercel` context 为准（`gh api repos/<repo>/commits/main/status`）
  - `*-<scope>.vercel.app` 形式域名返回 302 → vercel.com/sso-api 属 Deployment Protection 行为，与生产主域无关
  - Vercel 官方 agent 接入手册在 https://vercel.com/get-started.md（CLI + vercel/vercel-plugin + MCP https://mcp.vercel.com），已中止安装（域名问题解决后无必要），需要时可按手册继续
  - 待办：Supabase Auth → URL Configuration 需将 Site URL 改为生产域名并追加 `https://miniature-octo-telegram-puce.vercel.app/**`（当前仍指向预览域名 + /login、/reset-password）

[云端 e2e 账号开通与凭据轮换]
- Date: 2026-11-20
- Context: Discovered by Agent while provisioning E2E_USER_A/B 云端账号（用户授权 agent 全自主解决技术问题）
- Category: Operations & Deployment
- Instructions:
  - 开通脚本：`e2e/provision-accounts.mjs`（凭据全经环境变量传入，脚本本身无秘密）：mail.tm 一次性邮箱 → signup → 轮询邮件取验证链接 → 密码登录确认 → REST 预建 profiles
  - mail.tm API 陷阱：注册地址中的 `.` 会被静默剥离，后续请求必须用创建响应返回的 `address`；inboxkitten/mail.gw 在本环境不可达
  - 账号在 Supabase 永久有效（邮箱过期不影响登录，登录只需 email+password）；当前 A=e2e_a_dfb10dccc971、B=e2e_b_64a1c9ed8fb4
  - 凭据轮换流程：重跑脚本开新号 → 写 `/tmp/opencode/e2e-env.sh`（chmod 600，仓库外）→ `gh secret set E2E_USER_A/B_*`（共 9 项 secrets 已全部配好，含 VITE_SUPABASE_*、BACKUP_ENCRYPTION_KEY）
  - BACKUP_ENCRYPTION_KEY 副本在 `.monkeycode/secrets/backup-key.txt`（已 gitignore）；GitHub secret 只写不可读，用户转存后应删除该文件

[schema v2 投产波次经验(消息可靠性/安全/撤回删除/朋友圈)]
- Date: 2026-11-20
- Context: Discovered by Agent while applying schema v2 to production DB via psql and integrating Wave 2 frontend
- Category: Troubleshooting & Debugging
- Instructions:
  - **生产表结构以 information_schema 为准**:生产 `messages.id` 实为 bigint(identity),与内嵌 CLOUD_SQL 假设(uuid)不符;写 DDL/外键前先 `select column_name,data_type from information_schema.columns where table_name='...'` 核对(bootstrap 已修正)
  - 单一真源:v2 升级 SQL 全部在 `src/lib/schema_v2.js` 的 `UPGRADE_SQL`,`sql.js` 的 `CLOUD_SQL` 由其拼接;幂等可重复执行;已直接经 psql 应用到生产,用户无需重跑 SQL
  - 跨表引用的 RLS 策略必须用 security definer 函数且 `set search_path = public`(are_contacts/can_view_profile/can_message/can_view_moment),否则被引表 RLS 会拦截策略自身查询
  - 历史遗留危险策略已清除("Messages are viewable by everyone." 等 public select),后续加策略前先 drop 同名旧策略防止叠加放行
  - realtime:单频道 `chat-sync:<uid>` 订阅 messages INSERT/UPDATE + read_cursors(filter peer_id=eq.me) + friend_requests;新表要加入 publication `supabase_realtime` 且 replica identity full
  - 已读模型是「每对一行的水位表」(read_cursors),未读数由 `recomputeUnreadCounts` 确定性重算;本地 readAt 仅作离线降级
  - 撤回窗口双端校验:前端 `canRecall`(RECALL_WINDOW_MS=2min)+ RLS `messages_update_recall`(created_at > now()-2min),RLS 拒绝映射文案「超过 2 分钟的消息不能撤回」
