// Staff idle clock — the time of the last dashboard activity, shared across
// tabs through localStorage. Read by components/admin/IdleSignOut.tsx; reset on
// sign-in and cleared on sign-out so a stale time can't sign someone straight
// back out.

const STORAGE_KEY = "volt-staff-last-activity";
/** sessionStorage flag so the login page can say why you were signed out. */
export const IDLE_SIGNOUT_FLAG = "volt-idle-signed-out";

export function readIdleClock(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function writeIdleClock(t: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(t));
  } catch {
    /* private mode — each tab's own timer still works */
  }
}

/** Start the clock fresh — call on sign-in. */
export function resetIdleClock() {
  writeIdleClock(Date.now());
}

/** Forget the clock — call on sign-out. */
export function clearIdleClock() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
