import { client } from '@goanna/api-client'

client.setConfig({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080',
})

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim() !== '') {
    return error
  }

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>

    const directError = errorRecord.error
    if (typeof directError === 'string' && directError.trim() !== '') {
      return directError
    }

    if (directError && typeof directError === 'object') {
      const nestedError = (directError as Record<string, unknown>).error
      if (typeof nestedError === 'string' && nestedError.trim() !== '') {
        return nestedError
      }
    }

    const message = errorRecord.message
    if (typeof message === 'string' && message.trim() !== '') {
      return message
    }
  }

  if (error instanceof Error && error.message.trim() !== '') {
    return error.message
  }

  return fallback
}
