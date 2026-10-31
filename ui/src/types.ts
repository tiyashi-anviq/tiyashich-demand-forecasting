export type Column = { name: string; kind: 'date' | 'number' | 'text' | 'empty'; nulls: number; unique: number | null; samples: string[] }

export type Field = { key: string; label: string; help: string; kind: string; required: boolean }
export type DataType = { key: string; label: string; help: string; core: boolean; fields: Field[] }
export type Source = { id: string; group: string; name: string; what: string; mode: 'demo' | 'file' }

export type FileInfo = {
  id: string; name: string; size: number; status: 'queued' | 'reading' | 'done' | 'error'
  progress: number; error: string | null; sheets: number; rows: number
  sheets_done?: number | null; sheets_total?: number | null
}

export type Group = {
  id: string; name: string; type: string; confidence: number; include: boolean; rows: number
  sheet_names: string[]; source_file: string; columns: Column[]
  mapping: Record<string, string | null>; match_conf: Record<string, number>
  ok: boolean; missing: string[]; user_edited: boolean
}

export type Batch = { id: string; files: FileInfo[]; groups: Group[]; ready: boolean; problems: string[]; included: number }

export type Action = { id: string; label: string; recommended: boolean }
export type Issue = {
  id: string; scope: 'cleanup' | 'cleansing'; dataset: string; severity: 'warn' | 'info' | 'ok' | 'skipped'
  title: string; detail: string; count: number; total: number | null
  actions: Action[]; default: string | null; minor?: boolean
}
export type Quality = { status: 'idle' | 'running' | 'done' | 'error'; progress?: number; message?: string; issues?: Issue[] }

export type TableOut = {
  id: string; name: string; type: string; type_label: string; rows: number; columns: string[]
  date_from: string | null; date_to: string | null; weekly: boolean
}
export type Fixes = {
  rows_removed: number; duplicates_removed: number; labels_standardised: number; negatives_zeroed: number
  blanks_filled: number; locations_resolved: number; outliers_flagged: number; outliers_capped: number; demand_estimated: number; promo_weeks: number
}
export type Workspace = { loaded: boolean; loaded_at?: number; tables?: TableOut[]; fixes?: Fixes }
export type ConfirmState = { status: 'idle' | 'running' | 'done' | 'error'; progress?: number; message?: string; result?: Workspace }
