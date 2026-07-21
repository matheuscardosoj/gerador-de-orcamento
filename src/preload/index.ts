import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// API exposta ao renderer. Os handlers de domínio (orçamentos, cadastros, etc.)
// serão adicionados na Fase 1, sempre passando pelo processo main via IPC.
const api = {}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define no window)
  window.electron = electronAPI
  // @ts-ignore (define no window)
  window.api = api
}
