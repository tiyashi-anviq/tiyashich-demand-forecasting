import type { Batch, ConfirmState, DataType, Group, Quality, Source, Workspace } from './types'

import { getJson as get, sendJson as send } from './lib/http'
import { AppError } from '@reiq/ui'

export const api = {
  schema: () => get<{ types: DataType[]; sources: Source[] }>('/api/schema'),
  workspace: () => get<Workspace>('/api/workspace'),
  resetWorkspace: () => send<Workspace>('/api/workspace', 'DELETE'),
  createBatch: () => send<{ id: string }>('/api/batches', 'POST'),
  addDemoFile: (id: string, fileKey: string) => send<{ added: string[] }>(`/api/batches/${id}/demo-files/${encodeURIComponent(fileKey)}`, 'POST'),
  latestBatch: () => get<{ id: string | null }>('/api/batches/latest'),
  batch: (id: string) => get<Batch>(`/api/batches/${id}`),
  removeFile: (id: string, fid: string) => send<{ ok: boolean }>(`/api/batches/${id}/files/${fid}`, 'DELETE'),
  editGroup: (id: string, gid: string, body: { type?: string; mapping?: Record<string, string | null>; include?: boolean }) =>
    send<{ group: Group; ready: boolean; problems: string[] }>(`/api/batches/${id}/groups/${gid}`, 'PUT', body),
  preview: (id: string, gid: string) =>
    get<{ columns: string[]; rows: Record<string, string | number | null>[] }>(`/api/batches/${id}/groups/${gid}/preview?rows=5`),
  startQuality: (id: string) => send<{ started: boolean }>(`/api/batches/${id}/quality`, 'POST'),
  quality: (id: string) => get<Quality>(`/api/batches/${id}/quality`),
  confirm: (id: string, decisions: Record<string, string>) => send<{ started: boolean }>(`/api/batches/${id}/confirm`, 'POST', { decisions }),
  confirmState: (id: string) => get<ConfirmState>(`/api/batches/${id}/confirm`),
}

/** Upload one file with progress (fetch cannot report upload progress). */
export function uploadFile(batchId: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('POST', `/api/batches/${batchId}/files`)
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) return resolve()
      try { reject(new AppError(JSON.parse(x.responseText).detail || 'The file could not be uploaded. Try again.', x.status)) } catch { reject(new AppError('The file could not be uploaded. Try again.', x.status)) }
    }
    x.onerror = () => reject(new AppError('Could not reach the API. Check that it is running, then add the file again.'))
    const fd = new FormData()
    fd.append('files', file)
    x.send(fd)
  })
}
