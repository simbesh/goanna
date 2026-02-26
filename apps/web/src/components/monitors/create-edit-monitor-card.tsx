import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { sileo } from 'sileo'
import type {
  CreateMonitorRequest,
  Monitor as MonitorRecord,
  SelectorPreviewResponse,
  TestMonitorResponse,
} from '@goanna/api-client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { CronPicker } from '@/components/cron-picker'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  DefaultService,
  previewMonitorSelector,
  triggerMonitor,
  updateMonitor,
} from '@/lib/api'

type FormState = {
  label: string
  method: string
  url: string
  iconUrl: string
  body: string
  headers: string
  auth: string
  notifyTelegram: boolean
  selector: string
  expectedType: 'json' | 'html' | 'text'
  expectedResponse: string
  cron: string
  enabled: boolean
  triggerOnCreate: boolean
}

type TestResult = TestMonitorResponse

type CreateEditMonitorCardProps = {
  editingMonitor: MonitorRecord | null
  onCancelEdit: () => void
  onSaved: () => Promise<void>
}

const defaultHeaders = '{\n  "Accept": "application/json"\n}'
const defaultAuth = '{\n  "type": "bearer",\n  "token": ""\n}'

const defaultForm: FormState = {
  label: '',
  method: 'GET',
  url: '',
  iconUrl: '',
  body: '',
  headers: defaultHeaders,
  auth: defaultAuth,
  notifyTelegram: true,
  selector: '',
  expectedType: 'json',
  expectedResponse: '',
  cron: '*/5 * * * *',
  enabled: true,
  triggerOnCreate: true,
}

