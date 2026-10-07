const API_URL = import.meta.env.PUBLIC_API_URL as string | undefined

export function baseUrl(): string {
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

/** Uploads a file with progress reporting (fetch has no upload progress, so XHR). */
export function apiUploadMedia(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<import('@social-scheduler/shared').Media> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `${baseUrl()}/api/media`)
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    })
    request.addEventListener('load', () => {
      try {
        const data = JSON.parse(request.responseText) as { error?: string }
        if (request.status >= 200 && request.status < 300) {
          resolve(data as import('@social-scheduler/shared').Media)
        } else {
          reject(new Error(typeof data.error === 'string' ? data.error : `Upload failed: ${request.status}`))
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Upload failed'))
      }
    })
    request.addEventListener('error', () => reject(new Error('Upload failed: network error')))
    const form = new FormData()
    form.append('file', file)
    request.send(form)
  })
}
