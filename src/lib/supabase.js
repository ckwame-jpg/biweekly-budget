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
 * Synchronous, dependency-free check for whether the current URL is a
 * password-reset redirect — read directly from window.location, not from a
 * Supabase client event. The client's own recovery detection runs as soon as
 * createClient() is called, which can complete and fire "PASSWORD_RECOVERY"
 * before this app's listener even attaches (attaching it requires an async
 * dynamic import of the whole SDK first) — so relying on catching that event
 * is a real race that can silently swallow it. Reading the URL ourselves,
 * on the very first render, has no such race. Supabase's email links put
 * `type=recovery` either in the URL hash (implicit flow: #access_token=...)
 * or the query string (PKCE flow: ?code=...&type=recovery).
 */
export function isRecoveryLink() {
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return /type=recovery/.test(hash) || /type=recovery/.test(search);
}

/** A reset link that's expired or already been used comes back as an error in
 * the URL (e.g. #error=access_denied&error_code=otp_expired&error_description=...)
 * instead of a valid token — surface it in place of the password form. */
export function getUrlAuthError() {
  const raw = (window.location.hash || "").replace(/^#/, "") || (window.location.search || "").replace(/^\?/, "");
  const params = new URLSearchParams(raw);
  const desc = params.get("error_description") || params.get("error");
  return desc ? decodeURIComponent(desc.replace(/\+/g, " ")) : null;
}

/**
 * Finish establishing the session from a URL that Supabase redirected back to.
 * Only needed for the PKCE flow, where the email link carries a `?code=...`
 * that must be explicitly exchanged for a session — the implicit flow's hash
 * tokens are already auto-detected by the client (detectSessionInUrl: true,
 * the default) with no action needed here. Safe to call unconditionally: a
 * no-op when there's no code param, and harmless if the code was somehow
 * already consumed (the resulting error is simply ignored — the recovery
 * screen itself will fail informatively on submit if there's truly no session).
 */
export async function completeUrlSession() {
  const sb = await getSupabase();
  if (!sb) return;
  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) return;
  try { await sb.auth.exchangeCodeForSession(code); } catch { /* see doc above */ }
}

/** Strips auth params (hash + ?code) from the URL bar once they've been
 * consumed, so a stray reset token doesn't linger visibly or in history, and
 * reloading the page doesn't re-trigger recovery mode. */
export function clearUrlAuthParams() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("type");
  window.history.replaceState(null, "", url.pathname + url.search);
}

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
