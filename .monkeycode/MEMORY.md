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
  - 推送命令：直接 `git push origin main`。默认 helper `/app/agent/bin/agent git-credential-helper` 可用；旧路径 `/root/gitcred-netrc.sh` 已不存在，勿再用 `-c credential.helper` 覆盖；`gh` 已登录 dadadexina，必要时 `gh auth setup-git`

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
  - **仓库转 private 会拦截 Vercel 部署**（2026-11-20 实测：19:09:38 转私有后,后续 push 的 commit status `Vercel` = failure/"Deployment was blocked",转私有前最后一次部署正常）;GitHub PAT 无法修复(`/user/installations` 403,需 GitHub App 用户令牌),必须由账号主人在 Vercel Dashboard(Project → Settings → Git)或 GitHub(Settings → Applications → Vercel → Configure → Repository access)重新授权私有仓库访问;排查口诀:生产 HTML 的 `age`/`etag` 头 + `GET /repos/<owner>/<repo>/commits/<sha>/status` 看 Vercel context(该仓挂了两个 Vercel 项目:miniature-octo-telegram 与 -mkrx,同因同时被拦截)。**2026-11-22 已按用户要求改回 public**,无需再授权

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

[supabase-js 2.119 insert 不支持 ignoreDuplicates(静默忽略导致 409)]
- Date: 2026-11-20
- Context: Discovered by Agent while debugging production e2e block-test failure and login-hydration 409 console errors
- Category: Troubleshooting & Debugging
- Instructions:
  - 本仓库安装的 postgrest-js(supabase-js 2.119.2 内置)中 `insert(values, opts)` 只接受 `{count, defaultToNull}`,传 `{ignoreDuplicates:true}` 会被静默忽略(不发 Prefer 头),重复键插入返回 409 23505
  - 幂等写入必须用 `.upsert(payload, { ignoreDuplicates: true, onConflict: '<唯一约束列>' })`(friends/blockUser/hideMessage/likeMoment 四处已改,commit 05663b9)
  - 生产 e2e 拉黑用例曾因此类残留行翻转动作而失败:serial 用例对共享后端状态敏感,跑生产套件前确认 `blocks` 等表无 e2e 账号残留行(调试脚本 /tmp/opencode/debug-block*.mjs 可经 UI 清理)
  - 验证基线(2026-11-20,M2.1 后):vitest 150/150、lint 0 errors/18 warnings、e2e 11/11、生产冒烟 `/tmp/opencode/smoke-m1.mjs` 27 项断言(T1~T8,含图片消息 T8)全绿;生产 bundle 是否更新可 grep `dist/assets` 产物特征串对比线上同名 chunk

[SPA 返回按钮:勿用 window.history.length 判断应用内历史]
- Date: 2026-11-20
- Context: Discovered by Agent while fixing FriendProfile back button (用户反馈外链直开时返回无效/退出应用,commit 43ce3c8)
- Category: Troubleshooting & Debugging
- Instructions:
  - `window.history.length` 统计整个标签页历史(含站外条目),外链/webview 直开二级页时 `navigate(-1)` 会退出应用
  - 正确判定:优先 `window.history.state?.idx > 0`(react-router v7 BrowserRouter),MemoryRouter 场景回退 `location.key !== 'default'`;无应用内历史则兜底跳一级页(replace)
  - 二级页(聊天详情/资料页)在 Layout 之外,TabBar 随路由切换隐藏/恢复属预期;Playwright `waitForURL` 在 lazy 页面 chunk 加载完成前就会 resolve,断言 DOM 前需再等待 1s+,否则会把旧页面元素(如 TabBar)误计为新页面的

[CI e2e 与手动冒烟互斥:同一对测试账号并发竞争]
- Date: 2026-11-20
- Context: Discovered by Agent while M1 生产冒烟失败排查(T1a typing/T2a 消息送达双失败)
- Category: Troubleshooting & Debugging
- Instructions:
  - 每次 push main 会触发 GitHub Actions CI(lint+单测+11 e2e,约 1~2 分钟),e2e 直连生产 Supabase 且使用与 /tmp/opencode/e2e-env.sh 完全相同的 A/B 账号
  - CI e2e 含拉黑/解禁/删除消息流;与其并发运行手动冒烟会出现消息被 RLS(block)拒收、realtime 缺失等假失败
  - 手动冒烟前先 `GET /repos/<owner>/<repo>/actions/runs?per_page=3` 确认无 in_progress,并等 CI 完成后再等 1~2 分钟(Supabase 连接池恢复)
  - 排查消息不通口诀:先 psql 查消息是否落库(区分「未插入」与「未推送」)→ 查 blocks/friends 边 → `select can_message(a,b)` 直接验 RLS 判定 → 页面上找本地模式提示文案(「本地演示用户」「暂无读写权限」「读取消息失败」= fetchThread 失败静默降级本地)
  - 消息表收发列为 sender_id/receiver_id(无 recipient_id);水合期 friends upsert 偶发 403 噪音与消息链路无关

