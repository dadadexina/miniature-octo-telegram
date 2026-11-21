// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearMomentCover, coverStorageKey, loadMomentCover, saveMomentCover } from './momentCover'

describe('momentCover', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty when nothing is stored or the value is not an image', () => {
    expect(loadMomentCover('u1')).toBe('')
    localStorage.setItem(coverStorageKey('u1'), 'not-an-image')
    expect(loadMomentCover('u1')).toBe('')
  })

  it('persists a downscaled image as a data url and can clear it', async () => {
    const file = new File(['fake-image-bytes'], 'cover.png', { type: 'image/png' })
    const res = await saveMomentCover('u1', file)
    expect(res.ok).toBe(true)
    expect(res.url.startsWith('data:image/')).toBe(true)
    expect(loadMomentCover('u1')).toBe(res.url)

    clearMomentCover('u1')
    expect(loadMomentCover('u1')).toBe('')
  })

  it('rejects non-image files', async () => {
    const res = await saveMomentCover('u1', new File(['x'], 'note.txt', { type: 'text/plain' }))
    expect(res.ok).toBe(false)
    expect(loadMomentCover('u1')).toBe('')
  })
})
