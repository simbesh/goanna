export function formatPreviewRaw(raw: string | null | undefined): string {
  if (raw === undefined || raw === null) {
    return 'null'
  }

  let candidate = raw
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (typeof parsed === 'string') {
        candidate = parsed
        continue
      }

      return JSON.stringify(parsed, null, 2)
    } catch {
      break
    }
  }

  const normalized = normalizeEscapedJSONString(candidate)
  try {
    return JSON.stringify(JSON.parse(normalized), null, 2)
  } catch {
    return formatJsonLikeText(normalized) ?? normalized
  }
}

function normalizeEscapedJSONString(value: string): string {
  if (
    !value.includes('\\') &&
    !value.includes('\\n') &&
    !value.includes('\\r') &&
    !value.includes('\\t')
  ) {
    return value
  }

  return value
    .replaceAll('\\\\', '\\')
    .replaceAll('\\"', '"')
    .replaceAll('\\n', '\n')
    .replaceAll('\\r', '\r')
    .replaceAll('\\t', '\t')
}

function formatJsonLikeText(value: string): string | null {
  const truncatedSuffix = '... [truncated]'
  const trimmedValue = value.trim()
  if (trimmedValue === '') {
    return null
  }

  let source = trimmedValue
  let suffix = ''
  if (source.endsWith(truncatedSuffix)) {
    source = source.slice(0, -truncatedSuffix.length).trimEnd()
    suffix = truncatedSuffix
  }

  const firstCharacter = source.trimStart()[0]
  if (firstCharacter !== '{' && firstCharacter !== '[') {
    return null
  }

  let formatted = ''
  let indentationDepth = 0
  let inString = false
  let escaping = false
  const indentation = '  '

  for (const character of source) {
    if (inString) {
      formatted += character
      if (escaping) {
        escaping = false
      } else if (character === '\\') {
        escaping = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
      formatted += character
      continue
    }

    if (character === '{' || character === '[') {
      formatted += character
      indentationDepth += 1
      formatted += `\n${indentation.repeat(indentationDepth)}`
      continue
    }

    if (character === '}' || character === ']') {
      indentationDepth = Math.max(0, indentationDepth - 1)
      formatted = formatted.trimEnd()
      if (!formatted.endsWith('\n')) {
        formatted += '\n'
      }
      formatted += `${indentation.repeat(indentationDepth)}${character}`
      continue
    }

    if (character === ',') {
      formatted += `,\n${indentation.repeat(indentationDepth)}`
      continue
    }

    if (character === ':') {
      formatted += ': '
      continue
    }

    formatted += character
  }

  const output = formatted.trim()
  if (suffix === '') {
    return output
  }

  if (output === '') {
    return suffix
  }

  return `${output}\n${suffix}`
}
