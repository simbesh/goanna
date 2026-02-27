import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  MoreHorizontal,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { sileo } from 'sileo'
import { useLocalStorage } from 'usehooks-ts'
import type {
  Column,
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
} from '@tanstack/react-table'
import type {
  CreateMonitorRequest,
  MonitorCheck as MonitorCheckRecord,
  Monitor as MonitorRecord,
} from '@goanna/api-client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  HybridTooltip,
  HybridTooltipContent,
  HybridTooltipTrigger,
} from '@/components/ui/hybrid-tooltip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getCronDescription } from '@/lib/cron'
import { cn } from '@/lib/utils'

type ConfiguredMonitorsCardProps = {
  loading: boolean
  monitors: Array<MonitorRecord>
  expandedMonitorId: number | null
  checksByMonitor: Partial<Record<number, Array<MonitorCheckRecord>>>
  checksErrors: Record<number, string>
  loadingChecksFor: number | null
  triggeringMonitorId: number | null
  deletingMonitorId: number | null
  togglingMonitorId: number | null
  editingMonitorId: number | null
  onToggleChecks: (monitorId: number) => Promise<void>
  onToggleMonitorEnabled: (monitor: MonitorRecord) => Promise<void>
  onRefreshMonitors: () => Promise<void>
  onRefreshChecks: (monitorId: number) => Promise<void>
  onTriggerMonitor: (monitor: MonitorRecord) => Promise<void>
  onDeleteMonitor: (monitor: MonitorRecord) => Promise<void>
  onEditMonitor: (monitor: MonitorRecord) => void
}

type ConfiguredMonitorsTableCardProps = Omit<
  ConfiguredMonitorsCardProps,
  'expandedMonitorId' | 'onToggleChecks'
> & {
  batchTriggering: boolean
  batchDeleting: boolean
  onBatchTriggerMonitors: (monitors: Array<MonitorRecord>) => Promise<void>
  onBatchDeleteMonitors: (monitors: Array<MonitorRecord>) => Promise<void>
  onImportMonitorConfigs: (
    monitorConfigs: Array<CreateMonitorRequest>,
    triggerOnCreate: boolean,
  ) => Promise<{ importedCount: number; failedCount: number }>
}

type ImportPreviewRow = {
  previewId: string
  config: CreateMonitorRequest
}

const monitorTablePageSizeOptions = [10, 25, 50, 100] as const
const monitorTablePageSizeStorageKey = 'configuredMonitorsTablePageSize'

function normalizeMonitorTablePageSize(pageSize: number): number {
  return monitorTablePageSizeOptions.includes(
    pageSize as (typeof monitorTablePageSizeOptions)[number],
  )
    ? pageSize
    : monitorTablePageSizeOptions[0]
}

