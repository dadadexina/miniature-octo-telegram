import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_ID, THEMES, THEME_IDS, themeById } from './themes'

describe('主题配置', () => {
  it('提供五个风格且 id 唯一', () => {
    expect(THEMES).toHaveLength(5)
    expect(new Set(THEME_IDS).size).toBe(5)
    expect(THEME_IDS).toContain(DEFAULT_THEME_ID)
  })

  it('每个主题都有名称、描述、色板与主题色', () => {
    THEMES.forEach((theme) => {
      expect(theme.name).toBeTruthy()
      expect(theme.desc).toBeTruthy()
      expect(theme.themeColor).toMatch(/^#[0-9A-F]{6}$/i)
      expect(theme.swatches).toHaveLength(3)
    })
  })

  it('未知主题回退到默认主题', () => {
    expect(themeById('missing').id).toBe(DEFAULT_THEME_ID)
    expect(themeById('sepia').name).toBe('羊皮纸')
  })
})
