export type DetailedDiffEntry = {
  path: string
  change: 'changed' | 'added' | 'removed'
  oldValue?: unknown
  newValue?: unknown
}

export function collectDetailedDiffEntries(
  path: string,
  previousValue: unknown,
  currentValue: unknown,
  entries: Array<DetailedDiffEntry>,
): void {
  if (areDiffValuesEqual(previousValue, currentValue)) {
    return
  }

  if (Array.isArray(previousValue) && Array.isArray(currentValue)) {
    if (
      collectKeyedArrayDiffEntries(path, previousValue, currentValue, entries)
    ) {
      return
    }

    // Match by value and count, never by position. Sorting alone would still
    // turn an insertion into changes for every subsequent item.
    const previousCounts = countArrayEntries(previousValue)
    const currentCounts = countArrayEntries(currentValue)
    const keys = new Set([...previousCounts.keys(), ...currentCounts.keys()])
    for (const key of [...keys].sort()) {
      const previousCount = previousCounts.get(key) ?? 0
      const currentCount = currentCounts.get(key) ?? 0
      for (
        let occurrence = 0;
        occurrence < Math.abs(currentCount - previousCount);
        occurrence += 1
      ) {
        const nextPath = `${path}[${key}]#${Math.min(previousCount, currentCount) + occurrence + 1}`
        const value: unknown = JSON.parse(key)
        entries.push(
          currentCount > previousCount
            ? { path: nextPath, change: 'added', newValue: value }
            : { path: nextPath, change: 'removed', oldValue: value },
        )
      }
    }
    return
  }

  if (isPlainObject(previousValue) && isPlainObject(currentValue)) {
    const keys = new Set([
      ...Object.keys(previousValue),
      ...Object.keys(currentValue),
    ])

    for (const key of [...keys].sort()) {
      const nextPath = path === 'value' ? key : `${path}.${key}`
      const previousHasKey = Object.hasOwn(previousValue, key)
      const currentHasKey = Object.hasOwn(currentValue, key)

      if (!previousHasKey && currentHasKey) {
        entries.push({
          path: nextPath,
          change: 'added',
          newValue: currentValue[key],
        })
        continue
      }

      if (previousHasKey && !currentHasKey) {
        entries.push({
          path: nextPath,
          change: 'removed',
          oldValue: previousValue[key],
        })
        continue
      }

      collectDetailedDiffEntries(
        nextPath,
        previousValue[key],
        currentValue[key],
        entries,
      )
    }
    return
  }

  entries.push({
    path,
    change: 'changed',
    oldValue: previousValue,
    newValue: currentValue,
  })
}

function collectKeyedArrayDiffEntries(
  path: string,
  previousValue: Array<unknown>,
  currentValue: Array<unknown>,
  entries: Array<DetailedDiffEntry>,
): boolean {
  const previousObjects = asObjectArray(previousValue)
  const currentObjects = asObjectArray(currentValue)
  if (!previousObjects || !currentObjects) {
    return false
  }

  const keyField = detectObjectArrayKey(previousObjects, currentObjects)
  if (!keyField) {
    return false
  }

  const previousMap = mapObjectArrayByKey(previousObjects, keyField)
  const currentMap = mapObjectArrayByKey(currentObjects, keyField)
  if (!previousMap || !currentMap) {
    return false
  }

  const keys = new Set([...previousMap.keys(), ...currentMap.keys()])
  for (const key of [...keys].sort()) {
    const previousEntry = previousMap.get(key)
    const currentEntry = currentMap.get(key)
    const nextPath = `${path}[${keyField}=${key}]`

    if (!previousEntry && currentEntry) {
      entries.push({
        path: nextPath,
        change: 'added',
        newValue: currentEntry,
      })
      continue
    }

    if (previousEntry && !currentEntry) {
      entries.push({
        path: nextPath,
        change: 'removed',
        oldValue: previousEntry,
      })
      continue
    }

    collectDetailedDiffEntries(nextPath, previousEntry, currentEntry, entries)
  }

  return true
}

function asObjectArray(
  value: Array<unknown>,
): Array<Record<string, unknown>> | null {
  const objects: Array<Record<string, unknown>> = []

  for (const entry of value) {
    if (!isPlainObject(entry)) {
      return null
    }
    objects.push(entry)
  }

  return objects
}

function detectObjectArrayKey(
  previous: Array<Record<string, unknown>>,
  current: Array<Record<string, unknown>>,
): string {
  const candidates = [
    'id',
    'key',
    'name',
    'slug',
    'uuid',
    'code',
    'currency',
    'Currency',
    'symbol',
    'tokenId',
    'network',
    'Network',
  ]

  for (const candidate of candidates) {
    if (
      hasUniquePrimitiveKey(candidate, previous) &&
      hasUniquePrimitiveKey(candidate, current)
    ) {
      return candidate
    }
  }

  return ''
}

function hasUniquePrimitiveKey(
  key: string,
  values: Array<Record<string, unknown>>,
): boolean {
  const seen = new Set<string>()

  for (const item of values) {
    if (!Object.hasOwn(item, key)) {
      return false
    }

    const value = item[key]
    if (value === null || Array.isArray(value) || isPlainObject(value)) {
      return false
    }

    const encoded = stableStringify(value)
    if (seen.has(encoded)) {
      return false
    }
    seen.add(encoded)
  }

  return true
}

function mapObjectArrayByKey(
  values: Array<Record<string, unknown>>,
  key: string,
): Map<string, Record<string, unknown>> | null {
  const mapped = new Map<string, Record<string, unknown>>()

  for (const item of values) {
    if (!Object.hasOwn(item, key)) {
      return null
    }

    const encoded = stableStringify(item[key])
    if (mapped.has(encoded)) {
      return null
    }

    mapped.set(encoded, item)
  }

  return mapped
}

export function areDiffValuesEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right)
}

function stableStringify(value: unknown): string {
  if (isPlainObject(value)) {
    const sortedKeys = Object.keys(value).sort()
    const normalized: Record<string, unknown> = {}
    for (const key of sortedKeys) {
      normalized[key] = JSON.parse(stableStringify(value[key])) as unknown
    }
    return JSON.stringify(normalized)
  }

  if (Array.isArray(value)) {
    return JSON.stringify(
      value
        .map(stableStringify)
        .sort()
        .map((entry) => JSON.parse(entry) as unknown),
    )
  }

  return JSON.stringify(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && !Array.isArray(value) && typeof value === 'object'
}

function countArrayEntries(values: Array<unknown>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) {
    const key = stableStringify(value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}