export const ConfiguredMonitorsTableCard = memo(
  function ConfiguredMonitorsTableCard({
    loading,
    monitors,
    checksByMonitor,
    checksErrors,
    loadingChecksFor,
    triggeringMonitorId,
    batchTriggering,
    deletingMonitorId,
    batchDeleting,
    togglingMonitorId,
    editingMonitorId,
    onToggleMonitorEnabled,
    onRefreshMonitors,
    onRefreshChecks,
    onTriggerMonitor,
    onBatchTriggerMonitors,
    onDeleteMonitor,
    onBatchDeleteMonitors,
    onEditMonitor,
    onImportMonitorConfigs,
  }: ConfiguredMonitorsTableCardProps) {
    const [tableSorting, setTableSorting] = useState<SortingState>([])
    const [tableColumnFilters, setTableColumnFilters] =
      useState<ColumnFiltersState>([])
    const [storedTablePageSize, setStoredTablePageSize] =
      useLocalStorage<number>(
        monitorTablePageSizeStorageKey,
        monitorTablePageSizeOptions[0],
      )
    const [tablePagination, setTablePagination] = useState<PaginationState>({
      pageIndex: 0,
      pageSize: normalizeMonitorTablePageSize(storedTablePageSize),
    })
    const [selectedMonitorRows, setSelectedMonitorRows] =
      useState<RowSelectionState>({})
    const [checksDialogMonitorId, setChecksDialogMonitorId] = useState<
      number | null
    >(null)
    const [batchTriggerConfirmOpen, setBatchTriggerConfirmOpen] = useState(false)
    const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false)
    const [exportWarningOpen, setExportWarningOpen] = useState(false)
    const [pendingExportConfigs, setPendingExportConfigs] = useState<
      Array<CreateMonitorRequest>
    >([])
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const [importPreviewRows, setImportPreviewRows] = useState<
      Array<ImportPreviewRow>
    >([])
    const [importPreviewSelection, setImportPreviewSelection] =
      useState<RowSelectionState>({})
    const [importPreviewSorting, setImportPreviewSorting] = useState<
      SortingState
    >([])
    const [importPreviewOpen, setImportPreviewOpen] = useState(false)
    const [importingConfigs, setImportingConfigs] = useState(false)
    const [triggerOnImport, setTriggerOnImport] = useState(true)

    useEffect(() => {
      const normalizedPageSize = normalizeMonitorTablePageSize(storedTablePageSize)

      if (normalizedPageSize !== storedTablePageSize) {
        setStoredTablePageSize(normalizedPageSize)
      }

      setTablePagination((current) =>
        current.pageSize === normalizedPageSize
          ? current
          : {
              ...current,
              pageIndex: 0,
              pageSize: normalizedPageSize,
            },
      )
    }, [setStoredTablePageSize, storedTablePageSize])

    const openChecksDialogForMonitor = useCallback(
      async (monitorId: number) => {
        setChecksDialogMonitorId(monitorId)

        if (checksByMonitor[monitorId]) {
          return
        }

        await onRefreshChecks(monitorId)
      },
      [checksByMonitor, onRefreshChecks],
    )

    const closeChecksDialog = useCallback(() => {
      setChecksDialogMonitorId(null)
    }, [])

    const checksDialogMonitor = useMemo(
      () =>
        monitors.find((monitor) =>
          checksDialogMonitorId === null
            ? false
            : monitor.id === checksDialogMonitorId,
        ) ?? null,
      [checksDialogMonitorId, monitors],
    )

    const sortedMonitors = useMemo(
      () => [...monitors].sort((left, right) => right.id - left.id),
      [monitors],
    )

    const allRowsSelected =
      sortedMonitors.length > 0 &&
      sortedMonitors.every((monitor) => selectedMonitorRows[String(monitor.id)])

    const someRowsSelected =
      !allRowsSelected &&
      sortedMonitors.some((monitor) => selectedMonitorRows[String(monitor.id)])

    const toggleMonitorRowSelection = useCallback(
      (monitorId: number, checked: boolean) => {
        const key = String(monitorId)
        setSelectedMonitorRows((current) => {
          if (checked) {
            if (current[key]) {
              return current
            }

            return {
              ...current,
              [key]: true,
            }
          }

          if (!current[key]) {
            return current
          }

          const next = { ...current }
          delete next[key]
          return next
        })
      },
      [],
    )

    const toggleAllRowsSelection = useCallback(
      (checked: boolean) => {
        if (!checked) {
          setSelectedMonitorRows({})
          return
        }

        setSelectedMonitorRows(
          Object.fromEntries(
            sortedMonitors.map((monitor) => [String(monitor.id), true] as const),
          ),
        )
      },
      [sortedMonitors],
    )

    const columns = useMemo<Array<ColumnDef<MonitorRecord>>>(
      () => [
        {
          id: 'select',
          enableSorting: false,
          enableColumnFilter: false,
          header: () => (
            <input
              type="checkbox"
              className="size-4 cursor-pointer accent-zinc-200"
              checked={allRowsSelected}
              ref={(element) => {
                if (!element) {
                  return
                }
                element.indeterminate = someRowsSelected
              }}
              onChange={(event) => {
                toggleAllRowsSelection(event.target.checked)
              }}
              onClick={(event) => event.stopPropagation()}
              aria-label="Select all rows"
            />
          ),
          cell: ({ row }) => (
            <input
              type="checkbox"
              className="size-4 cursor-pointer accent-zinc-200"
              checked={Boolean(selectedMonitorRows[String(row.original.id)])}
              onChange={(event) => {
                toggleMonitorRowSelection(row.original.id, event.target.checked)
              }}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Select ${getMonitorDisplayLabel(row.original)}`}
            />
          ),
        },
        {
          id: 'name',
          accessorFn: (monitor) => getMonitorDisplayLabel(monitor),
          filterFn: (row, _columnId, value) =>
            matchesMonitorQuery(row.original, String(value ?? '')),
          header: ({ column }) =>
            formatSortLabel({
              className: '-ml-2',
              title: 'Name',
              column,
            }),
          cell: ({ row }) => {
            const monitor = row.original
            return (
              <div className="flex min-w-0 items-center gap-2">
                {getMonitorIconURL(monitor) ? (
                  <img
                    src={getMonitorIconURL(monitor) ?? undefined}
                    alt=""
                    className={cn(
                      'size-5 rounded transition-[filter,opacity]',
                      !monitor.enabled && 'grayscale opacity-70',
                    )}
                    loading="lazy"
                  />
                ) : (
                  <div className="size-5 rounded bg-zinc-800" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-medium text-zinc-100">
                      {getMonitorDisplayLabel(monitor)}
                    </p>
                    <MonitorNotificationIssuesIndicator monitor={monitor} />
                  </div>
                  <p className="max-w-72 truncate text-zinc-400">
                    {monitor.url}
                  </p>
                  <p className="max-w-72 truncate text-xs text-zinc-500">
                    Schedule: {getCronDescription(monitor.cron)}
                  </p>
                </div>
              </div>
            )
          },
        },
        {
          accessorKey: 'method',
          header: ({ column }) =>
            formatSortLabel({
              className: '-ml-2',
              title: 'Method',
              column,
            }),
          cell: ({ row }) => (
            <Badge variant="secondary">{row.original.method}</Badge>
          ),
        },
        {
          accessorKey: 'status',
          header: ({ column }) =>
            formatSortLabel({
              className: '-ml-2',
              title: 'Status',
              column,
            }),
          cell: ({ row }) => {
            const monitor = row.original
            return <StatusBadge monitor={monitor} />
          },
        },
        {
          accessorKey: 'checkCount',
          header: ({ column }) =>
            formatSortLabel({
              className: '-ml-2',
              title: 'Checks',
              column,
            }),
          cell: ({ row }) => (
            <span className="font-medium text-zinc-300">
              {row.original.checkCount}
            </span>
          ),
        },
        {
          id: 'nextTrigger',
          accessorFn: (monitor) =>
            getMonitorNextTriggerTime(monitor)?.getTime() ?? -1,
          header: ({ column }) =>
            formatSortLabel({
              className: '-ml-2',
              title: 'Next trigger',
              column,
            }),
          cell: ({ row }) => {
            const timestamp = getMonitorNextTriggerTime(row.original)
            return <RelativeTimestampCell timestamp={timestamp} />
          },
        },
        {
          id: 'lastTrigger',
          accessorFn: (monitor) => {
            const time = parseTimestamp(monitor.lastCheckAt)
            return time ? time.getTime() : -1
          },
          header: ({ column }) =>
            formatSortLabel({
              className: '-ml-2',
              title: 'Last trigger',
              column,
            }),
          cell: ({ row }) => (
            <RelativeTimestampCell
              timestamp={parseTimestamp(row.original.lastCheckAt)}
            />
          ),
        },
        {
          id: 'recentChecks',
          header: 'History',
          enableSorting: false,
          cell: ({ row }) => {
            const monitor = row.original
            const isLoading = loadingChecksFor === monitor.id
            return (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoading}
                onClick={(event) => {
                  event.stopPropagation()
                  void openChecksDialogForMonitor(monitor.id)
                }}
              >
                {isLoading ? 'Loading...' : 'History'}
              </Button>
            )
          },
        },
        {
          id: 'actions',
          header: 'Actions',
          enableSorting: false,
          cell: ({ row }) => {
            const monitor = row.original
            const isToggling = togglingMonitorId === monitor.id
            return (
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant={monitor.enabled ? 'outline' : 'secondary'}
                  size="sm"
                  disabled={isToggling}
                  onClick={(event) => {
                    event.stopPropagation()
                    void onToggleMonitorEnabled(monitor)
                  }}
                >
                  {isToggling
                    ? 'Saving...'
                    : monitor.enabled
                      ? 'Disable'
                      : 'Enable'}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    onClick={(event) => event.stopPropagation()}
                    render={<Button variant="ghost" size="icon-sm" />}
                  >
                    <MoreHorizontal />
                    <span className="sr-only">Open actions</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem
                      disabled={
                        triggeringMonitorId === monitor.id || batchTriggering
                      }
                      onClick={(event) => {
                        event.stopPropagation()
                        void onTriggerMonitor(monitor)
                      }}
                    >
                      {triggeringMonitorId === monitor.id || batchTriggering
                        ? 'Triggering...'
                        : 'Trigger'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(event) => {
                        event.stopPropagation()
                        onEditMonitor(monitor)
                      }}
                    >
                      {editingMonitorId === monitor.id ? 'Editing' : 'Edit'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={deletingMonitorId === monitor.id || batchDeleting}
                      onClick={(event) => {
                        event.stopPropagation()
                        void onDeleteMonitor(monitor)
                      }}
                    >
                      {deletingMonitorId === monitor.id || batchDeleting
                        ? 'Deleting...'
                        : 'Delete'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          },
        },
      ],
      [
        allRowsSelected,
        batchDeleting,
        batchTriggering,
        deletingMonitorId,
        editingMonitorId,
        loadingChecksFor,
        onDeleteMonitor,
        onEditMonitor,
        onToggleMonitorEnabled,
        onTriggerMonitor,
        openChecksDialogForMonitor,
        someRowsSelected,
        selectedMonitorRows,
        toggleMonitorRowSelection,
        toggleAllRowsSelection,
        togglingMonitorId,
        triggeringMonitorId,
      ],
    )

    const table = useReactTable({
      data: sortedMonitors,
      columns,
      getRowId: (monitor) => String(monitor.id),
      state: {
        sorting: tableSorting,
        columnFilters: tableColumnFilters,
        pagination: tablePagination,
      },
      onSortingChange: setTableSorting,
      onColumnFiltersChange: setTableColumnFilters,
      onPaginationChange: setTablePagination,
      getCoreRowModel: getCoreRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      getSortedRowModel: getSortedRowModel(),
    })

    const selectedMonitors = useMemo(() => {
      const selectedIDs = new Set(
        Object.entries(selectedMonitorRows)
          .filter(([, selected]) => selected)
          .map(([id]) => id),
      )

      return sortedMonitors.filter((monitor) =>
        selectedIDs.has(String(monitor.id)),
      )
    }, [selectedMonitorRows, sortedMonitors])

    const rowsToExport =
      selectedMonitors.length > 0 ? selectedMonitors : sortedMonitors

    const selectedMonitorsCount = selectedMonitors.length

    const onConfirmBatchTrigger = useCallback(async () => {
      if (selectedMonitorsCount === 0) {
        return
      }

      setBatchTriggerConfirmOpen(false)
      await onBatchTriggerMonitors(selectedMonitors)
    }, [onBatchTriggerMonitors, selectedMonitors, selectedMonitorsCount])

    const onConfirmBatchDelete = useCallback(async () => {
      if (selectedMonitorsCount === 0) {
        return
      }

      const monitorsToDelete = [...selectedMonitors]
      setBatchDeleteConfirmOpen(false)
      await onBatchDeleteMonitors(monitorsToDelete)
      setSelectedMonitorRows({})
    }, [onBatchDeleteMonitors, selectedMonitors, selectedMonitorsCount])

    const importPreviewColumns = useMemo<Array<ColumnDef<ImportPreviewRow>>>(
      () => [
        {
          id: 'select',
          header: ({ table: importTable }) => (
            <input
              type="checkbox"
              className="size-4 cursor-pointer accent-zinc-200"
              checked={importTable.getIsAllRowsSelected()}
              ref={(element) => {
                if (!element) {
                  return
                }
                element.indeterminate = importTable.getIsSomeRowsSelected()
              }}
              onChange={(event) => {
                importTable.toggleAllRowsSelected(event.target.checked)
              }}
              onClick={(event) => event.stopPropagation()}
              aria-label="Select all import rows"
            />
          ),
          enableSorting: false,
          enableColumnFilter: false,
          cell: ({ row }) => (
            <input
              type="checkbox"
              className="size-4 cursor-pointer accent-zinc-200"
              checked={row.getIsSelected()}
              onChange={(event) => row.toggleSelected(event.target.checked)}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Select ${row.original.config.url}`}
            />
          ),
        },
        {
          id: 'name',
          accessorFn: (row) => row.config.label ?? row.config.url,
          header: ({ column }) =>
            formatImportSortLabel({
              title: 'Name',
              column,
            }),
          cell: ({ row }) => {
            const monitorConfig = row.original.config
            const iconURL = getMonitorConfigIconURL(monitorConfig)

            return (
              <div className="flex min-w-0 items-center gap-2">
                {iconURL ? (
                  <img
                    src={iconURL}
                    alt=""
                    className="size-5 rounded"
                    loading="lazy"
                  />
                ) : (
                  <div className="size-5 rounded bg-zinc-800" />
                )}
                <div className="min-w-0">
                  <p className="max-w-72 truncate font-medium text-zinc-100">
                    {monitorConfig.label?.trim() || monitorConfig.url}
                  </p>
                  <p className="max-w-72 truncate text-zinc-400">
                    {monitorConfig.url}
                  </p>
                </div>
              </div>
            )
          },
        },
        {
          id: 'method',
          accessorFn: (row) => row.config.method ?? 'GET',
          header: ({ column }) =>
            formatImportSortLabel({
              title: 'Method',
              column,
            }),
          cell: ({ row }) => (
            <Badge variant="secondary">{row.original.config.method ?? 'GET'}</Badge>
          ),
        },
        {
          id: 'cron',
          accessorFn: (row) => row.config.cron,
          header: ({ column }) =>
            formatImportSortLabel({
              title: 'Schedule',
              column,
            }),
          cell: ({ row }) => (
            <span className="font-mono text-zinc-300">{row.original.config.cron}</span>
          ),
        },
        {
          id: 'auth',
          accessorFn: (row) =>
            monitorConfigContainsAuthSettings(row.config) ? 1 : 0,
          header: ({ column }) =>
            formatImportSortLabel({
              title: 'Auth',
              column,
            }),
          cell: ({ row }) =>
            monitorConfigContainsAuthSettings(row.original.config) ? (
              <span className="text-amber-300">Included</span>
            ) : (
              <span className="text-zinc-500">None</span>
            ),
        },
      ],
      [],
    )

    const importPreviewTable = useReactTable({
      data: importPreviewRows,
      columns: importPreviewColumns,
      getRowId: (row) => row.previewId,
      enableRowSelection: true,
      state: {
        sorting: importPreviewSorting,
        rowSelection: importPreviewSelection,
      },
      onSortingChange: setImportPreviewSorting,
      onRowSelectionChange: setImportPreviewSelection,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
    })

    const selectedImportConfigs = useMemo(
      () =>
        importPreviewRows
          .filter((row) => importPreviewSelection[row.previewId])
          .map((row) => row.config),
      [importPreviewRows, importPreviewSelection],
    )

    const closeImportPreview = useCallback(() => {
      setImportPreviewOpen(false)
      setImportPreviewRows([])
      setImportPreviewSelection({})
      setImportPreviewSorting([])
      setTriggerOnImport(true)
    }, [])

    const onExport = useCallback(() => {
      if (rowsToExport.length === 0) {
        sileo.error({ title: 'No monitors available to export.' })
        return
      }

      const monitorConfigs = rowsToExport.map(buildMonitorConfigForExport)
      if (monitorConfigs.some(monitorConfigContainsAuthSettings)) {
        setPendingExportConfigs(monitorConfigs)
        setExportWarningOpen(true)
        return
      }

      downloadMonitorConfigs(monitorConfigs)
    }, [rowsToExport])

    const onConfirmSensitiveExport = useCallback(() => {
      if (pendingExportConfigs.length === 0) {
        return
      }

      downloadMonitorConfigs(pendingExportConfigs)
      setExportWarningOpen(false)
      setPendingExportConfigs([])
    }, [pendingExportConfigs])

    const onOpenImportFilePicker = useCallback(() => {
      fileInputRef.current?.click()
    }, [])

    const onImportFileSelected = useCallback(
      async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''

        if (!file) {
          return
        }

        try {
          const text = await file.text()
          const parsed = JSON.parse(text) as unknown

          if (!Array.isArray(parsed)) {
            sileo.error({ title: 'Import JSON must be a list of monitor configs.' })
            return
          }

          const previewRows = parsed.map((entry, index) => {
            const monitorConfig = parseImportedMonitorConfig(entry)
            if (!monitorConfig) {
              throw new Error(
                `Item ${index + 1} is invalid. Export a list from Goanna and try again.`,
              )
            }

            return {
              previewId: `row-${index}`,
              config: monitorConfig,
            } satisfies ImportPreviewRow
          })

          if (previewRows.length === 0) {
            sileo.error({ title: 'Import JSON does not include any monitor configs.' })
            return
          }

          setImportPreviewRows(previewRows)
          setImportPreviewSelection(
            Object.fromEntries(
              previewRows.map((row) => [row.previewId, true] as const),
            ),
          )
          setImportPreviewSorting([])
          setImportPreviewOpen(true)
        } catch (caughtError) {
          const message =
            caughtError instanceof Error
              ? caughtError.message
              : 'Unable to read import JSON file.'
          sileo.error({ title: message })
        }
      },
      [],
    )

    const onConfirmImport = useCallback(async () => {
      if (selectedImportConfigs.length === 0) {
        sileo.error({ title: 'Select at least one row to import.' })
        return
      }

      setImportingConfigs(true)
      try {
        const { importedCount, failedCount } = await onImportMonitorConfigs(
          selectedImportConfigs,
          triggerOnImport,
        )

        if (failedCount === 0) {
          sileo.success({
            description: `Imported ${importedCount} monitor${importedCount === 1 ? '' : 's'}.`,
          })
          closeImportPreview()
          return
        }

        sileo.error({
          title: `Imported ${importedCount}, failed ${failedCount}.`,
        })
      } finally {
        setImportingConfigs(false)
      }
    }, [
      closeImportPreview,
      onImportMonitorConfigs,
      selectedImportConfigs,
      triggerOnImport,
    ])

    const tableFilterValue =
      (table.getColumn('name')?.getFilterValue() as string | undefined) ?? ''

    const tableFilterActive = tableFilterValue.trim() !== ''

    const tableEmptyMessage = loading
      ? 'Loading monitors...'
      : monitors.length === 0
        ? 'No monitors yet. Create your first monitor from the form.'
        : tableFilterActive
          ? 'No monitors match your filter.'
          : 'No monitors available.'

    return (
      <Card>
        <CardHeader>
          <CardTitle>Monitors Table</CardTitle>
          <CardDescription>
            {loading
              ? 'Loading...'
              : `${monitors.length} monitor${monitors.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[220px] flex-1"
              value={tableFilterValue}
              onChange={(event) => {
                table.getColumn('name')?.setFilterValue(event.target.value)
                table.setPageIndex(0)
              }}
              placeholder="Filter table..."
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="application/json,.json"
              onChange={(event) => {
                void onImportFileSelected(event)
              }}
            />
            {selectedMonitorsCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={batchTriggering || batchDeleting}
                onClick={() => {
                  setBatchTriggerConfirmOpen(true)
                }}
              >
                {batchTriggering ? 'Triggering selected...' : 'Trigger selected'}
              </Button>
            ) : null}
            {selectedMonitorsCount > 0 ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={batchDeleting || batchTriggering}
                onClick={() => {
                  setBatchDeleteConfirmOpen(true)
                }}
              >
                {batchDeleting ? 'Deleting selected...' : 'Delete selected'}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenImportFilePicker}
            >
              <Upload className="size-4" />
              Import JSON
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onExport}>
              <Download className="size-4" />
              Export JSON
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void onRefreshMonitors()}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          <p className="text-xs text-zinc-400">
            Selected rows: {selectedMonitorsCount}. Batch actions and export use
            selected rows when any are selected; otherwise export includes all rows.
          </p>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length > 0 ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={
                        selectedMonitorRows[String(row.original.id)]
                          ? 'selected'
                          : undefined
                      }
                      className={cn(
                        'cursor-pointer transition-opacity',
                        !row.original.enabled && 'opacity-60',
                      )}
                      onClick={() => onEditMonitor(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-20 text-center whitespace-normal text-zinc-400"
                    >
                      {tableEmptyMessage}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-400">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {Math.max(table.getPageCount(), 1)}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Rows per page</span>
                <Select
                  value={String(table.getState().pagination.pageSize)}
                  onValueChange={(value) => {
                    if (!value) {
                      return
                    }

                    const nextPageSize = Number.parseInt(value, 10)

                    if (Number.isNaN(nextPageSize)) {
                      return
                    }

                    table.setPageSize(nextPageSize)
                    setStoredTablePageSize(nextPageSize)
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="min-w-16 border-zinc-700 bg-zinc-950 text-zinc-100"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {monitorTablePageSizeOptions.map((pageSize) => (
                      <SelectItem key={pageSize} value={String(pageSize)}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                Next
              </Button>
            </div>
          </div>

          <AlertDialog
            open={batchTriggerConfirmOpen}
            onOpenChange={(open) => {
              if (batchTriggering) {
                return
              }

              setBatchTriggerConfirmOpen(open)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Trigger selected monitors</AlertDialogTitle>
                <AlertDialogDescription>
                  Trigger {selectedMonitorsCount} selected monitor
                  {selectedMonitorsCount === 1 ? '' : 's'} now? This runs checks
                  immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={batchTriggering}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={batchTriggering || selectedMonitorsCount === 0}
                  onClick={() => {
                    void onConfirmBatchTrigger()
                  }}
                >
                  {batchTriggering ? 'Triggering...' : 'Trigger selected'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={batchDeleteConfirmOpen}
            onOpenChange={(open) => {
              if (batchDeleting) {
                return
              }

              setBatchDeleteConfirmOpen(open)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete selected monitors</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete {selectedMonitorsCount} selected monitor
                  {selectedMonitorsCount === 1 ? '' : 's'}? This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={batchDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={batchDeleting || selectedMonitorsCount === 0}
                  onClick={() => {
                    void onConfirmBatchDelete()
                  }}
                >
                  {batchDeleting ? 'Deleting...' : 'Delete selected'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={exportWarningOpen}
            onOpenChange={(open) => {
              setExportWarningOpen(open)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Export contains auth settings</AlertDialogTitle>
                <AlertDialogDescription>
                  This export includes auth tokens or sensitive headers. Continue
                  only if you trust how this file will be stored and shared.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => {
                    setPendingExportConfigs([])
                  }}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={onConfirmSensitiveExport}>
                  Export JSON
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog
            open={importPreviewOpen}
            onOpenChange={(open) => {
              if (!open && !importingConfigs) {
                closeImportPreview()
              }
            }}
          >
            <DialogContent className="sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>Import Preview</DialogTitle>
                <DialogDescription>
                  Click rows to include them. Only selected rows will be
                  imported.
                </DialogDescription>
              </DialogHeader>

              <p className="text-xs text-zinc-400">
                {selectedImportConfigs.length} of {importPreviewRows.length}{' '}
                selected.
              </p>

              <div className="inline-flex w-fit items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
                <Label htmlFor="importTriggerOnCreate" className="text-sm text-zinc-300">
                  Trigger monitors after import
                </Label>
                <Checkbox
                  id="importTriggerOnCreate"
                  checked={triggerOnImport}
                  disabled={importingConfigs}
                  onCheckedChange={setTriggerOnImport}
                />
              </div>

              <div className="max-h-[55vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950">
                <Table>
                  <TableHeader>
                    {importPreviewTable.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {importPreviewTable.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() ? 'selected' : undefined}
                        className="cursor-pointer"
                        onClick={() => row.toggleSelected()}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={importingConfigs}
                  onClick={closeImportPreview}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={importingConfigs || selectedImportConfigs.length === 0}
                  onClick={() => void onConfirmImport()}
                >
                  {importingConfigs ? 'Importing...' : 'Import selected'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={checksDialogMonitorId !== null}
            onOpenChange={(open) => {
              if (!open) {
                closeChecksDialog()
              }
            }}
          >
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>History</DialogTitle>
                <DialogDescription>
                  {checksDialogMonitor
                    ? `${getMonitorDisplayLabel(checksDialogMonitor)} - ${checksDialogMonitor.url}`
                    : 'Select a monitor to view history.'}
                </DialogDescription>
              </DialogHeader>

              {checksDialogMonitor ? (
                <>
                  <div className="max-h-[55vh] overflow-y-auto pr-1">
                    <MonitorChecksList
                      checks={checksByMonitor[checksDialogMonitor.id] ?? []}
                      className="space-y-2"
                      error={checksErrors[checksDialogMonitor.id]}
                      loading={loadingChecksFor === checksDialogMonitor.id}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={triggeringMonitorId === checksDialogMonitor.id}
                      onClick={() => void onTriggerMonitor(checksDialogMonitor)}
                    >
                      {triggeringMonitorId === checksDialogMonitor.id
                        ? 'Triggering...'
                        : 'Trigger'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loadingChecksFor === checksDialogMonitor.id}
                      onClick={() =>
                        void onRefreshChecks(checksDialogMonitor.id)
                      }
                    >
                      Refresh checks
                    </Button>
                  </div>
                </>
              ) : null}
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    )
  },
)

export const ConfiguredMonitorsCard = memo(function ConfiguredMonitorsCard({
  loading,
  monitors,
  expandedMonitorId,
  checksByMonitor,
  checksErrors,
  loadingChecksFor,
  triggeringMonitorId,
  deletingMonitorId,
  togglingMonitorId,
  editingMonitorId,
  onToggleChecks,
  onToggleMonitorEnabled,
  onRefreshMonitors,
  onRefreshChecks,
  onTriggerMonitor,
  onDeleteMonitor,
  onEditMonitor,
}: ConfiguredMonitorsCardProps) {
  const [cardFilterQuery, setCardFilterQuery] = useState('')

  const filteredCardMonitors = useMemo(
    () =>
      monitors.filter((monitor) =>
        matchesMonitorQuery(monitor, cardFilterQuery),
      ),
    [cardFilterQuery, monitors],
  )

  const cardFilterActive = cardFilterQuery.trim() !== ''

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configured Monitors</CardTitle>
        <CardDescription>
          {loading
            ? 'Loading...'
            : `${monitors.length} monitor${monitors.length === 1 ? '' : 's'}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={cardFilterQuery}
            onChange={(event) => setCardFilterQuery(event.target.value)}
            placeholder="Filter cards..."
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void onRefreshMonitors()}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {filteredCardMonitors.map((monitor) => (
          <div
            key={monitor.id}
            className={cn(
              'rounded-lg border border-zinc-800 bg-zinc-950 p-4 transition-opacity',
              !monitor.enabled && 'opacity-60',
            )}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {getMonitorIconURL(monitor) ? (
                  <img
                    src={getMonitorIconURL(monitor) ?? undefined}
                    alt=""
                    className={cn(
                      'size-6 rounded transition-[filter,opacity]',
                      !monitor.enabled && 'grayscale opacity-70',
                    )}
                    loading="lazy"
                  />
                ) : (
                  <div className="size-6 rounded bg-zinc-800" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {getMonitorDisplayLabel(monitor)}
                    </p>
                    <MonitorNotificationIssuesIndicator monitor={monitor} />
                  </div>
                  <p className="truncate text-xs text-zinc-400">
                    {monitor.url}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary">{monitor.method}</Badge>
                <StatusBadge monitor={monitor} />
              </div>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Cron:{' '}
              <span className="font-mono text-zinc-300">{monitor.cron}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Schedule: {getCronDescription(monitor.cron)}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Expected: {monitor.expectedType}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Checks: {monitor.checkCount}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Notify:{' '}
              {getMonitorNotificationChannels(monitor).join(', ') || 'none'}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={triggeringMonitorId === monitor.id}
                onClick={() => void onTriggerMonitor(monitor)}
              >
                {triggeringMonitorId === monitor.id
                  ? 'Triggering...'
                  : 'Trigger'}
              </Button>
              <Button
                type="button"
                variant={
                  editingMonitorId === monitor.id ? 'default' : 'outline'
                }
                size="sm"
                onClick={() => onEditMonitor(monitor)}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deletingMonitorId === monitor.id}
                onClick={() => void onDeleteMonitor(monitor)}
              >
                {deletingMonitorId === monitor.id ? 'Deleting...' : 'Delete'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onToggleChecks(monitor.id)}
              >
                {expandedMonitorId === monitor.id
                  ? 'Hide history'
                  : 'History'}
              </Button>
              <Button
                type="button"
                variant={monitor.enabled ? 'outline' : 'secondary'}
                size="sm"
                disabled={togglingMonitorId === monitor.id}
                onClick={() => void onToggleMonitorEnabled(monitor)}
              >
                {togglingMonitorId === monitor.id
                  ? 'Saving...'
                  : monitor.enabled
                    ? 'Disable checks'
                    : 'Enable checks'}
              </Button>
              {expandedMonitorId === monitor.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void onRefreshChecks(monitor.id)}
                >
                  Refresh
                </Button>
              ) : null}
            </div>

            {expandedMonitorId === monitor.id ? (
              <MonitorChecksList
                checks={checksByMonitor[monitor.id] ?? []}
                className="mt-3 space-y-2 rounded-md border border-zinc-800 bg-zinc-900 p-3"
                error={checksErrors[monitor.id]}
                loading={loadingChecksFor === monitor.id}
              />
            ) : null}
          </div>
        ))}

        {!loading && monitors.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950 p-6 text-center text-sm text-zinc-400">
            No monitors yet. Create your first monitor from the form.
          </div>
        ) : null}

        {!loading &&
        monitors.length > 0 &&
        cardFilterActive &&
        filteredCardMonitors.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950 p-6 text-center text-sm text-zinc-400">
            No monitors match your card filter.
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
})

