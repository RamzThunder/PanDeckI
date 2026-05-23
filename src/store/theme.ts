export interface Theme {
  id: string
  name: string
  primary: string
  primaryLight: string
  primaryDark: string
  secondary: string
  bg: string
  sidebar: string
  text: string
  textMuted: string
  border: string
}

export const PRESET_THEMES: Theme[] = [
  {
    id: 'strawberry', name: '딸기핑크',
    primary: '#F8B4C8', primaryLight: '#FDE8F0', primaryDark: '#D4688A',
    secondary: '#B8D4B8', bg: '#FFF8F0', sidebar: '#FDE8F0',
    text: '#4A3F3F', textMuted: '#9A8A8A', border: '#F0D0DC',
  },
  {
    id: 'sky', name: '하늘색',
    primary: '#87CEEB', primaryLight: '#DCEFFE', primaryDark: '#3A8FBF',
    secondary: '#B8D4E8', bg: '#F0F8FF', sidebar: '#DCEFFE',
    text: '#1A2A3A', textMuted: '#5A7A9A', border: '#B8D8F0',
  },
  {
    id: 'lavender', name: '연보라색',
    primary: '#C8A8E8', primaryLight: '#EEE0FF', primaryDark: '#8A5AB8',
    secondary: '#D8C8E8', bg: '#FAF0FF', sidebar: '#EEE0FF',
    text: '#2A1A3A', textMuted: '#8A70A8', border: '#DCC8F0',
  },
  {
    id: 'mint', name: '민트',
    primary: '#80D4C0', primaryLight: '#D8F4EE', primaryDark: '#3AA890',
    secondary: '#A8D8C8', bg: '#F0FFFA', sidebar: '#D8F4EE',
    text: '#0A2A20', textMuted: '#4A8070', border: '#A8E4D4',
  },
  {
    id: 'mono', name: '흑백',
    primary: '#888888', primaryLight: '#EEEEEE', primaryDark: '#333333',
    secondary: '#AAAAAA', bg: '#FFFFFF', sidebar: '#F5F5F5',
    text: '#111111', textMuted: '#666666', border: '#DDDDDD',
  },
]

export function applyTheme(t: Theme) {
  const r = document.documentElement
  r.style.setProperty('--color-primary', t.primary)
  r.style.setProperty('--color-primary-light', t.primaryLight)
  r.style.setProperty('--color-primary-dark', t.primaryDark)
  r.style.setProperty('--color-secondary', t.secondary)
  r.style.setProperty('--color-bg', t.bg)
  r.style.setProperty('--color-sidebar', t.sidebar)
  r.style.setProperty('--color-text', t.text)
  r.style.setProperty('--color-text-muted', t.textMuted)
  r.style.setProperty('--color-border', t.border)
}

export function applyGlobalFont(fontFamily: string) {
  const family = fontFamily
    ? `'${fontFamily}', 'Apple SD Gothic Neo', 'Noto Sans KR', -apple-system, sans-serif`
    : "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
  document.documentElement.style.setProperty('--global-font', family)
  document.body.style.fontFamily = family
}