[Realtime-js 2.119 presence 频道必须显式 enabled 才收对端状态]
- Date: 2026-11-20
- Context: Discovered by Agent while M1.6 输入状态指示生产冒烟失败排查(T1a typing 指示不出现)
- Category: Troubleshooting & Debugging
- Instructions:
  - `supabase.channel(name)` 默认 `config.presence = { key: '', enabled: false }`;enabled:false 时本端 track() 仍会广播,但**不会收到**对端 presence sync(静默,无报错)
  - 正确用法:`supabase.channel(name, { config: { presence: { key: <本端id>, enabled: true } } })`;track payload 无需再带 key
  - 对端状态读取:`channel.presenceState()[key]` 是数组;key 即加入频道时 config.presence.key
  - 冒烟脚本坑:`E2E_USER_*_USERNAME` 是 publicId(如 e2e_b_xxx)而非 uuid;`/chat/:id` 路由必须用真实 uuid(publicId 传入会因 isUuid 失败静默降级本地演示模式,页面提示「当前好友是本地演示用户」);uuid 可从水合后的 localStorage `wechat-chat-app-v3` users[].publicId 反查
  - 消息气泡操作菜单:点 `[data-msg-id] .bubble, div` 的 first() 可能命中 TimeDivider 冒泡到容器关闭菜单;应直接点气泡文本 getByText(exact)

[托管 Supabase 可直接用 psql 创建 Storage 桶与 storage.objects RLS 策略]
- Date: 2026-11-20
- Context: Discovered by Agent while applying M2.1 图片消息 message_media 桶与配对目录策略
- Category: Operations & Deployment
- Instructions:
  - `.monkeycode/secrets/db-url.txt` 的 postgres 角色对 `storage` schema 有完整权限:`insert into storage.buckets`、`create policy on storage.objects` 均可经 psql 直接执行,无需 Dashboard 或 service_role key
  - 私有媒体对象策略模板:对象路径首段为业务键(如配对目录 `<uuidA>__<uuidB>`),用 `split_part((storage.foldername(name))[1], '__', n) = auth.uid()::text` 校验成员身份;select/insert/update/delete 四条都要建
  - 排序连接的配对键注意 delete 策略也应对双方开放(split 1 或 split 2 命中 auth.uid()),只判 split 1 会造成仅字典序小的一方可删
  - 渲染私有对象一律 `createSignedUrl(path, expiresIn)`(消息图 900s),签名结果不入库;每次挂载组件重新签

[功能完成后推送 GitHub，并代办 SQL 与部署]
- Date: 2026-11-23（原 2026-11-21，已合并）
- Context: 用户要求功能完成/修改后由 Agent 推送；并授权 Agent 直接执行 SQL 与部署，无需逐次确认
- Category: Workflow & Collaboration
- Instructions:
  - 完成/新增功能后，先 `npm run lint`、`npm run test`、`npm run build` 全部通过，再 commit 并 push 到 `origin/main`
  - 推送前先 `git status`/`git diff` 确认只包含本次改动，推送后在回复中说明 commit 与结果
  - 用户已授权 Agent 直接执行 SQL 与部署：涉及 schema 的改动同步 `src/lib/sql.js`，默认应用到 staging；生产库变更需在回复中注明已执行/待执行
  - 若当次用户指定分支或 PR 流程，以当次指示为准

[环境配置与部署约束]
- Date: 2026-11-22
- Context: Discovered by Agent while 拆分 production/staging、切换 CI e2e、转私有仓库
- Category: Environment Configuration
- Instructions:
  - 生产 Supabase ref `ljlvqnhzewzxpyhgumnp`（ap-northeast-1，org `dlqxyvklimrwdexpspei`）；staging ref `ajwkmlpzgvdekjvypuve`（ap-northeast-2，org `cuiinllsqxcslytifwxz`），已执行基线 SQL；staging Auth `site_url=http://localhost:5173`，开启 `mailer_autoconfirm`；`uri_allow_list` 必须包含预览/生产域名（现已加 `https://*.monkeycode-ai.online/**`），否则 recovery 邮件链接会回落到 `site_url`（localhost），线上打开表现为空白页
  - 沙箱出网白名单：github/api、npm、supabase、vercel、photon.komoot.io（地名搜索可用）；`api.supabase.com` 需 `curl -4`；openrelay/peerjs 不可达，WebRTC 成功链路需真实网络双端验证
  - GitHub Secrets `VITE_SUPABASE_*` 与 `E2E_USER_A/B_*` 指向 staging；本地 `.env.local` 指 staging，`.env.production.local`（gitignore）指生产
  - e2e 用户名须匹配 `^[A-Za-z0-9]{8,15}$` 且含字母数字，否则 `profiles_fill_public_id` 会替换为随机 ID
  - `scripts/export-cloud-sql.mjs` 必须用函数替换 `.replaceAll(k, () => v)`，否则替换串中的 `$$` 折叠为 `$` 破坏 dollar-quote
  - avatar-sync 实时头像用例默认跳过，`E2E_AVATAR_SYNC=1` 才运行；生产函数 ACL 仅 `authenticated` 可执行四个关系判定函数
  - 私有仓库 + Vercel Hobby：提交作者必须能匹配到团队 Owner，否则部署状态为 `Deployment was blocked`（非仓库授权问题）。已实测：author 用 `dadadexina <106894018+dadadexina@users.noreply.github.com>` 提交后 Vercel 部署成功；后续推送统一用该作者身份（`git -c user.name=... -c user.email=...`），勿再用 `monkeycode-ai@chaitin.com`
  - 2026-11-23 用户提供两个组织级 Supabase PAT，均存于 `.monkeycode/secrets/`（gitignore、600）：`supabase-prod-token.txt` 覆盖 org `dlqxyvklimrwdexpspei`（生产 ref `ljlvqnhzewzxpyhgumnp`），另一枚覆盖 staging org `cuiinllsqxcslytifwxz`；Management API 已验证可读项目/keys，`POST /v1/projects/<ref>/database/query` 在生产执行 `select 1` 返回 201
  - 两个项目名都叫 `dadadexina's Project`，命令行与脚本一律用 ref 区分，勿按 name 匹配
