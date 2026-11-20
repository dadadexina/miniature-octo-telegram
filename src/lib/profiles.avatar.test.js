import { describe, expect, it, vi } from 'vitest'

const state = {
  updateError: null,
  updateRow: null,
  uploadError: null,
  uploadCalls: [],
}

vi.mock('./supabase', () => {
  const chain = {
    update: () => chain,
    eq: () => chain,
    select: () => chain,
    maybeSingle: async () => ({ data: state.updateRow, error: state.updateError }),
  }
  const bucket = () => ({
    chain,
    upload: async (path, blob, opts) => {
      state.uploadCalls.push({ path, blob, opts })
      return { error: state.uploadError }
    },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn/object/public/avatars/${path}` } }),
    remove: async () => ({}),
  })
  return {
    supabase: {
      from: () => chain,
      storage: { from: () => bucket() },
    },
  }
})

const { avatarStoragePath, mapProfile, updateProfileAvatar, uploadAvatarFile } = await import('./profiles')

describe('avatarStoragePath', () => {
  it('从公开 URL 提取对象路径', () => {
    expect(avatarStoragePath('https://cdn/object/public/avatars/u1/a.jpg')).toBe('u1/a.jpg')
  })
  it('非头像 URL 返回 null', () => {
    expect(avatarStoragePath('https://cdn/object/public/other/x.jpg')).toBeNull()
    expect(avatarStoragePath('')).toBeNull()
  })
})

describe('mapProfile avatarUrl', () => {
  it('映射 avatar_url 列', () => {
    expect(mapProfile({ id: 'u', avatar_url: 'https://cdn/a.jpg' }).avatarUrl).toBe('https://cdn/a.jpg')
  })
  it('缺列返回空串', () => {
    expect(mapProfile({ id: 'u' }).avatarUrl).toBe('')
  })
})

describe('updateProfileAvatar', () => {
  it('成功返回映射资料', async () => {
    state.updateError = null
    state.updateRow = { id: 'u1', avatar_url: 'https://cdn/a.jpg' }
    const res = await updateProfileAvatar('u1', 'https://cdn/a.jpg')
    expect(res.ok).toBe(true)
    expect(res.profile.avatarUrl).toBe('https://cdn/a.jpg')
  })

  it('缺 avatar_url 列给出重跑 SQL 提示', async () => {
    state.updateError = { message: 'column "avatar_url" of relation "profiles" does not exist' }
    const res = await updateProfileAvatar('u1', 'x')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('avatar_url')
  })
})

describe('uploadAvatarFile', () => {
  it('成功上传返回公开 URL 与自己目录下的路径', async () => {
    state.uploadError = null
    state.uploadCalls = []
    const res = await uploadAvatarFile('u1', new Blob(['x']), 'image/jpeg')
    expect(res.ok).toBe(true)
    expect(res.path.startsWith('u1/avatar-')).toBe(true)
    expect(res.url).toContain('/object/public/avatars/u1/avatar-')
    expect(state.uploadCalls[0].opts).toMatchObject({ contentType: 'image/jpeg', upsert: true })
  })

  it('上传失败返回错误', async () => {
    state.uploadError = { message: 'new row violates row-level security policy' }
    const res = await uploadAvatarFile('u1', new Blob(['x']))
    expect(res.ok).toBe(false)
    expect(res.error).toContain('row-level security')
  })
})
