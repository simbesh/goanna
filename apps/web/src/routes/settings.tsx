import {
  getRuntimeSettingsOptions,
  getRuntimeSettingsQueryKey,
  getTelegramSettingsOptions,
  getTelegramSettingsQueryKey,
  testTelegramSettingsMutation,
  upsertRuntimeSettingsMutation,
  upsertTelegramSettingsMutation,
} from '@goanna/api-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { sileo } from 'sileo'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getApiErrorMessage } from '@/lib/api'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const queryClient = useQueryClient()
  const telegramSettingsQuery = useQuery(getTelegramSettingsOptions())
  const runtimeSettingsQuery = useQuery(getRuntimeSettingsOptions())
  const saveTelegramSettings = useMutation(upsertTelegramSettingsMutation())
  const sendTelegramTest = useMutation(testTelegramSettingsMutation())
  const saveRuntimeSettings = useMutation(upsertRuntimeSettingsMutation())

  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [historyLimit, setHistoryLimit] = useState(200)
  const [timezone, setTimezone] = useState(getBrowserTimezone())
  const [requiredRuntimeSettings, setRequiredRuntimeSettings] = useState<
    Array<string>
  >([])
  const [telegramMessage, setTelegramMessage] = useState('')
  const [runtimeMessage, setRuntimeMessage] = useState('')

  const loadingTelegram = telegramSettingsQuery.isPending
  const savingTelegram = saveTelegramSettings.isPending
  const testingTelegram = sendTelegramTest.isPending
  const loadingRuntime = runtimeSettingsQuery.isPending
  const savingRuntime = saveRuntimeSettings.isPending

  useEffect(() => {
    if (!telegramSettingsQuery.data) {
      return
    }

    setBotToken(telegramSettingsQuery.data.botToken)
    setChatId(telegramSettingsQuery.data.chatId)
    setEnabled(telegramSettingsQuery.data.enabled)
  }, [telegramSettingsQuery.data])

  useEffect(() => {
    if (!telegramSettingsQuery.error) {
      return
    }

    setTelegramMessage('')
    setTelegramMessage(
      getApiErrorMessage(
        telegramSettingsQuery.error,
        'Failed to load Telegram settings.',
      ),
    )
  }, [telegramSettingsQuery.error])

  useEffect(() => {
    if (!runtimeSettingsQuery.data) {
      return
    }

    setHistoryLimit(runtimeSettingsQuery.data.checksHistoryLimit)
    setTimezone(runtimeSettingsQuery.data.timezone ?? getBrowserTimezone())
    setRequiredRuntimeSettings(
      Array.isArray(runtimeSettingsQuery.data.requiredSettings)
        ? runtimeSettingsQuery.data.requiredSettings
        : [],
    )
  }, [runtimeSettingsQuery.data])

  useEffect(() => {
    if (!runtimeSettingsQuery.error) {
      return
    }

    setRuntimeMessage(
      getApiErrorMessage(runtimeSettingsQuery.error, 'Failed to load runtime settings.'),
    )
  }, [runtimeSettingsQuery.error])

  async function onSaveTelegram(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTelegramMessage('')

    try {
      const settings = await saveTelegramSettings.mutateAsync({
        body: {
          enabled,
          botToken,
          chatId,
        },
      })

      queryClient.setQueryData(getTelegramSettingsQueryKey(), settings)
      setEnabled(settings.enabled)
      setTelegramMessage('Telegram settings saved.')
    } catch (error) {
      setTelegramMessage(
        getApiErrorMessage(
          error,
          'Could not save Telegram settings. Please verify fields.',
        ),
      )
    }
  }

  async function onTestTelegram() {
    setTelegramMessage('')

    try {
      await sendTelegramTest.mutateAsync({
        body: {
          botToken,
          chatId,
          message: 'Goanna test notification from Settings',
        },
      })

      sileo.success({ description: 'Test message sent to Telegram.' })
      setTelegramMessage('Test message sent to Telegram.')
    } catch (error) {
      setTelegramMessage(
        getApiErrorMessage(
          error,
          'Could not send test message. Please verify bot token and chat ID.',
        ),
      )
    }
  }

  async function onSaveRuntime(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRuntimeMessage('')

    if (!Number.isFinite(historyLimit) || historyLimit < 10) {
      setRuntimeMessage('Checks history limit must be at least 10.')
      return
    }

    if (timezone.trim() === '') {
      setRuntimeMessage('Timezone is required.')
      return
    }

    try {
      const settings = await saveRuntimeSettings.mutateAsync({
        body: {
          checksHistoryLimit: historyLimit,
          timezone,
        },
      })

      queryClient.setQueryData(getRuntimeSettingsQueryKey(), settings)
      setHistoryLimit(settings.checksHistoryLimit)
      setTimezone(settings.timezone ?? timezone)
      setRequiredRuntimeSettings(
        Array.isArray(settings.requiredSettings) ? settings.requiredSettings : [],
      )
      setRuntimeMessage('Runtime settings saved.')
    } catch (error) {
      setRuntimeMessage(getApiErrorMessage(error, 'Could not save runtime settings.'))
    }
  }

  return (
    <Tabs defaultValue="notifications" className="space-y-4">
      <TabsList className="bg-zinc-900">
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="runtime">Runtime</TabsTrigger>
      </TabsList>

      <TabsContent value="notifications">
        <Card>
          <CardHeader>
            <CardTitle>Telegram Channel</CardTitle>
            <CardDescription>
              Configure the primary notification channel used for monitor
              alerts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTelegram ? (
              <p className="text-sm text-zinc-400">Loading settings...</p>
            ) : (
              <form onSubmit={onSaveTelegram} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="telegram-token">Bot Token</Label>
                  <Input
                    id="telegram-token"
                    required
                    value={botToken}
                    onChange={(event) => setBotToken(event.target.value)}
                    className="bg-zinc-950"
                    placeholder="123456:AA..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telegram-chat-id">Chat ID</Label>
                  <Input
                    id="telegram-chat-id"
                    required
                    value={chatId}
                    onChange={(event) => setChatId(event.target.value)}
                    className="bg-zinc-950"
                    placeholder="-1001234567890"
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
                  <Label
                    htmlFor="telegram-enabled"
                    className="text-sm text-zinc-300"
                  >
                    Channel enabled
                  </Label>
                  <Switch
                    id="telegram-enabled"
                    checked={enabled}
                    onCheckedChange={setEnabled}
                  />
                </div>

                {telegramMessage ? (
                  <p className="text-sm text-zinc-300">{telegramMessage}</p>
                ) : null}

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      savingTelegram ||
                      testingTelegram ||
                      botToken.trim() === '' ||
                      chatId.trim() === ''
                    }
                    onClick={onTestTelegram}
                  >
                    {testingTelegram ? 'Sending test...' : 'Send Test Message'}
                  </Button>

                  <Button
                    type="submit"
                    disabled={savingTelegram || testingTelegram}
                  >
                    {savingTelegram ? 'Saving...' : 'Save Telegram Settings'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="runtime">
        <Card>
          <CardHeader>
            <CardTitle>Runtime Controls</CardTitle>
            <CardDescription>
              Global worker configuration that applies to every monitor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRuntime ? (
              <p className="text-sm text-zinc-400">Loading settings...</p>
            ) : (
              <form onSubmit={onSaveRuntime} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="checks-history-limit">
                    Checks History Limit (global)
                  </Label>
                  <Input
                    id="checks-history-limit"
                    type="number"
                    min={10}
                    step={1}
                    required
                    value={historyLimit}
                    onChange={(event) =>
                      setHistoryLimit(Number(event.target.value))
                    }
                    className="bg-zinc-950"
                  />
                  <p className="text-xs text-zinc-400">
                    Worker keeps only the latest N checks per monitor and
                    deletes older entries.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="runtime-timezone">Cron Timezone</Label>
                  <Input
                    id="runtime-timezone"
                    required
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    className="bg-zinc-950"
                    placeholder="America/New_York"
                  />
                  <p className="text-xs text-zinc-400">
                    Use an IANA timezone name (for example, UTC or
                    America/New_York). Cron schedules run in this timezone.
                  </p>
                </div>

                {requiredRuntimeSettings.length > 0 ? (
                  <p className="text-sm text-amber-300">
                    Required runtime settings missing:{' '}
                    {requiredRuntimeSettings.join(', ')}
                  </p>
                ) : null}

                {runtimeMessage ? (
                  <p className="text-sm text-zinc-300">{runtimeMessage}</p>
                ) : null}

                <Button type="submit" disabled={savingRuntime}>
                  {savingRuntime ? 'Saving...' : 'Save Runtime Settings'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
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
