/**
 * Counts a journal page prints for downloads or full-text views.
 * A trailing year, such as "(2025)", is not a download date and is ignored.
 */
export function parseUsageCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(million|billion|thousand|m|bn|k|b))?/i);
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const suffix = (match[2] || '').toLowerCase();
  const scale =
    suffix === 'm' || suffix === 'million' ? 1_000_000
    : suffix === 'b' || suffix === 'bn' || suffix === 'billion' ? 1_000_000_000
    : suffix === 'k' || suffix === 'thousand' ? 1_000
    : 1;
  const value = Math.round(base * scale);
  return value >= 1 ? value : null;
}

/** Compact label for a count. Exact millions stay "6M"; other counts keep every digit. */
export function formatUsageCount(value: number): string {
  if (!Number.isFinite(value) || value < 1) return '';
  const rounded = Math.round(value);
  if (rounded >= 1_000_000_000 && rounded % 1_000_000_000 === 0) return `${rounded / 1_000_000_000}B`;
  if (rounded >= 1_000_000 && rounded % 1_000_000 === 0) return `${rounded / 1_000_000}M`;
  if (rounded >= 1_000 && rounded % 1_000 === 0 && rounded < 1_000_000) return `${rounded / 1_000}K`;
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
