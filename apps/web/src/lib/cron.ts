import cronstrue from 'cronstrue'

const INVALID_CRON_DESCRIPTION = 'Invalid cron expression'

export function getCronDescription(cron: string): string {
  const normalizedCron = cron.trim()
  if (normalizedCron === '') {
    return INVALID_CRON_DESCRIPTION
  }

  try {
    return cronstrue.toString(normalizedCron, {
      throwExceptionOnParseError: true,
      use24HourTimeFormat: true,
    })
  } catch {
    return INVALID_CRON_DESCRIPTION
  }
}
