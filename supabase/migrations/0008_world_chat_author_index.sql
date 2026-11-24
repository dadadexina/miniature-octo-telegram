-- 世界频道发送限流按作者+时间查询的支撑索引。
create index if not exists world_messages_author_created_idx
  on public.world_messages (author_id, created_at desc);