function StatusBadge({ monitor }: { monitor: MonitorRecord }) {
  return (
    <Badge
      variant="outline"
      className={getStatusBadgeClassName(monitor.status)}
    >
      {monitor.status}
    </Badge>
  )
}

function getStatusBadgeClassName(status: MonitorRecord['status']): string {
  switch (status) {
    case 'ok':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
    case 'pending':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-300'
    case 'retrying':
      return 'border-orange-500/40 bg-orange-500/15 text-orange-300'
    case 'error':
      return 'border-red-500/40 bg-red-500/15 text-red-300'
    case 'disabled':
      return 'border-zinc-600 bg-zinc-800/70 text-zinc-300'
    default:
      return 'border-zinc-600 bg-zinc-800/70 text-zinc-200'
  }
}

function RelativeTimestampCell({ timestamp }: { timestamp: Date | null }) {
  if (!timestamp) {
    return <span className="text-zinc-500">-</span>
  }

  return (
    <HybridTooltip>
      <HybridTooltipTrigger
        render={
          <span className="text-zinc-300 underline decoration-dotted underline-offset-3" />
        }
      >
        {formatRelativeShort(timestamp.getTime() - Date.now())}
      </HybridTooltipTrigger>
      <HybridTooltipContent side="top">
        {formatLocalTimestamp(timestamp)}
      </HybridTooltipContent>
    </HybridTooltip>
  )
}

