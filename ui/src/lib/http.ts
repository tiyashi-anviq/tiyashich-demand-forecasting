import { AppError } from '@reiq/ui'

/** The API's own sentence (FastAPI's `detail`) becomes the error message, so the screen can say it. */
export async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `The service answered with a problem (${res.status}).`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      /* the body was not JSON; keep the generic sentence */
    }
    throw new AppError(message, res.status)
  }
  return res.json() as Promise<T>
}

export const getJson = <T,>(url: string) => fetch(url).then((r) => readJson<T>(r))

export const sendJson = <T,>(url: string, method: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => readJson<T>(r))
