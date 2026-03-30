import { useEffect, useState } from 'react'

const secondMs = 1000
const minuteMs = 60 * secondMs
const hourMs = 60 * minuteMs
const dayMs = 24 * hourMs
const nowPastThresholdMs = 10 * secondMs
const nowFutureThresholdMs = 3 * secondMs

function clampRelativeClockDelay(delayMs: number): number {
  if (!Number.isFinite(delayMs)) {
    return secondMs
  }

  return Math.min(Math.max(Math.ceil(delayMs), secondMs), dayMs)
}

function getPastRelativeClockDelay(absDeltaMs: number): number {
  if (absDeltaMs < minuteMs) {
    const elapsedSeconds = Math.max(1, Math.floor(absDeltaMs / secondMs))
    return (elapsedSeconds + 1) * secondMs - absDeltaMs
  }

  if (absDeltaMs < hourMs) {
    const elapsedMinutes = Math.floor(absDeltaMs / minuteMs)
    return (elapsedMinutes + 1) * minuteMs - absDeltaMs
  }

  if (absDeltaMs < dayMs) {
    const elapsedHours = Math.floor(absDeltaMs / hourMs)
    return (elapsedHours + 1) * hourMs - absDeltaMs
  }

  const elapsedDays = Math.floor(absDeltaMs / dayMs)
  return (elapsedDays + 1) * dayMs - absDeltaMs
}

function getFutureRelativeClockDelay(deltaMs: number): number {
  if (deltaMs < secondMs) {
    return deltaMs
  }

  if (deltaMs < minuteMs) {
    const remainingSeconds = Math.max(1, Math.floor(deltaMs / secondMs))
    return deltaMs - remainingSeconds * secondMs
  }

  if (deltaMs < hourMs) {
    const remainingMinutes = Math.floor(deltaMs / minuteMs)
    return deltaMs - remainingMinutes * minuteMs
  }

  if (deltaMs < dayMs) {
    const remainingHours = Math.floor(deltaMs / hourMs)
    return deltaMs - remainingHours * hourMs
  }

  const remainingDays = Math.floor(deltaMs / dayMs)
  return deltaMs - remainingDays * dayMs
}

export function getNextRelativeClockDelay(deltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs === 0) {
    return secondMs
  }

  const nextDelay =
    deltaMs < 0
      ? getPastRelativeClockDelay(Math.abs(deltaMs))
      : getFutureRelativeClockDelay(deltaMs)

  return clampRelativeClockDelay(nextDelay)
}

export function formatRelativeShort(deltaMs: number): string {
  if (!Number.isFinite(deltaMs)) {
    return '-'
  }

  if (deltaMs >= -nowPastThresholdMs && deltaMs <= nowFutureThresholdMs) {
    return 'Now'
  }

  const absoluteMs = Math.abs(deltaMs)
  const amount = formatDurationShort(absoluteMs)

  if (deltaMs > 0) {
    return `in ${amount}`
  }

  return `${amount} ago`
}

export function getEarliestRelativeClockDelay(
  timestamps: Array<number>,
  now: number,
): number | null {
  let earliestDelay: number | null = null

  for (const timestamp of timestamps) {
    if (!Number.isFinite(timestamp)) {
      continue
    }

    const delay = getNextRelativeClockDelay(timestamp - now)
    earliestDelay =
      earliestDelay === null ? delay : Math.min(earliestDelay, delay)
  }

  return earliestDelay
}

function formatDurationShort(ms: number): string {
  if (ms < minuteMs) {
    const seconds = Math.max(1, Math.floor(ms / secondMs))
    return `${seconds}s`
  }

  const totalMinutes = Math.floor(ms / minuteMs)
  if (totalMinutes < 60) {
    return `${totalMinutes}m`
  }

  const totalHours = Math.floor(totalMinutes / 60)
  if (totalHours < 24) {
    return `${totalHours}h`
  }

  const totalDays = Math.floor(totalHours / 24)
  if (totalDays < 30) {
    return `${totalDays}d`
  }

  const totalMonths = Math.floor(totalDays / 30)
  if (totalMonths < 12) {
    return `${totalMonths}M`
  }

  const totalYears = Math.floor(totalMonths / 12)
  return `${totalYears}y`
}

export function useRelativeClock(timestamps: Array<number>): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const delay = getEarliestRelativeClockDelay(timestamps, now)
    if (delay === null) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setNow(Date.now())
    }, delay)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [now, timestamps])

  return now
}
