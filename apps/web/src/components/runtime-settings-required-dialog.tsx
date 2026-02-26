import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DefaultService } from '@/lib/api'

const timezoneSettingKey = 'timezone'

export function RuntimeSettingsRequiredDialog() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [historyLimit, setHistoryLimit] = useState(200)
  const [timezone, setTimezone] = useState(getBrowserTimezone())
  const [requiredSettings, setRequiredSettings] = useState<Array<string>>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadRuntimeSettings()
  }, [])

  const timezoneRequired = requiredSettings.includes(timezoneSettingKey)
  const unsupportedRequiredSettings = useMemo(
    () => requiredSettings.filter((setting) => setting !== timezoneSettingKey),
    [requiredSettings],
  )

  async function loadRuntimeSettings() {
    setLoading(true)
    setMessage('')

    try {
      const settings = await DefaultService.getRuntimeSettings()
      setHistoryLimit(settings.checksHistoryLimit)
      setTimezone(settings.timezone ?? getBrowserTimezone())
      setRequiredSettings(
        Array.isArray(settings.requiredSettings) ? settings.requiredSettings : [],
      )
    } catch (error) {
      setMessage(getErrorMessage(error, 'Failed to load runtime settings.'))
    } finally {
      setLoading(false)
    }
  }

  async function onSaveRequiredSettings(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    if (timezone.trim() === '') {
      setMessage('Timezone is required.')
      setSaving(false)
      return
    }

    try {
      await DefaultService.upsertRuntimeSettings({
        requestBody: {
          checksHistoryLimit: historyLimit,
          timezone,
        },
      })
      await loadRuntimeSettings()
    } catch (error) {
      setMessage(getErrorMessage(error, 'Could not save runtime settings.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={requiredSettings.length > 0} onOpenChange={() => undefined}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete Required Setup</DialogTitle>
          <DialogDescription>
            Runtime settings are required before schedules can run with the
            expected timezone.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-zinc-400">Loading settings...</p>
        ) : (
          <form onSubmit={onSaveRequiredSettings} className="space-y-4">
            {timezoneRequired ? (
              <div className="space-y-2">
                <Label htmlFor="required-runtime-timezone">Cron Timezone</Label>
                <Input
                  id="required-runtime-timezone"
                  required
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  className="bg-zinc-950"
                  placeholder="America/New_York"
                />
                <p className="text-xs text-zinc-400">
                  Use an IANA timezone like UTC or America/New_York.
                </p>
              </div>
            ) : null}

            {unsupportedRequiredSettings.length > 0 ? (
              <p className="text-sm text-amber-300">
                Additional required settings are not configurable in this
                dialog: {unsupportedRequiredSettings.join(', ')}
              </p>
            ) : null}

            {message ? (
              <p className="text-sm text-zinc-300">{message}</p>
            ) : null}

            <Button type="submit" disabled={saving || !timezoneRequired}>
              {saving ? 'Saving...' : 'Save Required Settings'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const errorWithBody = error as {
      body?: { error?: unknown }
      message?: unknown
    }

    const bodyError = errorWithBody.body?.error
    if (typeof bodyError === 'string' && bodyError.trim() !== '') {
      return bodyError
    }

    if (
      typeof errorWithBody.message === 'string' &&
      errorWithBody.message.trim() !== ''
    ) {
      return errorWithBody.message
    }
  }

  return fallback
}

function getBrowserTimezone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (typeof timezone === 'string' && timezone.trim() !== '') {
      return timezone
    }
  } catch {
    // ignored
  }

  return 'UTC'
}
