import { invoke } from '@tauri-apps/api/core'
import { save as dialogSave, open as dialogOpen } from '@tauri-apps/plugin-dialog'

export interface MonthlyData {
  goals: string[]
  bucket_list: string[]
  events: { title: string; target_date: string }[]
  profile: { name?: string; bio?: string; photo_url?: string }
}

export const api = {
  entry: {
    async get(date: string): Promise<object | null> {
      const raw = await invoke<string | null>('get_entry', { date })
      if (!raw) return null
      try { return JSON.parse(raw) } catch { return null }
    },
    async save(date: string, content: object): Promise<void> {
      await invoke('save_entry', { date, content: JSON.stringify(content) })
    },
    async listMonth(yearMonth: string): Promise<string[]> {
      return invoke<string[]>('list_month_entries', { yearMonth })
    },
    async listMonthBgs(yearMonth: string): Promise<{ date: string; bg: string | null; bg_image: string | null }[]> {
      return invoke('list_month_bgs', { yearMonth })
    }
  },
  monthly: {
    async get(yearMonth: string): Promise<MonthlyData> {
      return invoke<MonthlyData>('get_monthly', { yearMonth })
    },
    async save(yearMonth: string, data: Partial<MonthlyData>): Promise<void> {
      await invoke('save_monthly', { yearMonth, data })
    }
  },
  settings: {
    async get(key: string): Promise<string | null> {
      return invoke<string | null>('get_setting', { key })
    },
    async set(key: string, value: string): Promise<void> {
      await invoke('set_setting', { key, value })
    }
  },
  file: {
    async pickImage(): Promise<string | null> {
      return invoke<string | null>('pick_image')
    },
    async pickVideo(): Promise<string | null> {
      return invoke<string | null>('pick_video')
    },
    async readFileB64(path: string): Promise<string> {
      return invoke<string>('read_file_b64', { path })
    }
  },
  sticker: {
    async listPacks(): Promise<{ name: string; files: string[] }[]> {
      return invoke('list_sticker_packs')
    },
    async getDir(): Promise<string> {
      return invoke('get_sticker_dir')
    },
    async pickDir(): Promise<string | null> {
      return invoke('pick_sticker_dir')
    }
  },
  fonts: {
    async list(): Promise<string[]> {
      return invoke('list_system_fonts')
    },
    async dataUrl(fontName: string): Promise<string | null> {
      return invoke<string | null>('font_data_url', { fontName })
    }
  },
  shell: {
    async openUrl(url: string): Promise<void> {
      await invoke('open_url', { url })
    }
  },
  http: {
    async fetchText(url: string): Promise<string> {
      return invoke<string>('fetch_text', { url })
    },
    async fetchImageB64(url: string): Promise<string> {
      return invoke<string>('fetch_image_b64', { url })
    }
  },
  export: {
    async savePng(b64: string, filename: string): Promise<void> {
      await invoke('save_png', { b64, filename })
    },
    async captureToB64(): Promise<string> {
      // screencapture -l <windowID> -o 로 알파 채널 포함 캡처 → body 배경 불필요
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
      return invoke<string>('capture_screenshot_b64')
    },
    async captureRegionB64(rect: { x: number; y: number; w: number; h: number }): Promise<string> {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
      return invoke<string>('capture_region_b64', rect)
    },
    async captureScreenshot(): Promise<void> {
      const path = await dialogSave({ title: 'PNG로 내보내기', filters: [{ name: 'PNG 이미지', extensions: ['png'] }] })
      if (!path) return
      await invoke('capture_screenshot_to', { path })
    }
  },
  backup: {
    async export(): Promise<void> {
      const path = await dialogSave({ title: '백업 파일 저장', filters: [{ name: 'dida 백업', extensions: ['json'] }] })
      if (!path) return
      await invoke('backup_export_to', { path })
    },
    async import(): Promise<void> {
      const path = await dialogOpen({ title: '백업 파일 불러오기', filters: [{ name: 'dida 백업', extensions: ['json'] }], multiple: false })
      if (!path) return
      const filePath = Array.isArray(path) ? path[0] : path
      await invoke('backup_import_from', { path: filePath })
    }
  },
  db: {
    async getPath(): Promise<string> {
      return invoke<string>('get_db_path')
    },
    async openFolder(): Promise<void> {
      await invoke('open_db_folder')
    },
    async pickDir(): Promise<string> {
      return invoke<string>('pick_db_dir')
    },
    async resetPath(): Promise<void> {
      await invoke('reset_db_path')
    }
  },
  video: {
    async getYoutubePort(): Promise<number> {
      return invoke<number>('get_youtube_proxy_port')
    }
  }
}
