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
    id: 'sky', name: '하늘색',
    primary: '#87CEEB', primaryLight: '#DCEFFE', primaryDark: '#3A8FBF',
    secondary: '#B8D4E8', bg: '#F0F8FF', sidebar: '#DCEFFE',
    text: '#1A2A3A', textMuted: '#5A7A9A', border: '#B8D8F0',
  },
  {
    id: 'strawberry', name: '딸기핑크',
    primary: '#F8B4C8', primaryLight: '#FDE8F0', primaryDark: '#D4688A',
    secondary: '#B8D4B8', bg: '#FFF8F0', sidebar: '#FDE8F0',
    text: '#4A3F3F', textMuted: '#9A8A8A', border: '#F0D0DC',
  },
  {
    id: 'mono', name: '흑백',
    primary: '#888888', primaryLight: '#EEEEEE', primaryDark: '#333333',
    secondary: '#AAAAAA', bg: '#FFFFFF', sidebar: '#F5F5F5',
    text: '#111111', textMuted: '#666666', border: '#DDDDDD',
  },
  {
    id: 'dark', name: '다크',
    primary: '#888888', primaryLight: '#2A2A2A', primaryDark: '#CCCCCC',
    secondary: '#444444', bg: '#1A1A1A', sidebar: '#111111',
    text: '#E0E0E0', textMuted: '#666666', border: '#333333',
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
