# User Instruction Memory

This file records user instructions, preferences, and teachings for reference in future interactions.

## Entries

[构建、测试与代码检查命令]
- Date: 2026-11-20
- Context: Discovered by Agent while completing delivery task list
- Category: Build & Compilation
- Instructions:
  - 构建：`npm run build`（vite 7，产物 dist/，纯静态）
  - 测试：`npm test`（vitest run，25 个用例：lib 纯函数 + 组件测试）
  - 代码检查：`npm run lint`（eslint 10 flat config，标准：0 errors，允许 warning）
  - 提交前必须三项全部通过

[npm 安装依赖必须加 --legacy-peer-deps]
- Date: 2026-11-20
- Context: Discovered by Agent while upgrading vitest（npm arborist 在 vitest 4 的 browser peer 循环链上崩溃：Cannot read properties of null (reading 'edgesOut')）
- Category: Environment Configuration
- Instructions:
  - 本项目安装/升级依赖使用 `npm install ... --legacy-peer-deps`，否则 arborist 可能崩溃
  - @testing-library/react 需手动补装 peer 依赖 @testing-library/dom
  - 依赖版本组合（勿随意升降）：vite ^7 + vitest ^4 + eslint ^10 + eslint-plugin-react-hooks ^7 + react-router-dom ^7 + react 18

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