function MonitorNotificationIssuesIndicator({
  monitor,
}: {
  monitor: MonitorRecord
}) {
  const issues = getMonitorNotificationIssues(monitor)
  if (issues.length === 0) {
    return null
  }

  return (
    <HybridTooltip>
      <HybridTooltipTrigger
        render={
          <span className="inline-flex size-5 items-center justify-center rounded-sm text-amber-300 hover:bg-amber-500/10" />
        }
        onClick={(event) => {
          event.stopPropagation()
        }}
        aria-label="Notification channel warnings"
      >
        <TriangleAlert className="size-4" />
      </HybridTooltipTrigger>
      <HybridTooltipContent
        side="top"
        className="max-w-80 space-y-1 border border-zinc-700/80 bg-zinc-900 text-zinc-100 shadow-lg"
      >
        <p className="text-xs font-medium text-amber-200">
          Notifications need attention
        </p>
        {issues.map((issue) => (
          <p key={`${issue.channel}-${issue.code}`} className="text-xs text-zinc-100">
            {issue.message}
          </p>
        ))}
        <Link
          to="/settings"
          className="inline-flex text-xs font-medium text-amber-200 underline decoration-dotted underline-offset-3 hover:text-amber-100"
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          Go to Settings
        </Link>
      </HybridTooltipContent>
    </HybridTooltip>
  )
}

