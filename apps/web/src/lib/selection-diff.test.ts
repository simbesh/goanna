import { describe, expect, it } from 'vitest'

import { collectDetailedDiffEntries } from './selection-diff'
import type { DetailedDiffEntry } from './selection-diff'

function diff(previous: unknown, current: unknown) {
  const entries: Array<DetailedDiffEntry> = []
  collectDetailedDiffEntries('value', previous, current, entries)
  return entries
}

describe('selection array differences', () => {
  it('shows a middle insertion once without shifting later markets', () => {
    expect(
      diff(
        ['BTC/AUD', 'PEPE/AUD', 'MANA/AUD'],
        ['BTC/AUD', 'NEAR/AUD', 'PEPE/AUD', 'MANA/AUD'],
      ),
    ).toEqual([
      { path: 'value["NEAR/AUD"]#1', change: 'added', newValue: 'NEAR/AUD' },
    ])
  })

  it('ignores reordering, including nested arrays and object properties', () => {
    expect(
      diff(
        [{ id: 1, networks: ['ETH', 'BASE'] }, { id: 2 }],
        [{ id: 2 }, { networks: ['BASE', 'ETH'], id: 1 }],
      ),
    ).toEqual([])
    expect(diff([1, '1', null, true], [true, null, '1', 1])).toEqual([])
  })

  it('retains duplicate counts and distinguishes primitive types', () => {
    expect(diff(['a', 'a', 1], ['a', '1'])).toEqual([
      { path: 'value["1"]#1', change: 'added', newValue: '1' },
      { path: 'value["a"]#2', change: 'removed', oldValue: 'a' },
      { path: 'value[1]#1', change: 'removed', oldValue: 1 },
    ])
  })

  it('produces stable output for unkeyed objects regardless of input order', () => {
    expect(diff([{ x: 1 }], [{ x: 3 }, { x: 2 }])).toEqual(
      diff([{ x: 1 }], [{ x: 2 }, { x: 3 }]),
    )
    expect(diff([{ x: 1 }, { x: 1 }], [{ x: 1 }])).toHaveLength(1)
  })

  it('matches networks by identity and shows actual field changes', () => {
    expect(
      diff(
        [
          { Network: 'Ethereum', enabled: true },
          { Network: 'Base', enabled: true },
        ],
        [
          { Network: 'Base', enabled: false },
          { Network: 'Ethereum', enabled: true },
        ],
      ),
    ).toEqual([
      {
        path: 'value[Network="Base"].enabled',
        change: 'changed',
        oldValue: true,
        newValue: false,
      },
    ])
  })

  it('handles empty arrays and nested insertions', () => {
    expect(diff([], [])).toEqual([])
    expect(diff(['a'], [])).toEqual([
      { path: 'value["a"]#1', change: 'removed', oldValue: 'a' },
    ])
    expect(diff({ networks: ['ETH'] }, { networks: ['BASE', 'ETH'] })).toEqual([
      { path: 'networks["BASE"]#1', change: 'added', newValue: 'BASE' },
    ])
  })
})