export function CreateEditMonitorCard({
  editingMonitor,
  onCancelEdit,
  onSaved,
}: CreateEditMonitorCardProps) {
  const [form, setForm] = useState<FormState>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [testingUrl, setTestingUrl] = useState(false)
  const [testResponse, setTestResponse] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState('')
  const [testJSONBody, setTestJSONBody] = useState<string | null>(null)
  const [selectorPayloadToken, setSelectorPayloadToken] = useState<
    string | null
  >(null)
  const [previewingSelector, setPreviewingSelector] = useState(false)
  const [selectorPreview, setSelectorPreview] =
    useState<SelectorPreviewResponse | null>(null)
  const [selectorPreviewError, setSelectorPreviewError] = useState('')
  const [selectorPreviewUnavailable, setSelectorPreviewUnavailable] =
    useState(false)
  const selectorPreviewRequestID = useRef(0)
  const [isJsonResponseExpanded, setIsJsonResponseExpanded] = useState(false)

  const editingMonitorId = editingMonitor?.id ?? null

  useEffect(() => {
    if (editingMonitor) {
      setForm(mapMonitorToForm(editingMonitor))
    } else {
      setForm(defaultForm)
    }

    setError('')
    setTestError('')
    setTestResponse(null)
    setTestJSONBody(null)
    setSelectorPayloadToken(null)
    setSelectorPreview(null)
    setSelectorPreviewError('')
    setSelectorPreviewUnavailable(false)
    setIsJsonResponseExpanded(false)
  }, [editingMonitorId])

  const testResponseBodyText = useMemo(() => {
    if (!testResponse) {
      return 'null'
    }

    return testResponse.body === undefined
      ? 'null'
      : JSON.stringify(testResponse.body, null, 2)
  }, [testResponse])

  const selectorPreviewRawText = useMemo(() => {
    if (!selectorPreview?.exists) {
      return 'null'
    }

    return formatPreviewRaw(selectorPreview.raw)
  }, [selectorPreview])

  const deferredSelector = useDeferredValue(form.selector)
  const iconPreviewURL = useMemo(
    () => getMonitorIconPreviewURL(form.iconUrl, form.url),
    [form.iconUrl, form.url],
  )

  const toggleJSONResponseExpanded = useCallback(() => {
    setIsJsonResponseExpanded((current) => !current)
  }, [])

  useEffect(() => {
    selectorPreviewRequestID.current += 1
    const requestID = selectorPreviewRequestID.current

    if (
      !selectorPayloadToken &&
      testResponse &&
      isLargeJSONPreviewOnlyResponse(testResponse)
    ) {
      setPreviewingSelector(false)
      setSelectorPreview(null)
      setSelectorPreviewError(
        'Selector preview unavailable for this response size. Increase GOANNA_MAX_RESPONSE_BODY_BYTES and restart the API, then re-test.',
      )
      return
    }

    if (!selectorPayloadToken && !testJSONBody) {
      setPreviewingSelector(false)
      setSelectorPreview(null)
      setSelectorPreviewError('')
      return
    }

    if (selectorPreviewUnavailable) {
      setPreviewingSelector(false)
      return
    }

    const timer = window.setTimeout(() => {
      setPreviewingSelector(true)
      setSelectorPreviewError('')

      const previewRequest = selectorPayloadToken
        ? {
            json: 'null',
            token: selectorPayloadToken,
            selector: emptyToUndefined(deferredSelector),
          }
        : {
            json: testJSONBody ?? 'null',
            selector: emptyToUndefined(deferredSelector),
          }

      void previewMonitorSelector({
        ...previewRequest,
      })
        .then((preview: SelectorPreviewResponse) => {
          if (selectorPreviewRequestID.current !== requestID) {
            return
          }

          setSelectorPreview(preview)
        })
        .catch((caughtError: unknown) => {
          if (selectorPreviewRequestID.current !== requestID) {
            return
          }

          const message = getErrorMessage(caughtError)
          setSelectorPreview(null)
          setSelectorPreviewError(message)
          if (message.toLowerCase() === 'not found') {
            setSelectorPreviewUnavailable(true)
            setSelectorPreviewError(
              'Selector preview endpoint not found. Restart the API server.',
            )
          }
        })
        .finally(() => {
          if (selectorPreviewRequestID.current === requestID) {
            setPreviewingSelector(false)
          }
        })
    }, 200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    deferredSelector,
    selectorPayloadToken,
    selectorPreviewUnavailable,
    testResponse,
    testJSONBody,
  ])

  async function onSubmitMonitor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    const headers = parseJsonMap(form.headers, 'headers')
    if (!headers.ok) {
      setSubmitting(false)
      setError(headers.error)
      sileo.error({ title: headers.error })
      return
    }

    const auth = parseJsonMap(form.auth, 'auth')
    if (!auth.ok) {
      setSubmitting(false)
      setError(auth.error)
      sileo.error({ title: auth.error })
      return
    }

    try {
      const notificationChannels: Array<'telegram'> = form.notifyTelegram
        ? ['telegram']
        : []

      const requestBody = {
        label: emptyToUndefined(form.label),
        method: form.method,
        url: form.url,
        iconUrl: emptyToUndefined(form.iconUrl),
        body: emptyToUndefined(form.body),
        headers: headers.value,
        auth: auth.value,
        notificationChannels,
        selector: emptyToUndefined(form.selector),
        expectedType: form.expectedType as CreateMonitorRequest.expectedType,
        expectedResponse: emptyToUndefined(form.expectedResponse),
        cron: form.cron,
        enabled: form.enabled,
      }

      if (editingMonitor) {
        await updateMonitor(editingMonitor.id, requestBody)
      } else {
        const createdMonitor = await DefaultService.createMonitor({
          requestBody,
        })
        if (form.triggerOnCreate) {
          try {
            await triggerMonitor(createdMonitor.id)
          } catch (caughtError) {
            const message = getErrorMessage(caughtError)
            const errorMessage =
              message.trim() === ''
                ? 'Monitor created, but initial trigger failed.'
                : `Monitor created, but initial trigger failed: ${message}`
            setError(errorMessage)
            sileo.error({ title: errorMessage })
          }
        }
      }

      if (editingMonitor) {
        onCancelEdit()
      } else {
        setForm({ ...defaultForm, auth: form.auth, headers: form.headers })
      }

      await onSaved()
    } catch {
      const message = editingMonitor
        ? 'Failed to update monitor. Check fields and try again.'
        : 'Failed to create monitor. Check fields and try again.'
      setError(message)
      sileo.error({ title: message })
    } finally {
      setSubmitting(false)
    }
  }

  async function onTestUrl() {
    const url = form.url.trim()
    if (url === '') {
      setTestResponse(null)
      setTestError('Enter a URL to test.')
      sileo.error({ title: 'Enter a URL to test.' })
      return
    }

    const headers = parseJsonMap(form.headers, 'headers')
    if (!headers.ok) {
      setTestResponse(null)
      setTestError(headers.error)
      sileo.error({ title: headers.error })
      return
    }

    const auth = parseJsonMap(form.auth, 'auth')
    if (!auth.ok) {
      setTestResponse(null)
      setTestError(auth.error)
      sileo.error({ title: auth.error })
      return
    }

    const requestHeaders = { ...headers.value }

    const method = form.method.toUpperCase()
    const body =
      method === 'GET' || method === 'HEAD'
        ? undefined
        : emptyToUndefined(form.body)

    setTestingUrl(true)
    setTestError('')
    setTestResponse(null)
    setTestJSONBody(null)
    setSelectorPayloadToken(null)
    setSelectorPreview(null)
    setSelectorPreviewError('')
    setSelectorPreviewUnavailable(false)
    setIsJsonResponseExpanded(false)

    try {
      const response = await DefaultService.testMonitorUrl({
        requestBody: {
          method,
          url,
          body,
          headers: requestHeaders,
          auth: auth.value,
        },
      })

      setTestResponse(response)
      setTestJSONBody(getJSONBodyFromTestResponse(response))
      setSelectorPayloadToken(getSelectorPayloadTokenFromTestResponse(response))
    } catch (caughtError) {
      setTestResponse(null)
      setTestJSONBody(null)
      setSelectorPayloadToken(null)
      const message = getErrorMessage(caughtError)
      setTestError(message)
      sileo.error({ title: message })
    } finally {
      setTestingUrl(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {editingMonitor
            ? `Edit Monitor #${editingMonitor.id}`
            : 'Create Monitor'}
        </CardTitle>
        <CardDescription>
          Define request details, expected response shape, and cron schedule.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmitMonitor}>
          <div className="space-y-2">
            <Label htmlFor="cron">Schedule (Cron)</Label>
            <CronPicker
              id="cron"
              value={form.cron}
              onChange={(cronValue) =>
                setForm((current) => ({ ...current, cron: cronValue }))
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="label">Label (optional)</Label>
              <Input
                id="label"
                className="bg-zinc-950"
                placeholder="Homepage health"
                value={form.label}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="method">Method</Label>
              <Select
                value={form.method}
                onValueChange={(value) => {
                  if (!value) {
                    return
                  }
                  setForm((current) => ({ ...current, method: value }))
                }}
              >
                <SelectTrigger id="method" className="bg-zinc-950">
                  <SelectValue placeholder="HTTP method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedType">Expected Type</Label>
              <Select
                value={form.expectedType}
                onValueChange={(value) => {
                  if (
                    value === 'json' ||
                    value === 'html' ||
                    value === 'text'
                  ) {
                    setForm((current) => ({
                      ...current,
                      expectedType: value,
                    }))
                  }
                }}
              >
                <SelectTrigger id="expectedType" className="bg-zinc-950">
                  <SelectValue placeholder="Expected type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="url">URL</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="url"
                  className="bg-zinc-950 sm:flex-1"
                  placeholder="https://example.com/health"
                  required
                  value={form.url}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      url: event.target.value,
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void onTestUrl()}
                  disabled={testingUrl || form.url.trim() === ''}
                >
                  {testingUrl ? 'Testing...' : 'Test'}
                </Button>
              </div>

              {testError ? (
                <p className="text-sm text-red-300">{testError}</p>
              ) : null}

              {testResponse ? (
                <TestResponsePanel
                  bodyText={testResponseBodyText}
                  isExpanded={isJsonResponseExpanded}
                  onToggleExpanded={toggleJSONResponseExpanded}
                  response={testResponse}
                />
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="iconUrl">Icon URL (optional)</Label>
              <div className="flex items-center gap-2">
                <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded border border-zinc-800 bg-zinc-950">
                  {iconPreviewURL ? (
                    <img
                      src={iconPreviewURL}
                      alt=""
                      className="size-5 rounded"
                      loading="lazy"
                    />
                  ) : (
                    <div className="size-4 rounded bg-zinc-700" />
                  )}
                </div>
                <Input
                  id="iconUrl"
                  className="bg-zinc-950"
                  placeholder="Auto-generated from URL when left blank"
                  value={form.iconUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      iconUrl: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="selector">Selector (optional)</Label>
              <Input
                id="selector"
                className="bg-zinc-950"
                placeholder="data.status or data.items.#.name"
                value={form.selector}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    selector: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-zinc-500">
                gjson supports list mapping, e.g.{' '}
                <span className="font-mono">data.items.#.name</span>
              </p>

              {testResponse && !testJSONBody ? (
                <p className="text-xs text-zinc-500">
                  Selector preview is available after a JSON test response.
                </p>
              ) : null}

              {testJSONBody ? (
                <SelectorPreviewPanel
                  expectedResponse={form.expectedResponse.trim()}
                  preview={selectorPreview}
                  previewError={selectorPreviewError}
                  previewRawText={selectorPreviewRawText}
                  previewingSelector={previewingSelector}
                  unavailable={selectorPreviewUnavailable}
                />
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedResponse">
                Expected Response (optional)
              </Label>
              <Input
                id="expectedResponse"
                className="bg-zinc-950"
                placeholder="ok"
                value={form.expectedResponse}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expectedResponse: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="headers">Headers JSON (optional)</Label>
            <Textarea
              id="headers"
              className="min-h-24 bg-zinc-950 font-mono"
              value={form.headers}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  headers: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="auth">Auth JSON (optional)</Label>
            <Textarea
              id="auth"
              className="min-h-24 bg-zinc-950 font-mono"
              value={form.auth}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  auth: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Request Body (optional)</Label>
            <Textarea
              id="body"
              className="min-h-24 bg-zinc-950 font-mono"
              value={form.body}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  body: event.target.value,
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
            <Label htmlFor="notifyTelegram" className="text-sm text-zinc-300">
              Notify via Telegram channel
            </Label>
            <Switch
              id="notifyTelegram"
              checked={form.notifyTelegram}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, notifyTelegram: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
            <Label htmlFor="enabled" className="text-sm text-zinc-300">
              Enable monitor immediately
            </Label>
            <Switch
              id="enabled"
              checked={form.enabled}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, enabled: checked }))
              }
            />
          </div>

          {!editingMonitor ? (
            <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
              <Label
                htmlFor="triggerOnCreate"
                className="text-sm text-zinc-300"
              >
                Trigger first run immediately
              </Label>
              <input
                id="triggerOnCreate"
                type="checkbox"
                className="size-4 cursor-pointer rounded border-zinc-700 bg-zinc-900 accent-zinc-200"
                checked={form.triggerOnCreate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    triggerOnCreate: event.target.checked,
                  }))
                }
              />
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex gap-2">
            {editingMonitor ? (
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting
                ? 'Saving...'
                : editingMonitor
                  ? 'Save Monitor'
                  : 'Create Monitor'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

type TestResponsePanelProps = {
  response: TestResult
  bodyText: string
  isExpanded: boolean
  onToggleExpanded: () => void
}

const TestResponsePanel = memo(function TestResponsePanel({
  response,
  bodyText,
  isExpanded,
  onToggleExpanded,
}: TestResponsePanelProps) {
  return (
    <div>
      <div className="relative overflow-hidden rounded-md border border-zinc-800">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="absolute top-2 right-2 z-10"
          onClick={onToggleExpanded}
          aria-label={
            isExpanded ? 'Use max-height JSON view' : 'Maximize JSON view'
          }
          title={isExpanded ? 'Use max-height JSON view' : 'Maximize JSON view'}
        >
          {isExpanded ? <Minimize2 /> : <Maximize2 />}
        </Button>

        {isExpanded ? (
          <SyntaxHighlighter
            language="json"
            style={oneDark}
            customStyle={{
              margin: 0,
              borderRadius: 0,
              fontSize: '0.75rem',
            }}
            wrapLongLines
          >
            {bodyText}
          </SyntaxHighlighter>
        ) : (
          <ScrollArea className="h-80">
            <SyntaxHighlighter
              language="json"
              style={oneDark}
              customStyle={{
                margin: 0,
                borderRadius: 0,
                fontSize: '0.75rem',
              }}
              wrapLongLines
            >
              {bodyText}
            </SyntaxHighlighter>
          </ScrollArea>
        )}
      </div>

      <Accordion
        type="single"
        collapsible
        className="mt-2 border-zinc-800 bg-zinc-950"
      >
        <AccordionItem
          value="response-details"
          className="border-zinc-800 data-open:bg-zinc-900/40"
        >
          <AccordionTrigger className="px-3 py-2 text-zinc-300 hover:no-underline">
            Response details
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3 text-xs text-zinc-300">
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="text-zinc-500">Status:</span> {response.status}
              </p>
              <p>
                <span className="text-zinc-500">OK:</span>{' '}
                {response.ok ? 'Yes' : 'No'}
              </p>
              <p>
                <span className="text-zinc-500">Status Text:</span>{' '}
                {response.statusText || '-'}
              </p>
              <p>
                <span className="text-zinc-500">Headers:</span>{' '}
                {Object.keys(response.headers).length}
              </p>
            </div>

            {Object.keys(response.headers).length > 0 ? (
              <div className="mt-2 border-t border-zinc-800 pt-2">
                <p className="mb-1 text-zinc-500">Response Headers</p>
                <div className="space-y-1">
                  {Object.entries(response.headers).map(([key, value]) => (
                    <p key={key} className="break-all">
                      <span className="font-medium text-zinc-400">{key}:</span>{' '}
                      {value}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
})

type SelectorPreviewPanelProps = {
  unavailable: boolean
  previewingSelector: boolean
  preview: SelectorPreviewResponse | null
  previewError: string
  expectedResponse: string
  previewRawText: string
}

const SelectorPreviewPanel = memo(function SelectorPreviewPanel({
  unavailable,
  previewingSelector,
  preview,
  previewError,
  expectedResponse,
  previewRawText,
}: SelectorPreviewPanelProps) {
  return (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="grid gap-1 text-xs text-zinc-300 sm:grid-cols-2">
        <p>
          <span className="text-zinc-500">Preview:</span>{' '}
          {unavailable
            ? 'Unavailable'
            : previewingSelector
              ? 'Updating...'
              : 'Ready'}
        </p>
        <p>
          <span className="text-zinc-500">Type:</span>{' '}
          {previewError ? '-' : (preview?.type ?? '-')}
        </p>
        <p>
          <span className="text-zinc-500">Exists:</span>{' '}
          {previewError ? '-' : preview ? (preview.exists ? 'Yes' : 'No') : '-'}
        </p>
        <p>
          <span className="text-zinc-500">Normalized:</span>{' '}
          {previewError ? '-' : (preview?.value ?? '-')}
        </p>
        {expectedResponse !== '' && preview ? (
          <p>
            <span className="text-zinc-500">Matches expected:</span>{' '}
            {preview.value === expectedResponse ? 'Yes' : 'No'}
          </p>
        ) : null}
      </div>

      {previewError ? (
        <p className="text-xs text-red-300">{previewError}</p>
      ) : null}

      <div className="overflow-hidden rounded-md border border-zinc-800">
        <SyntaxHighlighter
          language="json"
          style={oneDark}
          customStyle={{
            margin: 0,
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
          }}
          wrapLongLines
        >
          {previewRawText}
        </SyntaxHighlighter>
      </div>
    </div>
  )
})

function mapMonitorToForm(monitor: MonitorRecord): FormState {
  return {
    label: monitor.label ?? '',
    method: monitor.method,
    url: monitor.url,
    iconUrl: monitor.iconUrl,
    body: monitor.body ?? '',
    headers: formatJsonMap(monitor.headers, defaultHeaders),
    auth: formatJsonMap(monitor.auth, defaultAuth),
    notifyTelegram: hasTelegramChannel(monitor),
    selector: monitor.selector ?? '',
    expectedType: monitor.expectedType,
    expectedResponse: monitor.expectedResponse ?? '',
    cron: monitor.cron,
    enabled: monitor.enabled,
    triggerOnCreate: true,
  }
}

function getMonitorIconPreviewURL(
  iconUrl: string,
  rawURL: string,
): string | null {
  const trimmedIconURL = iconUrl.trim()
  if (trimmedIconURL !== '') {
    return trimmedIconURL
  }

  const domain = getMonitorDomain(rawURL)
  if (domain === '') {
    return null
  }

  return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`
}

function getMonitorDomain(rawURL: string): string {
  const trimmedURL = rawURL.trim()
  if (trimmedURL === '') {
    return ''
  }

  const directDomain = parseHostname(trimmedURL)
  if (directDomain !== '') {
    return directDomain
  }

  if (trimmedURL.includes('://')) {
    return ''
  }

  return parseHostname(`https://${trimmedURL}`)
}

function parseHostname(value: string): string {
  try {
    const url = new URL(value)
    const parts = url.hostname.split('.')
    return parts.slice(-2).join('.')
  } catch {
    return ''
  }
}

function hasTelegramChannel(monitor: MonitorRecord): boolean {
  const notificationChannels = (
    monitor as MonitorRecord & { notificationChannels?: unknown }
  ).notificationChannels
  if (!Array.isArray(notificationChannels)) {
    return false
  }

  return notificationChannels.includes('telegram')
}

function formatJsonMap(
  value: Record<string, string> | undefined,
  fallback: string,
): string {
  if (!value || Object.keys(value).length === 0) {
    return fallback
  }

  return JSON.stringify(value, null, 2)
}

function getJSONBodyFromTestResponse(response: TestResult): string | null {
  const contentType = getHeaderValue(response.headers, 'content-type')
  if (!contentType.toLowerCase().includes('application/json')) {
    return null
  }

  const encoded = JSON.stringify(response.body)
  if (typeof encoded !== 'string') {
    return null
  }

  return encoded
}

function getSelectorPayloadTokenFromTestResponse(
  response: TestResult,
): string | null {
  const token = (response as TestResult & { selectorPayloadToken?: unknown })
    .selectorPayloadToken
  if (typeof token !== 'string') {
    return null
  }

  const trimmed = token.trim()
  return trimmed === '' ? null : trimmed
}

function isLargeJSONPreviewOnlyResponse(response: TestResult): boolean {
  const contentType = getHeaderValue(
    response.headers,
    'content-type',
  ).toLowerCase()
  if (!contentType.includes('application/json')) {
    return false
  }

  const body = (response as TestResult & { body?: unknown }).body
  return typeof body === 'string' && body.endsWith('... [truncated]')
}

function getHeaderValue(
  headers: Record<string, string>,
  targetKey: string,
): string {
  const lowerTarget = targetKey.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerTarget) {
      return value
    }
  }
  return ''
}

function formatPreviewRaw(raw: string | null | undefined): string {
  if (raw === undefined || raw === null) {
    return 'null'
  }

  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function parseJsonMap(
  value: string,
  name: string,
): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  if (value.trim() === '') {
    return { ok: true, value: {} }
  }

  try {
    const parsed = JSON.parse(value)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return { ok: false, error: `${name} must be a JSON object.` }
    }

    const mapped: Record<string, string> = {}
    for (const [key, entry] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof entry !== 'string') {
        return { ok: false, error: `${name} values must be strings.` }
      }
      mapped[key] = entry
    }
    return { ok: true, value: mapped }
  } catch {
    return { ok: false, error: `${name} must be valid JSON.` }
  }
}

function getErrorMessage(caughtError: unknown): string {
  if (
    caughtError &&
    typeof caughtError === 'object' &&
    'body' in caughtError &&
    typeof caughtError.body === 'object' &&
    caughtError.body &&
    'error' in caughtError.body &&
    typeof caughtError.body.error === 'string'
  ) {
    return caughtError.body.error
  }

  if (caughtError instanceof Error) {
    return caughtError.message
  }

  return 'Failed to fetch URL.'
}
