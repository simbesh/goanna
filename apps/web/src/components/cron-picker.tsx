import { useMemo } from 'react'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

  function updateRule(nextRule: Partial<CronRule>) {
    const currentRule = normalizeRule(parsedRule ?? DEFAULT_RULE)
    const merged = normalizeRule({ ...currentRule, ...nextRule })
    onChange(buildCronRule(merged))
  }

  const rule = normalizeRule(parsedRule ?? DEFAULT_RULE)
  const intervalMax = getIntervalMax(rule.unit)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
        <Input
          id={id}
          className="h-7 w-44 bg-zinc-950 font-mono"
          placeholder="*/5 * * * *"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="text-zinc-400">Builder:</span>
        <span>Every</span>
        <Input
          type="number"
          min={1}
          max={intervalMax}
          className="h-7 w-20 bg-zinc-950 text-center"
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
          <SelectTrigger className="h-7 min-w-28 bg-zinc-950 text-zinc-200">
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
              <SelectTrigger className="h-7 min-w-20 bg-zinc-950 text-zinc-200">
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
              <SelectTrigger className="h-7 min-w-20 bg-zinc-950 text-zinc-200">
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
        Enter a 5-part cron expression: minute hour day month weekday.
      </p>
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
