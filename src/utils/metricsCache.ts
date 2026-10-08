import fs from 'fs';

/**
 * Reads the on-disk metrics cache into a new map.
 * A missing file, invalid JSON, or a non-object top level yields an empty map
 * so the server can start with no cache present.
 */
export function loadMetricsCacheFromDisk<T = unknown>(filePath: string): Map<string, T> {
  const loaded = new Map<string, T>();
  try {
    if (!fs.existsSync(filePath)) {
      console.log('[Metrics Cache] No metrics-cache.json found; starting with an empty cache.');
      return loaded;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('[Metrics Cache] Cache file is not a journal map; starting with an empty cache.');
      return loaded;
    }
    Object.entries(parsed as Record<string, T>).forEach(([key, val]) => {
      loaded.set(key, val);
    });
    console.log(`[Metrics Cache] Loaded ${loaded.size} cached journals from disk.`);
  } catch (err) {
    console.warn('[Metrics Cache] Failed to load cache file, starting fresh:', err);
  }
  return loaded;
}
