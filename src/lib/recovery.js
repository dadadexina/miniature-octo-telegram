export function isRecoveryCallback(location = {}) {
  const hash = String(location.hash || '').replace(/^#/, '')
  const search = String(location.search || '').replace(/^\?/, '')
  if (new URLSearchParams(hash).get('type') === 'recovery') return true
  if (new URLSearchParams(search).get('type') === 'recovery') return true
  return false
}
