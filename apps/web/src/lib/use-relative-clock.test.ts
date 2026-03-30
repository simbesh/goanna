import { describe, expect, it } from 'vitest'

import {
  formatRelativeShort,
  getEarliestRelativeClockDelay,
  getNextRelativeClockDelay,
} from '@/lib/use-relative-clock'

describe('getNextRelativeClockDelay', () => {
  it('clamps sub-second past updates to one second', () => {
    expect(getNextRelativeClockDelay(-1_500)).toBe(1_000)
  })

  it('waits for the next past minute boundary', () => {
    expect(getNextRelativeClockDelay(-61_000)).toBe(59_000)
  })

  it('waits for the next past hour boundary', () => {
    expect(getNextRelativeClockDelay(-(3 * 60 * 60 * 1000 + 5_000))).toBe(
      3_595_000,
    )
  })

  it('clamps sub-second future updates to one second', () => {
    expect(getNextRelativeClockDelay(59_500)).toBe(1_000)
  })

  it('waits for the next future hour boundary', () => {
    expect(getNextRelativeClockDelay(2 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe(
      30 * 60 * 1000,
    )
  })

  it('waits for the next future day boundary', () => {
    expect(getNextRelativeClockDelay(26 * 60 * 60 * 1000)).toBe(
      2 * 60 * 60 * 1000,
    )
  })

  it('uses one second at zero', () => {
    expect(getNextRelativeClockDelay(0)).toBe(1_000)
  })
})

describe('getEarliestRelativeClockDelay', () => {
  it('returns null when there are no finite timestamps', () => {
    expect(getEarliestRelativeClockDelay([], 1_000)).toBeNull()
    expect(
      getEarliestRelativeClockDelay(
        [Number.NaN, Number.POSITIVE_INFINITY],
        1_000,
      ),
    ).toBeNull()
  })

  it('returns the earliest delay across timestamps', () => {
    const now = 1_000_000

    expect(
      getEarliestRelativeClockDelay(
        [
          now - 61_000,
          now + 2 * 60 * 60 * 1000 + 30 * 60 * 1000,
          now + 26 * 60 * 60 * 1000,
        ],
        now,
      ),
    ).toBe(59_000)
  })
})

describe('formatRelativeShort', () => {
  it('returns Now for timestamps up to ten seconds in the past', () => {
    expect(formatRelativeShort(-10_000)).toBe('Now')
    expect(formatRelativeShort(-2_000)).toBe('Now')
  })

  it('returns Now for timestamps up to three seconds in the future', () => {
    expect(formatRelativeShort(0)).toBe('Now')
    expect(formatRelativeShort(3_000)).toBe('Now')
  })

  it('falls back to relative labels outside the Now window', () => {
    expect(formatRelativeShort(-10_001)).toBe('10s ago')
    expect(formatRelativeShort(3_001)).toBe('in 3s')
  })
})
