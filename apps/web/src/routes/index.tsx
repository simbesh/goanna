import {
  createMonitorMutation,
  deleteMonitorMutation,
  listMonitorChecksOptions,
  listMonitorsOptions,
  listMonitorsQueryKey,
  triggerMonitorMutation,
  updateMonitorMutation,
} from '@goanna/api-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { sileo } from 'sileo'
import type {
  CreateMonitorRequest,
  MonitorCheck as MonitorCheckRecord,
  Monitor as MonitorRecord,
  MonitorTriggerResult,
} from '@goanna/api-client'

import {
  ConfiguredMonitorsCard,
  ConfiguredMonitorsTableCard,
} from '@/components/monitors/configured-monitors-card'
import { CreateEditMonitorCard } from '@/components/monitors/create-edit-monitor-card'
import { getApiErrorMessage } from '@/lib/api'

export const Route = createFileRoute('/')({
  component: MonitorsPage,
})

function MonitorsPage() {
  const queryClient = useQueryClient()
  const monitorsQuery = useQuery(listMonitorsOptions())
  const createMonitorRequest = useMutation(createMonitorMutation())
  const triggerMonitorRequest = useMutation(triggerMonitorMutation())
  const deleteMonitorRequest = useMutation(deleteMonitorMutation())
  const updateMonitorRequest = useMutation(updateMonitorMutation())

  const [error, setError] = useState('')
  const [expandedMonitorId, setExpandedMonitorId] = useState<number | null>(null)
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
  const [batchTriggering, setBatchTriggering] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [togglingMonitorId, setTogglingMonitorId] = useState<number | null>(
    null,
  )

  const monitors = monitorsQuery.data ?? []
  const loading = monitorsQuery.isPending

  useEffect(() => {
    if (!monitorsQuery.error) {
      return
    }

    const message = getApiErrorMessage(
      monitorsQuery.error,
      'Failed to load monitors from API.',
    )
    setError(message)
    sileo.error({ title: message })
  }, [monitorsQuery.error])

  const loadMonitors = useCallback(async () => {
    setError('')
    await monitorsQuery.refetch()
  }, [monitorsQuery])

  const loadMonitorChecks = useCallback(
    async (monitorId: number) => {
      setLoadingChecksFor(monitorId)
      setChecksErrors((current) => ({ ...current, [monitorId]: '' }))

      try {
        const checks = await queryClient.fetchQuery(
          listMonitorChecksOptions({
            path: { monitorId },
            query: { limit: 20 },
          }),
        )

        setChecksByMonitor((current) => ({
          ...current,
          [monitorId]: checks,
        }))
      } catch (caughtError) {
        const message = getApiErrorMessage(
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
    },
    [queryClient],
  )

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

  const applyMonitorTriggerResult = useCallback(
    (result: MonitorTriggerResult) => {
      const { monitor, check } = result

      queryClient.setQueryData<Array<MonitorRecord>>(
        listMonitorsQueryKey(),
        (current) => {
          const existing = current ?? []
          const index = existing.findIndex((entry) => entry.id === monitor.id)
          if (index === -1) {
            return [monitor, ...existing]
          }

          const next = [...existing]
          next[index] = monitor
          return next
        },
      )

      if (!check) {
        return
      }

      setChecksByMonitor((current) => {
        const existing = current[monitor.id] ?? []
        const deduped = existing.filter((entry) => entry.id !== check.id)
        return {
          ...current,
          [monitor.id]: [check, ...deduped],
        }
      })
      setChecksErrors((current) => ({
        ...current,
        [monitor.id]: '',
      }))
    },
    [queryClient],
  )

  const triggerMonitorNow = useCallback(
    async (monitor: MonitorRecord, failureMessage: string): Promise<boolean> => {
      setTriggeringMonitorId(monitor.id)

      try {
        const triggerResult = await triggerMonitorRequest.mutateAsync({
          path: { monitorId: monitor.id },
        })
        applyMonitorTriggerResult(triggerResult)

        if (
          !triggerResult.check &&
          (expandedMonitorId === monitor.id || checksByMonitor[monitor.id])
        ) {
          await loadMonitorChecks(monitor.id)
        }

        return true
      } catch (caughtError) {
        const message = getApiErrorMessage(caughtError, failureMessage)
        setError(message)
        sileo.error({ title: message })
        return false
      } finally {
        setTriggeringMonitorId(null)
      }
    },
    [
      applyMonitorTriggerResult,
      checksByMonitor,
      expandedMonitorId,
      loadMonitorChecks,
      triggerMonitorRequest,
    ],
  )

  const onTriggerMonitor = useCallback(
    async (monitor: MonitorRecord) => {
      setError('')
      await triggerMonitorNow(monitor, 'Failed to trigger monitor.')
    },
    [triggerMonitorNow],
  )

  const onBatchTriggerMonitors = useCallback(
    async (monitorsToTrigger: Array<MonitorRecord>) => {
      if (monitorsToTrigger.length === 0) {
        return
      }

      setBatchTriggering(true)
      setError('')

      let succeeded = 0

      for (const monitor of monitorsToTrigger) {
        const success = await triggerMonitorNow(
          monitor,
          `Failed to trigger monitor for ${monitor.url}.`,
        )

        if (success) {
          succeeded += 1
        }
      }

      const failed = monitorsToTrigger.length - succeeded

      if (failed === 0) {
        sileo.success({
          description: `Triggered ${succeeded} monitor${succeeded === 1 ? '' : 's'}.`,
        })
      } else {
        const summary = `Triggered ${succeeded}, failed ${failed}.`
        setError(summary)
        sileo.error({ title: summary })
      }

      setBatchTriggering(false)
    },
    [triggerMonitorNow],
  )

  const onSavedMonitor = useCallback(
    ({
      monitor,
      check,
    }: {
      monitor: MonitorRecord
      check?: MonitorCheckRecord | null
    }) => {
      setError('')
      applyMonitorTriggerResult({
        monitor,
        check,
      })
    },
    [applyMonitorTriggerResult],
  )

  const clearDeletedMonitorState = useCallback(
    (monitorId: number) => {
      queryClient.setQueryData<Array<MonitorRecord>>(
        listMonitorsQueryKey(),
        (current) =>
          (current ?? []).filter((existingMonitor) => existingMonitor.id !== monitorId),
      )

      setExpandedMonitorId((current) => (current === monitorId ? null : current))
      setEditingMonitorId((current) => (current === monitorId ? null : current))
      setChecksByMonitor((current) => {
        const next = { ...current }
        delete next[monitorId]
        return next
      })
      setChecksErrors((current) => {
        const next = { ...current }
        delete next[monitorId]
        return next
      })
    },
    [queryClient],
  )

  const deleteMonitorNow = useCallback(
    async (monitor: MonitorRecord, failureMessage: string): Promise<boolean> => {
      setDeletingMonitorId(monitor.id)

      try {
        await deleteMonitorRequest.mutateAsync({
          path: { monitorId: monitor.id },
        })

        clearDeletedMonitorState(monitor.id)
        return true
      } catch (caughtError) {
        const message = getApiErrorMessage(caughtError, failureMessage)
        setError(message)
        sileo.error({ title: message })
        return false
      } finally {
        setDeletingMonitorId(null)
      }
    },
    [clearDeletedMonitorState, deleteMonitorRequest],
  )

  const onDeleteMonitor = useCallback(
    async (monitor: MonitorRecord) => {
      const shouldDelete = globalThis.confirm(
        `Delete monitor for ${monitor.url}? This cannot be undone.`,
      )
      if (!shouldDelete) {
        return
      }

      setError('')
      const success = await deleteMonitorNow(monitor, 'Failed to delete monitor.')
      if (success) {
        await loadMonitors()
      }
    },
    [deleteMonitorNow, loadMonitors],
  )

  const onBatchDeleteMonitors = useCallback(
    async (monitorsToDelete: Array<MonitorRecord>) => {
      if (monitorsToDelete.length === 0) {
        return
      }

      setBatchDeleting(true)
      setError('')

      let deletedCount = 0

      for (const monitor of monitorsToDelete) {
        const success = await deleteMonitorNow(
          monitor,
          `Failed to delete monitor for ${monitor.url}.`,
        )

        if (success) {
          deletedCount += 1
        }
      }

      if (deletedCount > 0) {
        await loadMonitors()
      }

      const failedCount = monitorsToDelete.length - deletedCount

      if (failedCount === 0) {
        sileo.success({
          description: `Deleted ${deletedCount} monitor${deletedCount === 1 ? '' : 's'}.`,
        })
      } else {
        const summary = `Deleted ${deletedCount}, failed ${failedCount}.`
        setError(summary)
        sileo.error({ title: summary })
      }

      setBatchDeleting(false)
    },
    [deleteMonitorNow, loadMonitors],
  )

  const onToggleMonitorEnabled = useCallback(
    async (monitor: MonitorRecord) => {
      setTogglingMonitorId(monitor.id)
      setError('')

      try {
        const updatedMonitor = await updateMonitorRequest.mutateAsync({
          path: { monitorId: monitor.id },
          body: buildMonitorUpdateRequest(monitor, !monitor.enabled),
        })

        queryClient.setQueryData<Array<MonitorRecord>>(
          listMonitorsQueryKey(),
          (current) => {
            const existing = current ?? []
            const index = existing.findIndex((entry) => entry.id === monitor.id)
            if (index === -1) {
              return existing
            }

            const next = [...existing]
            next[index] = updatedMonitor
            return next
          },
        )
      } catch (caughtError) {
        const action = monitor.enabled ? 'disable' : 'enable'
        const message = getApiErrorMessage(
          caughtError,
          `Failed to ${action} monitor checks.`,
        )
        setError(message)
        sileo.error({ title: message })
      } finally {
        setTogglingMonitorId(null)
      }
    },
    [queryClient, updateMonitorRequest],
  )

  const onImportMonitorConfigs = useCallback(
    async (
      monitorConfigs: Array<CreateMonitorRequest>,
      triggerOnCreate: boolean,
    ): Promise<{ importedCount: number; failedCount: number }> => {
      let importedCount = 0
      let failedCount = 0

      for (const monitorConfig of monitorConfigs) {
        try {
          await createMonitorRequest.mutateAsync({
            body: {
              ...monitorConfig,
              triggerOnCreate,
            },
          })
          importedCount += 1
        } catch (caughtError) {
          failedCount += 1
          const message = getApiErrorMessage(
            caughtError,
            `Failed to import monitor for ${monitorConfig.url}.`,
          )
          sileo.error({ title: message })
        }
      }

      if (importedCount > 0) {
        await loadMonitors()
      }

      return {
        importedCount,
        failedCount,
      }
    },
    [createMonitorRequest, loadMonitors],
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
        onRefreshMonitors={loadMonitors}
        onRefreshChecks={loadMonitorChecks}
        onTriggerMonitor={onTriggerMonitor}
        onBatchTriggerMonitors={onBatchTriggerMonitors}
        onBatchDeleteMonitors={onBatchDeleteMonitors}
        onToggleMonitorEnabled={onToggleMonitorEnabled}
        onImportMonitorConfigs={onImportMonitorConfigs}
        deletingMonitorId={deletingMonitorId}
        batchDeleting={batchDeleting}
        togglingMonitorId={togglingMonitorId}
        triggeringMonitorId={triggeringMonitorId}
        batchTriggering={batchTriggering}
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <CreateEditMonitorCard
          editingMonitor={editingMonitor}
          onCancelEdit={onCancelEdit}
          onSaved={onSavedMonitor}
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
          onRefreshMonitors={loadMonitors}
          onRefreshChecks={loadMonitorChecks}
          onToggleChecks={toggleMonitorChecks}
          onToggleMonitorEnabled={onToggleMonitorEnabled}
          onDeleteMonitor={onDeleteMonitor}
          onTriggerMonitor={onTriggerMonitor}
          deletingMonitorId={deletingMonitorId}
          togglingMonitorId={togglingMonitorId}
          triggeringMonitorId={triggeringMonitorId}
        />
      </div>
    </div>
  )
}

function buildMonitorUpdateRequest(
  monitor: MonitorRecord,
  enabled: boolean,
): CreateMonitorRequest {
  return {
    label: monitor.label ?? undefined,
    method: monitor.method,
    url: monitor.url,
    iconUrl: monitor.iconUrl,
    body: monitor.body ?? undefined,
    headers: monitor.headers,
    auth: monitor.auth,
    notificationChannels: monitor.notificationChannels,
    selector: monitor.selector ?? undefined,
    expectedType: monitor.expectedType,
    expectedResponse: monitor.expectedResponse ?? undefined,
    cron: monitor.cron,
    enabled,
  }
}