function formatLocalTimestamp(value: Date): string {
  return value.toLocaleString()
}

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

function getMonitorNextTriggerTime(monitor: MonitorRecord): Date | null {
  const nextRunAt = (monitor as MonitorRecord & { nextRunAt?: unknown })
    .nextRunAt
  if (typeof nextRunAt === 'string') {
    const parsed = parseTimestamp(nextRunAt)
    if (parsed) {
      return parsed
    }
  }

  return null
}

function formatRelativeShort(deltaMs: number): string {
  if (!Number.isFinite(deltaMs)) {
    return '-'
  }

  if (deltaMs === 0) {
    return '0s ago'
  }

  const absoluteMs = Math.abs(deltaMs)
  const amount = formatDurationShort(absoluteMs)

  if (deltaMs > 0) {
    return `in ${amount}`
  }

  return `${amount} ago`
}

function formatDurationShort(ms: number): string {
  if (ms < 60000) {
    const seconds = Math.max(1, Math.floor(ms / 1000))
    return `${seconds}s`
  }

  const totalMinutes = Math.floor(ms / 60000)
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

type MonitorChecksListProps = {
  checks: Array<MonitorCheckRecord>
  loading: boolean
  error?: string
  className?: string
}

function MonitorChecksList({
  checks,
  loading,
  error,
  className,
}: MonitorChecksListProps) {
  return (
    <div className={className}>
      {loading ? (
        <p className="text-xs text-zinc-400">Loading checks...</p>
      ) : null}

      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      {checks.map((check) => (
        <div
          key={check.id}
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium uppercase text-zinc-200">
              {check.status}
            </span>
            <span className="text-zinc-500">
              {formatTimestamp(check.checkedAt)}
            </span>
          </div>
          <div className="mt-1 text-zinc-400">
            code: {check.statusCode ?? '-'} | duration:{' '}
            {check.responseTimeMs ?? '-'}ms
          </div>
          {getCheckSelectionType(check) || getCheckSelectionValue(check) ? (
            <div className="mt-1 text-zinc-400">
              selected: {getCheckSelectionType(check) ?? '-'} | value:{' '}
              {truncateInline(getCheckSelectionValue(check) ?? '-')}
            </div>
          ) : null}
          {check.errorMessage ? (
            <div className="mt-1 text-red-300">{check.errorMessage}</div>
          ) : null}
          <CheckDiffDetails check={check} />
        </div>
      ))}

      {!loading && checks.length === 0 ? (
        <p className="text-xs text-zinc-500">No checks yet for this monitor.</p>
      ) : null}
    </div>
  )
}

function formatSortLabel({
  title,
  column,
  className,
}: {
  title: string
  column: Column<MonitorRecord, unknown>
  className?: string
}) {
  const cycleSort = () => column.toggleSorting(column.getIsSorted() === 'asc')
  const sortDirection = column.getIsSorted()

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="data-[state=open]:bg-accent h-8 w-full"
        onClick={cycleSort}
      >
        <span>{title}</span>
        {sortDirection === 'desc' ? (
          <div className="ml-auto">
            <ChevronUp className="size-4 min-w-4 text-stone-600" />
            <ChevronDown className="size-4 -mt-1.5 min-w-4 text-white" />
          </div>
        ) : sortDirection === 'asc' ? (
          <div className="ml-auto">
            <ChevronUp className="size-4 min-w-4 text-white" />
            <ChevronDown className="size-4 -mt-1.5 min-w-4 text-stone-600" />
          </div>
        ) : (
          <div className="ml-auto">
            <ChevronsUpDown className="ml-2 size-5 min-w-4 text-stone-600" />
          </div>
        )}
      </Button>
    </div>
  )
}

