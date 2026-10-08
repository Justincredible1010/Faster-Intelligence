/** Canonical ISSN, `NNNN-NNNX`. Empty when the input is not an ISSN. */
export function normalizeIssn(raw: string | null | undefined): string {
  const compact = (raw || '').trim().toUpperCase().replace(/[^0-9X]/g, '');
  if (!/^\d{7}[\dX]$/.test(compact)) return '';
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}
