import { DefaultService, OpenAPI } from '@goanna/api-client'
import type {
  CreateMonitorRequest,
  Monitor,
  SelectorPreviewRequest,
  SelectorPreviewResponse,
  TestTelegramSettingsRequest,
  TestTelegramSettingsResponse,
} from '@goanna/api-client'

type SelectorPreviewRequestPayload = SelectorPreviewRequest & {
  token?: string
}

OpenAPI.BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export { DefaultService }

export async function triggerMonitor(monitorId: number): Promise<Monitor> {
  const service = DefaultService as {
    triggerMonitor?: (args: { monitorId: number }) => Promise<Monitor>
  }

  if (typeof service.triggerMonitor === 'function') {
    return service.triggerMonitor({ monitorId })
  }

  return requestMonitor(`/v1/monitors/${monitorId}/trigger`, { method: 'POST' })
}

export async function deleteMonitor(monitorId: number): Promise<void> {
  const service = DefaultService as {
    deleteMonitor?: (args: { monitorId: number }) => Promise<void>
  }

  if (typeof service.deleteMonitor === 'function') {
    await service.deleteMonitor({ monitorId })
    return
  }

  await requestNoContent(`/v1/monitors/${monitorId}`, { method: 'DELETE' })
}

export async function updateMonitor(
  monitorId: number,
  requestBody: CreateMonitorRequest,
): Promise<Monitor> {
  const service = DefaultService as {
    updateMonitor?: (args: {
      monitorId: number
      requestBody: CreateMonitorRequest
    }) => Promise<Monitor>
  }

  if (typeof service.updateMonitor === 'function') {
    return service.updateMonitor({ monitorId, requestBody })
  }

  return requestMonitor(`/v1/monitors/${monitorId}`, {
    method: 'PUT',
    body: JSON.stringify(requestBody),
  })
}

export async function previewMonitorSelector(
  requestBody: SelectorPreviewRequestPayload,
): Promise<SelectorPreviewResponse> {
  const service = DefaultService as {
    previewMonitorSelector?: (args: {
      requestBody: SelectorPreviewRequest
    }) => Promise<SelectorPreviewResponse>
  }

  if (typeof service.previewMonitorSelector === 'function') {
    return service.previewMonitorSelector({ requestBody })
  }

  return requestJSON<SelectorPreviewResponse>('/v1/monitors/selector-preview', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  })
}

export async function testTelegramSettings(
  requestBody: TestTelegramSettingsRequest,
): Promise<TestTelegramSettingsResponse> {
  const service = DefaultService as {
    testTelegramSettings?: (args: {
      requestBody: TestTelegramSettingsRequest
    }) => Promise<TestTelegramSettingsResponse>
  }

  if (typeof service.testTelegramSettings === 'function') {
    return service.testTelegramSettings({ requestBody })
  }

  return requestJSON<TestTelegramSettingsResponse>(
    '/v1/settings/notifications/telegram/test',
    {
      method: 'POST',
      body: JSON.stringify(requestBody),
    },
  )
}

async function requestMonitor(
  path: string,
  init: RequestInit,
): Promise<Monitor> {
  return requestJSON<Monitor>(path, init)
}

async function requestNoContent(path: string, init: RequestInit): Promise<void> {
  await request(path, init)
}

async function requestJSON<T>(path: string, init: RequestInit): Promise<T> {
  const response = await request(path, init)
  return (await response.json()) as T
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${OpenAPI.BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`
    try {
      const payload = (await response.json()) as { error?: string }
      if (typeof payload.error === 'string' && payload.error.trim() !== '') {
        message = payload.error
      }
    } catch {
      // ignored
    }

    throw { body: { error: message } }
  }

  return response
}
