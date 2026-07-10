import { getSupabase, getUser } from "./supabase.js";

const LS_KEY = "biweekly-budget-state-v1";
const EMAIL_KEY = "biweekly-budget-last-email";

/**
 * Remember the last email used to sign in on this device, so the sign-in field
 * pre-fills it every time. This is the main guard against accidentally creating
 * a second account with a slightly different address. Kept separate from the
 * budget state so it survives sign-out (which clears the budget, not the email).
 */
export function getLastEmail() {
  try { return localStorage.getItem(EMAIL_KEY) || ""; } catch { return ""; }
}
export function setLastEmail(email) {
  try { if (email) localStorage.setItem(EMAIL_KEY, email); } catch { /* ignore */ }
}

function readLS() {
  try {
    const r = localStorage.getItem(LS_KEY);
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}
function writeLS(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* private mode, etc. */ }
}

// Rows are scoped to the signed-in user (auth.uid()), enforced by RLS — see
// supabase/schema.sql. Signing in with the same email on two devices is what
// shares one budget between them.
async function readCloud() {
  const sb = await getSupabase();
  const user = await getUser();
  if (!sb || !user) return null;
  try {
    const { data, error } = await sb
      .from("budget_state")
      .select("state")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return null;
    return data?.state || null;
  } catch { return null; }
}

// Returns true only when the row actually reached the cloud. Supabase resolves
// upsert() with an { error } object (it does not throw on a DB/permission error),
// while a network failure rejects — both used to be swallowed silently, which let
// a caller about to wipe the local copy (sign-out) believe the cloud was safe when
// it wasn't. Callers now decide what to do with a false.
async function writeCloud(state) {
  const sb = await getSupabase();
  const user = await getUser();
  if (!sb || !user) return false;
  try {
    const { error } = await sb.from("budget_state").upsert({
      user_id: user.id,
      state,
      updated_at: new Date().toISOString(),
    });
    return !error;
  } catch { return false; } // offline — local copy is still saved
}

/**
 * Pick the newer of two saved blobs by `_updatedAt` (a missing stamp counts as
 * oldest). Ties resolve to `a` — pass local first so an equal-timestamp tie keeps
 * the copy already on this device. Pure, so the last-write-wins rule is testable.
 */
export function newerOf(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return (b._updatedAt || 0) > (a._updatedAt || 0) ? b : a;
}

/**
 * This device's last-saved timestamp (0 if nothing saved). Used to decide, on a
 * manual "Sync now", whether the cloud is genuinely newer than local before
 * adopting it — so a stale cloud row can't clobber newer offline edits.
 */
export function localUpdatedAt() {
  return readLS()?._updatedAt || 0;
}

/**
 * Synchronous local-only read for an instant first paint — no network and no
 * Supabase SDK import on the critical path. The cloud copy is reconciled in the
 * background afterward (see the initial-load effect in App.jsx).
 */
export function loadLocal() {
  return readLS();
}

/**
 * Load best-available state. Reads local first (instant), then the signed-in
 * user's cloud row; whichever has the newer _updatedAt wins. Last-write-wins
 * is intentional for a single personal user across their own devices. Kept for
 * callers that want the reconciled result in one await; the app's first paint
 * uses loadLocal() + a background pullCloud() instead so it never waits on this.
 */
export async function loadState() {
  const local = readLS();
  const cloud = await readCloud();
  return newerOf(local, cloud);
}

/** Force a pull from the cloud for the signed-in user (used by the "Sync now" button). */
export async function pullCloud() {
  return readCloud();
}

/**
 * Wipe this device's local copy. Used on sign-out so the next account to sign in
 * on this device starts clean and restores its own data from the cloud, instead
 * of inheriting the previous user's numbers via last-write-wins.
 */
export function clearLocal() {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

/**
 * Persist to local always, and to the cloud once signed in. Returns the stamped
 * state plus whether the cloud write actually landed (`cloudSaved`) — sign-out
 * relies on this to avoid deleting the only good copy while offline.
 */
export async function saveState(state) {
  const stamped = { ...state, _updatedAt: Date.now() };
  writeLS(stamped);
  const cloudSaved = await writeCloud(stamped);
  return { state: stamped, cloudSaved };
}