function formatImportSortLabel({
  title,
  column,
  className,
}: {
  title: string
  column: Column<ImportPreviewRow, unknown>
  className?: string
}) {
  const cycleSort = () => column.toggleSorting(column.getIsSorted() === 'asc')
  const sortDirection = column.getIsSorted()

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="data-[state=open]:bg-accent h-8 w-full"
        onClick={cycleSort}
      >
        <span>{title}</span>
        {sortDirection === 'desc' ? (
          <div className="ml-auto">
            <ChevronUp className="size-4 min-w-4 text-stone-600" />
            <ChevronDown className="size-4 -mt-1.5 min-w-4 text-white" />
          </div>
        ) : sortDirection === 'asc' ? (
          <div className="ml-auto">
            <ChevronUp className="size-4 min-w-4 text-white" />
            <ChevronDown className="size-4 -mt-1.5 min-w-4 text-stone-600" />
          </div>
        ) : (
          <div className="ml-auto">
            <ChevronsUpDown className="ml-2 size-5 min-w-4 text-stone-600" />
          </div>
        )}
      </Button>
    </div>
  )
}

function matchesMonitorQuery(monitor: MonitorRecord, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery === '') {
    return true
  }

  const searchValue = [
    getMonitorDisplayLabel(monitor),
    monitor.url,
    monitor.method,
    monitor.status,
    monitor.cron,
    getCronDescription(monitor.cron),
    monitor.expectedType,
    String(monitor.checkCount),
    getMonitorNotificationChannels(monitor).join(' '),
  ]
    .join(' ')
    .toLowerCase()

  return searchValue.includes(normalizedQuery)
}

