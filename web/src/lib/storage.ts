// Browser storage that never throws (private windows and blocked storage just behave as empty).

export const lsGet = (k: string, d: string | null = null): string | null => {
  try { const v = localStorage.getItem(k); return v === null ? d : v } catch { return d }
}
export const lsSet = (k: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* blocked */ }
}
export const ssGet = (k: string): string => {
  try { return sessionStorage.getItem(k) || '' } catch { return '' }
}
export const ssSet = (k: string, v: string | null) => {
  try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k) } catch { /* blocked */ }
}

// A visitor's own API key: kept for this tab only (sessionStorage) unless they tick "Remember on this computer"
// (localStorage). It is only ever sent with their own presses, through relay.php, which never stores it.
const KEY_PREFIX = 'ct.key.'
export const ownKey = (p: string) => ssGet(KEY_PREFIX + p) || lsGet(KEY_PREFIX + p, '') || ''
export const keyRemembered = (p: string) => !!lsGet(KEY_PREFIX + p, '')
export function saveKey(p: string, k: string, remember: boolean) {
  ssSet(KEY_PREFIX + p, k)
  lsSet(KEY_PREFIX + p, remember ? k : null)
}
export function forgetKey(p: string) { ssSet(KEY_PREFIX + p, null); lsSet(KEY_PREFIX + p, null) }
