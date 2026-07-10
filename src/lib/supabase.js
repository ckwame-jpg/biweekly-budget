let client = null;
let clientPromise = null;

/**
 * Returns a Supabase client, or null when env vars are not set. The
 * @supabase/supabase-js SDK is only fetched (via dynamic import) the first
 * time this actually runs with valid config, so users who never enable sync
 * never download it. The app is fully usable on-device without Supabase.
 */
export async function getSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) {
    if (!clientPromise) {
      clientPromise = import("@supabase/supabase-js").then(({ createClient }) => createClient(url, key));
    }
    client = await clientPromise;
  }
  return client;
}

export const supabaseConfigured = () =>
  Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

/**
 * Email + password login — the only sign-in method. Works on any device (type
 * the same email + password anywhere), and a mistyped email during sign-up
 * always errors instead of silently creating a duplicate account.
 */
export async function signInWithPassword(email, password) {
  const sb = await getSupabase();
  if (!sb) return { error: new Error("Supabase is not configured") };
  return sb.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email, password) {
  const sb = await getSupabase();
  if (!sb) return { error: new Error("Supabase is not configured") };
  return sb.auth.signUp({ email, password });
}

/**
 * Email a password-reset link. Unlike the sign-in code/link this app dropped
 * (which had to establish a session *inside the installed app*), a reset link
 * is fine to open in the browser: it lands back on this app's own origin,
 * which the Supabase client detects and turns into a PASSWORD_RECOVERY event
 * (see onAuthChange below) — the user sets a new password right there, then
 * simply logs into the installed app with it afterward. No app-session hop
 * needed. Requires this origin to be an allow-listed Redirect URL in the
 * Supabase dashboard (Authentication → URL Configuration).
 */
export async function sendPasswordReset(email) {
  const sb = await getSupabase();
  if (!sb) return { error: new Error("Supabase is not configured") };
  return sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
}

// Set/replace the password on the currently signed-in account.
export async function updatePassword(password) {
  const sb = await getSupabase();
  if (!sb) return { error: new Error("Supabase is not configured") };
  return sb.auth.updateUser({ password });
}

export async function signOut() {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function getUser() {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data?.user || null;
}

export function onAuthChange(callback) {
  let unsubscribed = false;
  let unsubscribe = () => {};
  getSupabase().then((sb) => {
    if (!sb || unsubscribed) return;
    // event is "SIGNED_IN" | "SIGNED_OUT" | "INITIAL_SESSION" | "TOKEN_REFRESHED" |
    // "PASSWORD_RECOVERY" (fires once, right after a reset-link redirect lands
    // back on this origin with a recovery token in the URL) | ...
    const { data } = sb.auth.onAuthStateChange((event, session) => callback(session?.user || null, event));
    unsubscribe = () => data.subscription.unsubscribe();
  });
  return () => { unsubscribed = true; unsubscribe(); };
}
