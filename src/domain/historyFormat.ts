export function formatHistoryTime(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatHistoryClock(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatHistoryBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value).toString() : value.toFixed(1)
  return `${rounded} ${units[unit]}`
}

export function fileBaseName(path: string | null): string {
  if (!path) {
    return ''
  }
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}
