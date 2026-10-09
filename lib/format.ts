const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Colombo',
});

const shortDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Colombo' });

/** Factory-local time. Timestamps are stored in UTC and shown in Sri Lanka time. */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

export function formatShortDate(iso: string | null | undefined): string {
  return iso ? shortDate.format(new Date(iso)) : '—';
}

export function formatYards(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} yd`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function formatCount(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('en-US');
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
