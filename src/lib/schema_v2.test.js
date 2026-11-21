import { describe, expect, it } from 'vitest'
import { UPGRADE_SQL } from './schema_v2'

describe('UPGRADE_SQL 幂等性', () => {
  it('重建 search_profile 前先删除旧返回类型', () => {
    const dropAt = UPGRADE_SQL.indexOf('drop function if exists public.search_profile(text)')
    const createAt = UPGRADE_SQL.indexOf('create or replace function public.search_profile')
    expect(dropAt).toBeGreaterThan(-1)
    expect(createAt).toBeGreaterThan(dropAt)
    expect(UPGRADE_SQL.match(/create or replace function public\.search_profile/g)).toHaveLength(1)
  })

  it('每个策略创建前都有同名删除语句', () => {
    const names = [...UPGRADE_SQL.matchAll(/create policy\s+"([^"]+)"/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(0)
    for (const name of new Set(names)) {
      expect(UPGRADE_SQL).toContain(`drop policy if exists "${name}"`)
    }
  })
})
