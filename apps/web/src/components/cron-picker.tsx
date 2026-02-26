import { useEffect, useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getCronDescription } from '@/lib/cron'
import { cn } from '@/lib/utils'

type CronUnit = 'minute' | 'hour' | 'day'

type CronRule = {
  unit: CronUnit
  interval: number
  minute: number
  hour: number
}

const DEFAULT_RULE: CronRule = {
  unit: 'minute',
  interval: 5,
  minute: 0,
  hour: 0,
}

const MINUTES = Array.from({ length: 60 }, (_, index) => index)
const HOURS = Array.from({ length: 24 }, (_, index) => index)

type CronPickerProps = {
  id?: string
  value: string
  onChange: (value: string) => void
}

export function CronPicker({ id, value, onChange }: CronPickerProps) {
  const parsedRule = useMemo(() => parseCronRule(value), [value])
  const cronDescription = useMemo(() => getCronDescription(value), [value])
  const [mode, setMode] = useState<'builder' | 'custom'>(
    parsedRule ? 'builder' : 'custom',
  )

  useEffect(() => {
    if (!parsedRule && mode === 'builder') {
      setMode('custom')
    }
  }, [mode, parsedRule])

  function updateRule(nextRule: Partial<CronRule>) {
    const currentRule = normalizeRule(parsedRule ?? DEFAULT_RULE)
    const merged = normalizeRule({ ...currentRule, ...nextRule })
    onChange(buildCronRule(merged))
  }

  function onToggleMode(nextMode: 'builder' | 'custom') {
    if (nextMode === 'builder') {
      onChange(buildCronRule(parsedRule ?? DEFAULT_RULE))
    }
    setMode(nextMode)
  }

  const rule = normalizeRule(parsedRule ?? DEFAULT_RULE)
  const intervalMax = getIntervalMax(rule.unit)

  return (
    <div className="space-y-3 rounded-md border border-zinc-700 bg-zinc-900 p-3">
      <div className="inline-flex rounded-md border border-zinc-700 bg-zinc-950 p-1">
        <button
          type="button"
          className={cn(
            'rounded px-2 py-1 text-xs transition-colors',
            mode === 'builder'
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200',
          )}
          onClick={() => onToggleMode('builder')}
        >
          Builder
        </button>
        <button
          type="button"
          className={cn(
            'rounded px-2 py-1 text-xs transition-colors',
            mode === 'custom'
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200',
          )}
          onClick={() => onToggleMode('custom')}
        >
          Custom
        </button>
      </div>

      {mode === 'builder' ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
            <span>Every</span>
            <Input
              id={id}
              type="number"
              min={1}
              max={intervalMax}
              className="h-8 w-20 bg-zinc-950 text-center"
              value={String(rule.interval)}
              onChange={(event) =>
                updateRule({
                  interval: Number(event.target.value),
                })
              }
            />
            <Select
              value={rule.unit}
              onValueChange={(nextValue) => {
                if (!isCronUnit(nextValue)) {
                  return
                }
                updateRule({ unit: nextValue })
              }}
            >
              <SelectTrigger className="h-8 min-w-28 bg-zinc-950 text-zinc-200">
                <SelectValue placeholder="time unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minute">minute(s)</SelectItem>
                <SelectItem value="hour">hour(s)</SelectItem>
                <SelectItem value="day">day(s)</SelectItem>
              </SelectContent>
            </Select>

            {rule.unit === 'hour' || rule.unit === 'day' ? (
              <>
                <span>at minute</span>
                <Select
                  value={String(rule.minute)}
                  onValueChange={(nextValue) => {
                    if (nextValue == null) {
                      return
                    }
                    updateRule({ minute: Number(nextValue) })
                  }}
                >
                  <SelectTrigger className="h-8 min-w-20 bg-zinc-950 text-zinc-200">
                    <SelectValue placeholder="minute" />
                  </SelectTrigger>
                  <SelectContent>
                    {MINUTES.map((minute) => (
                      <SelectItem key={minute} value={String(minute)}>
                        {formatTwoDigits(minute)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}

            {rule.unit === 'day' ? (
              <>
                <span>hour</span>
                <Select
                  value={String(rule.hour)}
                  onValueChange={(nextValue) => {
                    if (nextValue == null) {
                      return
                    }
                    updateRule({ hour: Number(nextValue) })
                  }}
                >
                  <SelectTrigger className="h-8 min-w-20 bg-zinc-950 text-zinc-200">
                    <SelectValue placeholder="hour" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((hour) => (
                      <SelectItem key={hour} value={String(hour)}>
                        {formatTwoDigits(hour)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}
          </div>

          <p className="text-xs text-zinc-400">
            Cron expression:{' '}
            <code className="rounded bg-zinc-950 px-1.5 py-0.5 font-mono text-zinc-300">
              {buildCronRule(rule)}
            </code>
          </p>
          <p className="text-xs text-zinc-400">
            <span className="text-zinc-200">{cronDescription}</span>
          </p>
        </>
      ) : (
        <>
          <Input
            id={id}
            className="h-9 bg-zinc-950 font-mono"
            placeholder="*/5 * * * *"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="text-xs text-zinc-400">
            Enter a 5-part cron expression: minute hour day month weekday.
          </p>
          <p className="text-xs text-zinc-400">
            <span className="text-zinc-200">{cronDescription}</span>
          </p>
        </>
      )}
    </div>
  )
}

function buildCronRule(rule: CronRule): string {
  const normalized = normalizeRule(rule)

  if (normalized.unit === 'minute') {
    const minuteSegment =
      normalized.interval === 1 ? '*' : `*/${normalized.interval}`
    return `${minuteSegment} * * * *`
  }

  if (normalized.unit === 'hour') {
    const hourSegment =
      normalized.interval === 1 ? '*' : `*/${normalized.interval}`
    return `${normalized.minute} ${hourSegment} * * *`
  }

  const daySegment =
    normalized.interval === 1 ? '*' : `*/${normalized.interval}`
  return `${normalized.minute} ${normalized.hour} ${daySegment} * *`
}

function parseCronRule(value: string): CronRule | null {
  const segments = value.trim().split(/\s+/)
  if (segments.length !== 5) {
    return null
  }

  const [minuteSegment, hourSegment, daySegment, monthSegment, weekSegment] =
    segments
  if (monthSegment !== '*' || weekSegment !== '*') {
    return null
  }

  if (hourSegment === '*' && daySegment === '*') {
    if (minuteSegment === '*') {
      return { unit: 'minute', interval: 1, minute: 0, hour: 0 }
    }

    const minuteInterval = parseStep(minuteSegment, 59)
    if (minuteInterval) {
      return {
        unit: 'minute',
        interval: minuteInterval,
        minute: 0,
        hour: 0,
      }
    }
  }

  const minuteValue = parseInteger(minuteSegment, 0, 59)
  if (minuteValue == null) {
    return null
  }

  if (daySegment === '*') {
    if (hourSegment === '*') {
      return {
        unit: 'hour',
        interval: 1,
        minute: minuteValue,
        hour: 0,
      }
    }

    const hourInterval = parseStep(hourSegment, 24)
    if (hourInterval) {
      return {
        unit: 'hour',
        interval: hourInterval,
        minute: minuteValue,
        hour: 0,
      }
    }
  }

  const hourValue = parseInteger(hourSegment, 0, 23)
  if (hourValue == null) {
    return null
  }

  if (daySegment === '*') {
    return {
      unit: 'day',
      interval: 1,
      minute: minuteValue,
      hour: hourValue,
    }
  }

  const dayInterval = parseStep(daySegment, 31)
  if (!dayInterval) {
    return null
  }

  return {
    unit: 'day',
    interval: dayInterval,
    minute: minuteValue,
    hour: hourValue,
  }
}

function parseStep(segment: string, max: number): number | null {
  if (!segment.startsWith('*/')) {
    return null
  }

  const value = parseInteger(segment.slice(2), 1, max)
  return value ?? null
}

function parseInteger(
  value: string,
  min: number,
  max: number,
): number | undefined {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return undefined
  }
  return parsed
}

function normalizeRule(rule: CronRule): CronRule {
  return {
    unit: rule.unit,
    interval: clampInteger(rule.interval, 1, getIntervalMax(rule.unit)),
    minute: clampInteger(rule.minute, 0, 59),
    hour: clampInteger(rule.hour, 0, 23),
  }
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

function getIntervalMax(unit: CronUnit): number {
  if (unit === 'minute') {
    return 59
  }
  if (unit === 'hour') {
    return 24
  }
  return 31
}

function isCronUnit(value: string | null): value is CronUnit {
  return value === 'minute' || value === 'hour' || value === 'day'
}

function formatTwoDigits(value: number): string {
  return value.toString().padStart(2, '0')
}