function CheckDiffDetails({ check }: { check: MonitorCheckRecord }) {
  const changed = getCheckDiffChanged(check)
  if (!changed) {
    return null
  }

  const kind = getCheckDiffKind(check) ?? 'unknown'
  const summary = getCheckDiffSummary(check)
  const details = parseDiffDetails(getCheckDiffDetails(check))
  const detailLines = buildDiffDetailLines(kind, details)

  return (
    <div className="mt-2 rounded border border-amber-700/50 bg-amber-950/20 px-2 py-1 text-zinc-300">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-amber-300">Diff: {kind}</span>
        <span className="text-zinc-500">changed</span>
      </div>

      {summary ? <p className="mt-1 text-zinc-200">{summary}</p> : null}

      {detailLines.map((line) => (
        <p key={line} className="mt-1 break-all text-zinc-400">
          {line}
        </p>
      ))}
    </div>
  )
}

function buildDiffDetailLines(
  kind: string,
  details: Record<string, unknown> | null,
): Array<string> {
  if (!details) {
    return []
  }

  switch (kind) {
    case 'text':
    case 'dateTime':
    case 'typeChanged':
    case 'boolean':
    case 'null': {
      const oldValue = stringifyUnknown(details.old)
      const newValue = stringifyUnknown(details.new)
      return [
        `Old: ${truncateInline(oldValue)}`,
        `New: ${truncateInline(newValue)}`,
      ]
    }
    case 'number': {
      const lines = [
        `Old: ${stringifyUnknown(details.old)}`,
        `New: ${stringifyUnknown(details.new)}`,
        `Delta: ${stringifyUnknown(details.delta)}`,
      ]
      if (typeof details.percent === 'number') {
        lines.push(`Percent: ${details.percent.toFixed(2)}%`)
      }
      return lines
    }
    case 'arrayReorder': {
      return [
        `Order changed (${stringifyUnknown(details.oldCount)} -> ${stringifyUnknown(details.newCount)} items)`,
      ]
    }
    case 'array': {
      const added = formatPrimitiveCountMap(details.added)
      const removed = formatPrimitiveCountMap(details.removed)
      const lines = []
      if (added) {
        lines.push(`Added: ${truncateInline(added)}`)
      }
      if (removed) {
        lines.push(`Removed: ${truncateInline(removed)}`)
      }
      return lines
    }
    case 'arrayObject': {
      const lines = []
      const keyField =
        typeof details.keyField === 'string' ? details.keyField : 'key'
      const added = asStringArray(details.added)
      const removed = asStringArray(details.removed)
      const updated = asStringArray(details.updated)
      if (added.length > 0) {
        lines.push(`Added by ${keyField}: ${truncateInline(added.join(', '))}`)
      }
      if (removed.length > 0) {
        lines.push(
          `Removed by ${keyField}: ${truncateInline(removed.join(', '))}`,
        )
      }
      if (updated.length > 0) {
        lines.push(
          `Updated by ${keyField}: ${truncateInline(updated.join(', '))}`,
        )
      }
      return lines
    }
    case 'object': {
      const lines = []
      const added = asStringArray(details.added)
      const removed = asStringArray(details.removed)
      const changed = asStringArray(details.changed)
      if (added.length > 0) {
        lines.push(`Added fields: ${truncateInline(added.join(', '))}`)
      }
      if (removed.length > 0) {
        lines.push(`Removed fields: ${truncateInline(removed.join(', '))}`)
      }
      if (changed.length > 0) {
        lines.push(`Changed fields: ${truncateInline(changed.join(', '))}`)
      }
      return lines
    }
    default:
      return []
  }
}

function formatPrimitiveCountMap(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return ''
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) {
    return ''
  }

  return entries
    .map(([raw, count]) => {
      const countValue = typeof count === 'number' ? count : 1
      const decoded = decodePrimitiveValue(raw)
      return `${decoded} (x${countValue})`
    })
    .join(', ')
}

function decodePrimitiveValue(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'string') {
      return parsed
    }

    return stringifyUnknown(parsed)
  } catch {
    return raw
  }
}

