import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { sileo } from 'sileo'
import type {
  MonitorCheck as MonitorCheckRecord,
  Monitor as MonitorRecord,
} from '@goanna/api-client'

import {
  ConfiguredMonitorsCard,
  ConfiguredMonitorsTableCard,
} from '@/components/monitors/configured-monitors-card'
import { CreateEditMonitorCard } from '@/components/monitors/create-edit-monitor-card'
import { DefaultService, deleteMonitor, triggerMonitor } from '@/lib/api'

export const Route = createFileRoute('/')({
  component: MonitorsPage,
})

function MonitorsPage() {
  const [monitors, setMonitors] = useState<Array<MonitorRecord>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedMonitorId, setExpandedMonitorId] = useState<number | null>(
    null,
  )
  const [checksByMonitor, setChecksByMonitor] = useState<
    Partial<Record<number, Array<MonitorCheckRecord>>>
  >({})
  const [checksErrors, setChecksErrors] = useState<Record<number, string>>({})
  const [loadingChecksFor, setLoadingChecksFor] = useState<number | null>(null)
  const [editingMonitorId, setEditingMonitorId] = useState<number | null>(null)
  const [triggeringMonitorId, setTriggeringMonitorId] = useState<number | null>(
    null,
  )
  const [deletingMonitorId, setDeletingMonitorId] = useState<number | null>(null)

  const loadMonitors = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await DefaultService.listMonitors()
      setMonitors(data)
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        'Failed to load monitors from API.',
      )
      setError(message)
      sileo.error({ title: message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMonitors()
  }, [loadMonitors])

  const loadMonitorChecks = useCallback(async (monitorId: number) => {
    setLoadingChecksFor(monitorId)
    setChecksErrors((current) => ({ ...current, [monitorId]: '' }))
    try {
      const checks = await DefaultService.listMonitorChecks({
        monitorId,
        limit: 20,
      })
      setChecksByMonitor((current) => ({
        ...current,
        [monitorId]: checks,
      }))
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        'Failed to load recent checks.',
      )
      setChecksErrors((current) => ({
        ...current,
        [monitorId]: message,
      }))
      sileo.error({ title: message })
    } finally {
      setLoadingChecksFor(null)
    }
  }, [])

  const toggleMonitorChecks = useCallback(
    async (monitorId: number) => {
      if (expandedMonitorId === monitorId) {
        setExpandedMonitorId(null)
        return
      }

      setExpandedMonitorId(monitorId)

      if (checksByMonitor[monitorId]) {
        return
      }

      await loadMonitorChecks(monitorId)
    },
    [checksByMonitor, expandedMonitorId, loadMonitorChecks],
  )

  const editingMonitor = useMemo(
    () =>
      monitors.find((monitor) =>
        editingMonitorId === null ? false : monitor.id === editingMonitorId,
      ) ?? null,
    [editingMonitorId, monitors],
  )

  const onEditMonitor = useCallback((monitor: MonitorRecord) => {
    setEditingMonitorId(monitor.id)
  }, [])

  const onCancelEdit = useCallback(() => {
    setEditingMonitorId(null)
  }, [])

  const onTriggerMonitor = useCallback(
    async (monitor: MonitorRecord) => {
      setTriggeringMonitorId(monitor.id)
      setError('')
      try {
        await triggerMonitor(monitor.id)
        await loadMonitors()

        if (expandedMonitorId === monitor.id) {
          await loadMonitorChecks(monitor.id)
        }
      } catch (caughtError) {
        const message = getErrorMessage(
          caughtError,
          'Failed to trigger monitor.',
        )
        setError(message)
        sileo.error({ title: message })
      } finally {
        setTriggeringMonitorId(null)
      }
    },
    [expandedMonitorId, loadMonitorChecks, loadMonitors],
  )

  const onDeleteMonitor = useCallback(
    async (monitor: MonitorRecord) => {
      const shouldDelete = globalThis.confirm(
        `Delete monitor for ${monitor.url}? This cannot be undone.`,
      )
      if (!shouldDelete) {
        return
      }

      setDeletingMonitorId(monitor.id)
      setError('')
      try {
        await deleteMonitor(monitor.id)

        setExpandedMonitorId((current) =>
          current === monitor.id ? null : current,
        )
        setEditingMonitorId((current) =>
          current === monitor.id ? null : current,
        )
        setChecksByMonitor((current) => {
          const next = { ...current }
          delete next[monitor.id]
          return next
        })
        setChecksErrors((current) => {
          const next = { ...current }
          delete next[monitor.id]
          return next
        })

        await loadMonitors()
      } catch (caughtError) {
        const message = getErrorMessage(caughtError, 'Failed to delete monitor.')
        setError(message)
        sileo.error({ title: message })
      } finally {
        setDeletingMonitorId(null)
      }
    },
    [loadMonitors],
  )

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <ConfiguredMonitorsTableCard
        checksByMonitor={checksByMonitor}
        checksErrors={checksErrors}
        editingMonitorId={editingMonitorId}
        loading={loading}
        loadingChecksFor={loadingChecksFor}
        monitors={monitors}
        onDeleteMonitor={onDeleteMonitor}
        onEditMonitor={onEditMonitor}
        onRefreshChecks={loadMonitorChecks}
        onTriggerMonitor={onTriggerMonitor}
        deletingMonitorId={deletingMonitorId}
        triggeringMonitorId={triggeringMonitorId}
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <CreateEditMonitorCard
          editingMonitor={editingMonitor}
          onCancelEdit={onCancelEdit}
          onSaved={loadMonitors}
        />

        <ConfiguredMonitorsCard
          checksByMonitor={checksByMonitor}
          checksErrors={checksErrors}
          editingMonitorId={editingMonitorId}
          expandedMonitorId={expandedMonitorId}
          loading={loading}
          loadingChecksFor={loadingChecksFor}
          monitors={monitors}
          onEditMonitor={onEditMonitor}
          onRefreshChecks={loadMonitorChecks}
          onToggleChecks={toggleMonitorChecks}
          onDeleteMonitor={onDeleteMonitor}
          onTriggerMonitor={onTriggerMonitor}
          deletingMonitorId={deletingMonitorId}
          triggeringMonitorId={triggeringMonitorId}
        />
      </div>
    </div>
  )
}

function getErrorMessage(caughtError: unknown, fallback: string): string {
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

  if (caughtError instanceof Error && caughtError.message.trim() !== '') {
    return caughtError.message
  }

  return fallback
}
