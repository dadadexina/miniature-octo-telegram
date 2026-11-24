# 数据库变更治理（方案 A）

本项目保留 `CLOUD_SQL` 作为 DDL 单一真源，`supabase/migrations/` 只存放与真源一致的只读快照，用于版本追溯与漂移校验。不改变现有在 Supabase SQL Editor 执行脚本的运维方式。

## 单一真源

DDL 由 `src/lib/` 下的模板常量拼接而成：

- `src/lib/sql.js`：`CLOUD_SQL`，拼接下表其余模板。
- `src/lib/friends.js`：`FRIENDS_SQL`。
- `src/lib/telemetry.js`：`CLIENT_ERRORS_SQL`。
- `src/lib/schema_v2.js`：`UPGRADE_SQL`（关系函数、朋友圈、存储策略等）。
- `src/lib/worldChatSql.js`：`WORLD_CHAT_SQL`（世界频道表、限流与清理）。
- `src/lib/realNameSql.js`：`REAL_NAME_SQL`（实名认证表、管理员、审核 RPC、私有证件照桶）。

所有 DDL 幂等：`create table if not exists`、`create or replace function`、策略前 `drop policy if exists`、约束用 `do $$ ... exception when duplicate_object` 补丁。

## 快照

`supabase/migrations/0001_baseline.sql` 由脚本从真源生成，禁止手改。

```bash
# 从源码重新生成快照
node scripts/export-cloud-sql.mjs
```

CI 的 `verify` job 会重新生成快照并执行 `git diff --exit-code`，快照与源码不一致时失败。

## 变更流程

1. 修改 `src/lib/` 下的 SQL 模板。
2. 重新生成快照并提交。
3. 在 Supabase SQL Editor 执行与生产一致的脚本（开发模式下应用内提供复制入口；生产已隐藏）。
4. 需要核对生产与真源差异时使用 Supabase CLI：

```bash
# 需要 SUPABASE_DB_URL 指向目标数据库
supabase db diff --db-url "$SUPABASE_DB_URL"
```

## 权限约定

- 表启用 RLS，策略面向 `authenticated`。
- `are_contacts`、`can_view_profile`、`can_message`、`can_view_moment` 为 `security definer`，仅 `authenticated` 可执行（`revoke ... from public, anon` + `grant ... to authenticated`）。
- `message_media`、`realname` 为私有桶；`avatars`、`moments` 读取按路径 RLS 控制。
- `realname` 仅允许本人读写，管理员可读取待审证件照；实名状态由 `submit_real_name` / `admin_review_real_name` 维护，客户端不能直接改表。

## 手机号短信（Send SMS Hook）

`supabase/functions/send-sms-hook/index.ts` 接收 Supabase Auth 的 Send SMS Hook，转调阿里云短信。

```bash
# 部署到目标项目（函数不需要 JWT，签名由 Hook 的 Standard Webhooks 校验）
SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy send-sms-hook --remote=<project-ref> --use-api --no-verify-jwt --yes

# 必填密钥
SUPABASE_ACCESS_TOKEN=... npx supabase secrets set \
  SEND_SMS_HOOK_SECRET=v1,whsec_... \
  ALIYUN_SMS_ACCESS_KEY_ID=... \
  ALIYUN_SMS_ACCESS_KEY_SECRET=... \
  ALIYUN_SMS_SIGN_NAME=... \
  ALIYUN_SMS_TEMPLATE_CODE=... \
  --project-ref <project-ref> --yes
```

在 Supabase Dashboard 的 Auth Hooks 中启用 Send SMS Hook，URL 填 `https://<project-ref>.supabase.co/functions/v1/send-sms-hook`，密钥与 `SEND_SMS_HOOK_SECRET` 一致。随后在 Auth 设置中开启 Phone provider，并关闭 `sms_autoconfirm` 以走验证码校验。

## 回滚

快照为幂等 DDL，重新执行即可恢复结构与策略；数据回滚依赖 `backup.yml` 的每日加密备份与恢复演练记录。
