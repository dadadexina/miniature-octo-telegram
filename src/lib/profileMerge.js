/**
 * 把一条云端资料行合并进本地用户列表。
 * - 同 id 才合并,未知 id 不新建,避免资料表变化把陌生人塞进通讯录。
 * - keepAvatarIfEmpty: 云端头像为空时保留本地头像(用于本人本地暂存头像场景)。
 * - 其他人默认以云端为准,头像被清空时本地也跟着回到文字头像。
 */
export function applyProfileRow(users, row, { keepAvatarIfEmpty = false } = {}) {
  if (!row?.id || !Array.isArray(users)) return users
  const idx = users.findIndex((user) => user.id === row.id)
  if (idx < 0) return users
  const current = users[idx]
  const nickname = row.nickname || row.display_name || row.name || ''
  const publicId = row.username || row.custom_id || row.publicId || ''
  const hasAvatarField =
    Object.prototype.hasOwnProperty.call(row, 'avatar_url') ||
    Object.prototype.hasOwnProperty.call(row, 'avatarUrl')
  const avatarUrl = hasAvatarField ? row.avatar_url || row.avatarUrl || '' : current.avatarUrl || ''
  const next = {
    ...current,
    nickname: nickname || current.nickname,
    publicId: publicId || current.publicId,
    avatarUrl: keepAvatarIfEmpty ? avatarUrl || current.avatarUrl || '' : avatarUrl,
  }
  if (row.gender) next.gender = row.gender
  if (Object.prototype.hasOwnProperty.call(row, 'signature')) next.signature = row.signature || ''
  const createdAt = row.created_at || row.createdAt
  if (createdAt) next.createdAt = createdAt
  if (
    next.nickname === current.nickname &&
    next.publicId === current.publicId &&
    next.avatarUrl === current.avatarUrl &&
    next.gender === current.gender &&
    next.signature === current.signature &&
    next.createdAt === current.createdAt
  ) {
    return users
  }
  const copy = users.slice()
  copy[idx] = next
  return copy
}

export function withMappedAvatar(profile) {
  if (!profile?.id) return null
  return { ...profile, avatar_url: profile.avatarUrl || '' }
}
