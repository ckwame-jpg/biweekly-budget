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

// Returns true only when the row actually landed in the cloud, so callers that
// are about to destroy local data (sign-out) can tell whether it's safe.
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
  } catch { return false; /* offline — local copy still saved */ }
}

/**
 * Load best-available state. Reads local first (instant), then the signed-in
 * user's cloud row; whichever has the newer _updatedAt wins. Last-write-wins
 * is intentional for a single personal user across their own devices.
 */
export async function loadState() {
  const local = readLS();
  const cloud = await readCloud();
  if (local && cloud) {
    return (cloud._updatedAt || 0) > (local._updatedAt || 0) ? cloud : local;
  }
  return cloud || local || null;
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

/** Persist to local always, and to the cloud once signed in. */
export async function saveState(state) {
  const stamped = { ...state, _updatedAt: Date.now() };
  writeLS(stamped);
  const cloudOk = await writeCloud(stamped);
  return { cloudOk };
}
