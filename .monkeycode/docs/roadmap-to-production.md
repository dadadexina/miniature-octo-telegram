# 投产路线图(2026-11-20 用户决策)

范围决策:A 消息可靠性 + B 安全防护 + D 撤回/删除 + F 朋友圈云端化。
不做:C 图片聊天消息、E 群聊、G Web Push、H 小优化包。
演示功能(通话 UI)保留并加「演示」标注;朋友圈云端化后不再是演示。

## Wave 1 — 数据库 schema(一次性应用,幂等)

| 对象 | 用途 |
|---|---|
| `friend_requests`(partial unique pending) | B1 好友请求流 |
| `blocks` | B5 拉黑 |
| `read_cursors(user_id,peer_id,read_at)` | A1 已读水位云端同步+已读回执 |
| `messages.recalled_at` + update RLS(仅本人、2 分钟内、置 recalled_at) | D1 撤回 |
| `message_hides(message_id,user_id)` | D1 删除(仅自见隐藏) |
| `are_contacts/can_view_profile/can_message/can_view_moment`(security definer)+ `search_profile` RPC | B2/B3 关系判定与防枚举搜索 |
| `profiles_select` 收紧(RLS 走 can_view_profile);`messages_insert` 加 can_message | B2/B3 |
| `client_errors_throttle` 触发器(5 分钟/30 条按 session 静默丢弃)+ 索引 | B4 |
| `moments/moment_likes/moment_comments` + Storage 桶 `moments`(公开读、本人目录写) | F |
| realtime publication 追加 `read_cursors、friend_requests`(replica identity full) | A1/B1 实时化 |

单一真源:`src/lib/schema_v2.js` 的 `UPGRADE_SQL`,由 `sql.js` 的 `CLOUD_SQL` 引用;经 psql 直接应用到生产库并验证。

## Wave 2 — 前端实现顺序(依赖驱动)

1. lib 数据层:`friends.js`(请求流 CRUD)、`messages.js`(撤回/隐藏/游标字段)、`profiles.js`(search RPC)、新增 `readCursors.js`、`moments.js`、`blocks.js`
2. A1:store 接入云端水位(openPeer upsert 游标、拉取对端游标、"已读"对钩 UI),本地 readAt 保留为离线降级
3. A2/A3:Realtime 频道状态监听(CHANNEL_ERROR/TIMED_OUT/SUBSCRIBED 补拉)、navigator.onLine 横幅、乐观发送(sending→failed+重试)
4. B1/B2/B5:Contacts 请求角标与请求列表、接受/拒绝、拉黑入口(ChatDetail 资料卡)与黑名单管理(Profile)
5. D1:气泡长按面板(撤回≤2min/删除)、撤回占位渲染、messages UPDATE 订阅实时同步撤回
6. F1/F2:Discover 重写为真实 feed(发布含可选图片、点赞、评论、分页、下拉刷新),本地种子朋友圈退役
7. 演示标注:CallOverlay/通话按钮「演示」徽标 + README 功能表如实修正

## Wave 3 — 测试与上线

- 单测:新增 lib/store 纯函数全部覆盖(canon: vitest 现有 60 基线不回退)
- e2e 扩展:好友请求→接受→收发→已读回执→撤回 全链路(云端双账号);现有 8 条保持绿
- CI 全绿 → push main → Vercel 自动部署 → 生产冒烟(注册/搜索/请求/收发/朋友圈)
- 文档:delivery-checklist 增补 v2 章节、MEMORY 记录 schema 波次经验

## 关键兼容约束

- 既有 `friends` 单边好友记录视为有效关系(are_contacts OR 两向)
- localStorage 键 `wechat-chat-app-v3:*` 全部保留,只增不改名
- 无 migration 目录,以 `CLOUD_SQL` 幂等脚本为部署真源(可重复执行)
