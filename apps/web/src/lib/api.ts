const API_URL = import.meta.env.PUBLIC_API_URL as string | undefined

function baseUrl(): string {
  if (API_URL === undefined || API_URL === '') {
    throw new Error('PUBLIC_API_URL is not configured')
  }
  return API_URL.replace(/\/+$/, '')
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers })
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Request failed: ${response.status}`,
    )
  }
  return data as T
}
