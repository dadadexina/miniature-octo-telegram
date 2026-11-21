export const DEFAULT_THEME_ID = 'light'

export const THEMES = [
  {
    id: 'light',
    name: '纸墨',
    desc: '原始纸墨，素雅克制',
    themeColor: '#F4F3EE',
    swatches: ['#F4F3EE', '#FBFAF7', '#191919'],
  },
  {
    id: 'sepia',
    name: '羊皮纸',
    desc: '暖黄纸感，久读不累',
    themeColor: '#FDF6E3',
    swatches: ['#FDF6E3', '#F5EEDA', '#3B2F25'],
  },
  {
    id: 'moss',
    name: '青苔',
    desc: '低饱和绿意，安静护眼',
    themeColor: '#F7F3E3',
    swatches: ['#F7F3E3', '#FBF8EC', '#3C473E'],
  },
  {
    id: 'blue',
    name: '雾蓝',
    desc: '冷灰蓝调，清透沉稳',
    themeColor: '#ECEFF4',
    swatches: ['#ECEFF4', '#F6F8FC', '#2E3440'],
  },
  {
    id: 'dark',
    name: '墨夜',
    desc: '深色低光，夜间不刺眼',
    themeColor: '#121212',
    swatches: ['#121212', '#1C1C1C', '#EDECE6'],
  },
]

export const THEME_IDS = THEMES.map((theme) => theme.id)

export function themeById(id) {
  return THEMES.find((theme) => theme.id === id) || THEMES[0]
}
