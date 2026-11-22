// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { MonitorChecksList } from './configured-monitors-card'
import type { MonitorCheck } from '@goanna/api-client'

afterEach(cleanup)

function check(overrides: Partial<MonitorCheck> = {}): MonitorCheck {
  return {
    id: 1,
    status: 'ok',
    checkedAt: '2026-11-22T08:00:00Z',
    selectionType: 'string',
    selectionValue: 'Ready',
    diffKind: 'initial',
    diffChanged: false,
    ...overrides,
  }
}

function history(checks: Array<MonitorCheck>) {
  return render(
    <MonitorChecksList
      checks={checks}
      hasMore={false}
      loading={false}
      onLoadMore={() => {}}
    />,
  )
}

describe('monitor change history', () => {
  it.each([
    ['string', 'Ready', 'Ready'],
    ['number', '42', '42'],
    ['false', 'false', 'false'],
    ['null', 'null', 'null'],
    ['json', '{"enabled":true}', '"enabled": true'],
    ['json', '["Ethereum","Base"]', '"Ethereum"'],
  ])(
    'shows the only initial capture for %s values',
    (selectionType, selectionValue, expected) => {
      history([check({ selectionType, selectionValue })])
      expect(screen.getByText('Initial capture')).toBeTruthy()
      expect(screen.getByText('Captured value')).toBeTruthy()
      expect(screen.getByLabelText('Captured value').textContent).toContain(
        expected,
      )
      expect(
        screen.queryByText('No changes recorded for this monitor.'),
      ).toBeNull()
    },
  )

  it('keeps the baseline visible after unchanged checks', () => {
    history([
      check({ id: 2, diffKind: 'text', diffSummary: 'text unchanged' }),
      check(),
    ])
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1)
    expect(screen.getByText('Initial capture')).toBeTruthy()
    expect(screen.queryByText('text unchanged')).toBeNull()
  })

  it('shows a single added market without empty before panels', () => {
    history([
      check({
        id: 2,
        selectionType: 'json',
        selectionValue: '["BTC","NEAR","ETH"]',
        diffKind: 'array',
        diffChanged: true,
      }),
      check({ selectionType: 'json', selectionValue: '["BTC","ETH"]' }),
    ])
    expect(screen.getByText('NEAR')).toBeTruthy()
    expect(screen.queryByText('Before')).toBeNull()
    expect(screen.getAllByRole('row')).toHaveLength(2)
  })

  it('shows before and after for text without treating JSON-looking strings as objects', () => {
    history([
      check({
        id: 2,
        selectionValue: '{"state": "new"}',
        diffKind: 'text',
        diffChanged: true,
      }),
      check({ selectionValue: '{"state":"old"}' }),
    ])
    expect(screen.getByText('{"state":"old"}')).toBeTruthy()
    expect(screen.getByText('{"state": "new"}')).toBeTruthy()
    expect(screen.getByText('Before')).toBeTruthy()
    expect(screen.getByText('After')).toBeTruthy()
    expect(screen.queryByText('state')).toBeNull()
  })

  it('shows changed object fields and allows collapsing the latest entry', () => {
    history([
      check({
        id: 2,
        selectionType: 'json',
        selectionValue: '{"enabled":false}',
        diffKind: 'object',
        diffChanged: true,
      }),
      check({ selectionType: 'json', selectionValue: '{"enabled":true}' }),
    ])
    expect(screen.getByText('enabled')).toBeTruthy()
    expect(screen.getByText('true')).toBeTruthy()
    expect(screen.getByText('false')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { expanded: true }))
    expect(screen.queryByText('enabled')).toBeNull()
  })

  it('shows the captured value when the previous check has not been loaded', () => {
    history([check({ diffKind: 'text', diffChanged: true })])
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(
      screen.getByText(
        'Load earlier checks to compare with the previous value.',
      ),
    ).toBeTruthy()
  })
})
