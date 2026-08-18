export const colors = {
  bg: '#0E1116',
  surface: '#161B22',
  surfaceAlt: '#1F262E',
  border: '#2A323C',
  text: '#F2F5F8',
  textMuted: '#8B97A6',
  accent: '#2F8FFF',
  green: '#22C55E',
  red: '#EF4444',
  amber: '#F59E0B',
} as const;

export const spacing = (n: number) => n * 8;

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
