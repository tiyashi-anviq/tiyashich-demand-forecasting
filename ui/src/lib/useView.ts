import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { AppError } from '@reiq/ui'
import { getJson } from './http'

/** One screen's data. Old values stay on screen while a changed filter loads (the refetch state),
 *  and a build that is still running is asked again until it says it is ready. */
export function useView<T extends { state?: string }>(base: string, view: string, query: string, enabled = true) {
  return useQuery<T, AppError>({
    queryKey: [base, view, query],
    queryFn: () => getJson<T>(`/api/${base}/${view}?${query}`),
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: (q) => (q.state.data?.state && q.state.data.state !== 'ready' ? 2500 : false),
  })
}

/** Where a long build (explore tables, forecasts) stands. Normalised, because the two services name it differently. */
export type BuildState = { state: 'no_data' | 'building' | 'ready' | 'error'; message: string; progress: number; error: string | null }

type RawStatus = { panel?: string; state?: string; message?: string; progress?: number; error?: string | null }

export function useBuild(base: 'eda' | 'forecast') {
  return useQuery<BuildState, AppError>({
    queryKey: [base, 'status'],
    queryFn: async () => {
      const raw = await getJson<RawStatus>(`/api/${base}/status`)
      const s = raw.panel ?? raw.state ?? 'building'
      return {
        state: s === 'ready' || s === 'no_data' || s === 'error' ? s : 'building',
        message: raw.message ?? '',
        progress: raw.progress ?? 0,
        error: raw.error ?? null,
      }
    },
    refetchInterval: (q) => (q.state.data && (q.state.data.state === 'ready' || q.state.data.state === 'no_data' || q.state.data.state === 'error') ? false : 1200),
  })
}
