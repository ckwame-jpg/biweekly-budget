import { getSupabase, getUser } from "./supabase.js";

const LS_KEY = "biweekly-budget-state-v1";

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
  const sb = getSupabase();
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

async function writeCloud(state) {
  const sb = getSupabase();
  const user = await getUser();
  if (!sb || !user) return;
  try {
    await sb.from("budget_state").upsert({
      user_id: user.id,
      state,
      updated_at: new Date().toISOString(),
    });
  } catch { /* offline — local copy still saved */ }
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

/** Persist to local always, and to the cloud once signed in. */
export async function saveState(state) {
  const stamped = { ...state, _updatedAt: Date.now() };
  writeLS(stamped);
  await writeCloud(stamped);
  return stamped;
}
