import { memo, useCallback, useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from '@tanstack/react-table'
import type {
  MonitorCheck as MonitorCheckRecord,
  Monitor as MonitorRecord,
} from '@goanna/api-client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getCronDescription } from '@/lib/cron'

type ConfiguredMonitorsCardProps = {
  loading: boolean
  monitors: Array<MonitorRecord>
  expandedMonitorId: number | null
  checksByMonitor: Partial<Record<number, Array<MonitorCheckRecord>>>
  checksErrors: Record<number, string>
  loadingChecksFor: number | null
  triggeringMonitorId: number | null
  deletingMonitorId: number | null
  editingMonitorId: number | null
  onToggleChecks: (monitorId: number) => Promise<void>
  onRefreshChecks: (monitorId: number) => Promise<void>
  onTriggerMonitor: (monitor: MonitorRecord) => Promise<void>
  onDeleteMonitor: (monitor: MonitorRecord) => Promise<void>
  onEditMonitor: (monitor: MonitorRecord) => void
}

type ConfiguredMonitorsTableCardProps = Omit<
  ConfiguredMonitorsCardProps,
  'expandedMonitorId' | 'onToggleChecks'
>

export const ConfiguredMonitorsTableCard = memo(
  function ConfiguredMonitorsTableCard({
    loading,
    monitors,
    checksByMonitor,
    checksErrors,
    loadingChecksFor,
    triggeringMonitorId,
    deletingMonitorId,
    editingMonitorId,
    onRefreshChecks,
    onTriggerMonitor,
    onDeleteMonitor,
    onEditMonitor,
  }: ConfiguredMonitorsTableCardProps) {
    const [tableSorting, setTableSorting] = useState<SortingState>([])
    const [tableColumnFilters, setTableColumnFilters] =
      useState<ColumnFiltersState>([])
    const [tablePagination, setTablePagination] = useState<PaginationState>({
      pageIndex: 0,
      pageSize: 8,
    })
    const [checksDialogMonitorId, setChecksDialogMonitorId] = useState<
      number | null
    >(null)

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

    const columns = useMemo<Array<ColumnDef<MonitorRecord>>>(
      () => [
        {
          id: 'name',
          accessorFn: (monitor) => getMonitorDisplayLabel(monitor),
          filterFn: (row, _columnId, value) =>
            matchesMonitorQuery(row.original, String(value ?? '')),
          header: ({ column }) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Name
              <span className="text-zinc-500">
                {formatSortLabel(column.getIsSorted())}
              </span>
            </Button>
          ),
          cell: ({ row }) => {
            const monitor = row.original
            return (
              <div className="flex min-w-0 items-center gap-2">
                {getMonitorIconURL(monitor) ? (
                  <img
                    src={getMonitorIconURL(monitor) ?? undefined}
                    alt=""
                    className="size-5 rounded"
                    loading="lazy"
                  />
                ) : (
                  <div className="size-5 rounded bg-zinc-800" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-zinc-100">
                    {getMonitorDisplayLabel(monitor)}
                  </p>
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
          header: ({ column }) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Method
              <span className="text-zinc-500">
                {formatSortLabel(column.getIsSorted())}
              </span>
            </Button>
          ),
          cell: ({ row }) => (
            <Badge variant="secondary">{row.original.method}</Badge>
          ),
        },
        {
          accessorKey: 'status',
          header: ({ column }) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Status
              <span className="text-zinc-500">
                {formatSortLabel(column.getIsSorted())}
              </span>
            </Button>
          ),
          cell: ({ row }) => {
            const monitor = row.original
            return <StatusBadge monitor={monitor} />
          },
        },
        {
          accessorKey: 'checkCount',
          header: ({ column }) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Checks
              <span className="text-zinc-500">
                {formatSortLabel(column.getIsSorted())}
              </span>
            </Button>
          ),
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
          header: ({ column }) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Next trigger
              <span className="text-zinc-500">
                {formatSortLabel(column.getIsSorted())}
              </span>
            </Button>
          ),
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
          header: ({ column }) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Last trigger
              <span className="text-zinc-500">
                {formatSortLabel(column.getIsSorted())}
              </span>
            </Button>
          ),
          cell: ({ row }) => (
            <RelativeTimestampCell
              timestamp={parseTimestamp(row.original.lastCheckAt)}
            />
          ),
        },
        {
          id: 'recentChecks',
          header: 'Recent checks',
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
                {isLoading ? 'Loading...' : 'View checks'}
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
            return (
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
                    disabled={triggeringMonitorId === monitor.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      void onTriggerMonitor(monitor)
                    }}
                  >
                    {triggeringMonitorId === monitor.id
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
                    disabled={deletingMonitorId === monitor.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      void onDeleteMonitor(monitor)
                    }}
                  >
                    {deletingMonitorId === monitor.id
                      ? 'Deleting...'
                      : 'Delete'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )
          },
        },
      ],
      [
        deletingMonitorId,
        editingMonitorId,
        loadingChecksFor,
        onDeleteMonitor,
        onEditMonitor,
        onTriggerMonitor,
        openChecksDialogForMonitor,
        triggeringMonitorId,
      ],
    )

    const table = useReactTable({
      data: monitors,
      columns,
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
          <Input
            value={tableFilterValue}
            onChange={(event) => {
              table.getColumn('name')?.setFilterValue(event.target.value)
              table.setPageIndex(0)
            }}
            placeholder="Filter table..."
          />

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
                      className="cursor-pointer"
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
                <DialogTitle>Recent checks</DialogTitle>
                <DialogDescription>
                  {checksDialogMonitor
                    ? `${getMonitorDisplayLabel(checksDialogMonitor)} - ${checksDialogMonitor.url}`
                    : 'Select a monitor to view recent checks.'}
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
                  <div className="flex justify-end">
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
  editingMonitorId,
  onToggleChecks,
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
        <Input
          value={cardFilterQuery}
          onChange={(event) => setCardFilterQuery(event.target.value)}
          placeholder="Filter cards..."
        />

        {filteredCardMonitors.map((monitor) => (
          <div
            key={monitor.id}
            className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {getMonitorIconURL(monitor) ? (
                  <img
                    src={getMonitorIconURL(monitor) ?? undefined}
                    alt=""
                    className="size-6 rounded"
                    loading="lazy"
                  />
                ) : (
                  <div className="size-6 rounded bg-zinc-800" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {getMonitorDisplayLabel(monitor)}
                  </p>
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
                  ? 'Hide checks'
                  : 'Recent checks'}
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

function formatSortLabel(value: false | 'asc' | 'desc'): string {
  if (value === 'asc') {
    return '(asc)'
  }
  if (value === 'desc') {
    return '(desc)'
  }
  return ''
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
