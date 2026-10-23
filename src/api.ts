import { invoke } from '@tauri-apps/api/core'
import { save as dialogSave, open as dialogOpen } from '@tauri-apps/plugin-dialog'

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
    async delete(date: string): Promise<void> {
      await invoke('delete_entry', { date })
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
  whattime: {
    async readInstalled(): Promise<string | null> {
      return invoke<string | null>('read_whattime_schedule')
    },
    async pick(): Promise<string | null> {
      return invoke<string | null>('pick_whattime_schedule')
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
  backup: {
    async export(): Promise<void> {
      const path = await dialogSave({ title: '백업 파일 저장', filters: [{ name: 'PanDeckI 백업', extensions: ['json'] }] })
      if (!path) return
      await invoke('backup_export_to', { path })
    },
    async import(): Promise<void> {
      const path = await dialogOpen({ title: '백업 파일 불러오기', filters: [{ name: 'PanDeckI 백업', extensions: ['json'] }], multiple: false })
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