function parseDiffDetails(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  if (!raw || raw.trim() === '') {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null
    }

    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function asStringArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === 'string')
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value === null) {
    return 'null'
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function truncateInline(value: string): string {
  if (value.length <= 160) {
    return value
  }

  return `${value.slice(0, 160)}...`
}

function getMonitorDisplayLabel(monitor: MonitorRecord): string {
  const label = (monitor as MonitorRecord & { label?: unknown }).label
  if (typeof label === 'string' && label.trim() !== '') {
    return label
  }

  return monitor.url
}

function getMonitorIconURL(monitor: MonitorRecord): string | null {
  const iconURL = (monitor as MonitorRecord & { iconUrl?: unknown }).iconUrl
  if (typeof iconURL === 'string' && iconURL.trim() !== '') {
    return iconURL
  }

  return null
}

function getMonitorConfigIconURL(monitorConfig: CreateMonitorRequest): string | null {
  if (typeof monitorConfig.iconUrl !== 'string') {
    return null
  }

  const trimmedIconURL = monitorConfig.iconUrl.trim()
  return trimmedIconURL === '' ? null : trimmedIconURL
}

function getMonitorNotificationChannels(monitor: MonitorRecord): Array<string> {
  const notificationChannels = (
    monitor as MonitorRecord & { notificationChannels?: unknown }
  ).notificationChannels
  if (!Array.isArray(notificationChannels)) {
    return []
  }

  const values = notificationChannels as Array<unknown>
  return values.filter(
    (channel): channel is string => typeof channel === 'string',
  )
}

type MonitorNotificationIssue = {
  channel: string
  code: string
  message: string
}

function getMonitorNotificationIssues(
  monitor: MonitorRecord,
): Array<MonitorNotificationIssue> {
  const notificationIssues = (monitor as { notificationIssues?: unknown })
    .notificationIssues
  if (!Array.isArray(notificationIssues)) {
    return []
  }

  const parsed: Array<MonitorNotificationIssue> = []

  for (const issue of notificationIssues) {
    if (!issue || Array.isArray(issue) || typeof issue !== 'object') {
      continue
    }

    const issueRecord = issue as Record<string, unknown>
    const channel = asNonEmptyString(issueRecord.channel)
    const code = asNonEmptyString(issueRecord.code)
    const message = asNonEmptyString(issueRecord.message)

    if (!channel || !code || !message) {
      continue
    }

    parsed.push({ channel, code, message })
  }

  return parsed
}

function buildMonitorConfigForExport(monitor: MonitorRecord): CreateMonitorRequest {
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
    enabled: monitor.enabled,
  }
}

function monitorConfigContainsAuthSettings(
  monitorConfig: CreateMonitorRequest,
): boolean {
  if (hasValues(monitorConfig.auth)) {
    return true
  }

  if (!monitorConfig.headers) {
    return false
  }

  return Object.entries(monitorConfig.headers).some(([key, value]) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return false
    }

    const normalizedKey = key.toLowerCase()
    return (
      normalizedKey.includes('authorization') ||
      normalizedKey.includes('token') ||
      normalizedKey.includes('secret') ||
      normalizedKey.includes('api-key') ||
      normalizedKey.includes('apikey') ||
      normalizedKey.includes('cookie')
    )
  })
}

function hasValues(value: Record<string, string> | undefined): boolean {
  if (!value) {
    return false
  }

  return Object.values(value).some(
    (entry) => typeof entry === 'string' && entry.trim() !== '',
  )
}

function downloadMonitorConfigs(monitorConfigs: Array<CreateMonitorRequest>): void {
  const json = JSON.stringify(monitorConfigs, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const downloadURL = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = downloadURL
  link.download = `goanna-monitors-${new Date().toISOString().slice(0, 10)}.json`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(downloadURL)
}

function parseImportedMonitorConfig(value: unknown): CreateMonitorRequest | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const url = asNonEmptyString(record.url)
  const cron = asNonEmptyString(record.cron)
  if (!url || !cron) {
    return null
  }

  const expectedTypeValue = record.expectedType
  const expectedType =
    expectedTypeValue === undefined
      ? 'json'
      : expectedTypeValue === 'json' ||
          expectedTypeValue === 'html' ||
          expectedTypeValue === 'text'
        ? expectedTypeValue
        : null
  if (!expectedType) {
    return null
  }

  const method = asString(record.method) ?? 'GET'
  const enabled =
    typeof record.enabled === 'boolean'
      ? record.enabled
      : record.enabled === undefined
        ? true
        : null
  if (enabled === null) {
    return null
  }

  const headers = asStringMap(record.headers)
  const auth = asStringMap(record.auth)
  const notificationChannels = asNotificationChannels(record.notificationChannels)

  if (
    (record.headers !== undefined && headers === null) ||
    (record.auth !== undefined && auth === null) ||
    (record.notificationChannels !== undefined && notificationChannels === null)
  ) {
    return null
  }

  const label = asString(record.label)
  const iconUrl = asString(record.iconUrl)
  const body = asString(record.body)
  const selector = asString(record.selector)
  const expectedResponse = asString(record.expectedResponse)

  return {
    label: emptyToUndefined(label),
    method,
    url,
    iconUrl: emptyToUndefined(iconUrl),
    body: emptyToUndefined(body),
    headers: headers ?? undefined,
    auth: auth ?? undefined,
    notificationChannels: notificationChannels ?? undefined,
    selector: emptyToUndefined(selector),
    expectedType,
    expectedResponse: emptyToUndefined(expectedResponse),
    cron,
    enabled,
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function asStringMap(
  value: unknown,
): Record<string, string> | undefined | null {
  if (value === undefined) {
    return undefined
  }

  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null
  }

  const mapped: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      return null
    }
    mapped[key] = entry
  }

  return mapped
}

function asNotificationChannels(
  value: unknown,
): Array<'telegram'> | undefined | null {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    return null
  }

  const mapped: Array<'telegram'> = []
  for (const channel of value) {
    if (channel !== 'telegram') {
      return null
    }
    mapped.push(channel)
  }

  return mapped
}

function emptyToUndefined(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function getCheckSelectionType(check: MonitorCheckRecord): string | null {
  const value = (check as MonitorCheckRecord & { selectionType?: unknown })
    .selectionType
  return typeof value === 'string' ? value : null
}

function getCheckSelectionValue(check: MonitorCheckRecord): string | null {
  const value = (check as MonitorCheckRecord & { selectionValue?: unknown })
    .selectionValue
  return typeof value === 'string' ? value : null
}

function getCheckDiffChanged(check: MonitorCheckRecord): boolean {
  const value = (check as MonitorCheckRecord & { diffChanged?: unknown })
    .diffChanged
  return value === true
}

function getCheckDiffKind(check: MonitorCheckRecord): string | null {
  const value = (check as MonitorCheckRecord & { diffKind?: unknown }).diffKind
  return typeof value === 'string' ? value : null
}

function getCheckDiffSummary(check: MonitorCheckRecord): string | null {
  const value = (check as MonitorCheckRecord & { diffSummary?: unknown })
    .diffSummary
  return typeof value === 'string' ? value : null
}

function getCheckDiffDetails(check: MonitorCheckRecord): string | null {
  const value = (check as MonitorCheckRecord & { diffDetails?: unknown })
    .diffDetails
  return typeof value === 'string' ? value : null
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}
