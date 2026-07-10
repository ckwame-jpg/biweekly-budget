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
 * Passwordless sign-in: emails the user a one-time code (and, if the template
 * keeps the link, a link too). Verify the code with verifyEmailCode() below.
 * Entering the CODE — rather than clicking the link — is what makes this work
 * inside an installed home-screen app, where the link would open in the browser
 * instead of the app. Signing in with the same email on two devices links them.
 */
export async function signInWithEmail(email) {
  const sb = await getSupabase();
  if (!sb) return { error: new Error("Supabase is not configured") };
  return sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
}

/**
 * Complete a passwordless sign-in by verifying the 6-digit code from the email
 * (paired with signInWithEmail). type "email" covers both a fresh signup and a
 * returning login. On success the session is created right here in the app — no
 * link, no browser hop — which is the whole point on an installed PWA.
 */
export async function verifyEmailCode(email, code) {
  const sb = await getSupabase();
  if (!sb) return { error: new Error("Supabase is not configured") };
  return sb.auth.verifyOtp({ email, token: String(code).trim(), type: "email" });
}

/**
 * Email + password login. Unlike the magic link (which must be opened on the
 * device you're signing in on), a password can be typed on any device — so this
 * is the reliable way to pull your cloud budget onto a new phone or computer.
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

// Set/replace the password on the currently signed-in account. Lets accounts
// that were created passwordless (magic link) add a password so they can log in
// with it afterwards.
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
    // event is "SIGNED_IN" | "SIGNED_OUT" | "INITIAL_SESSION" | "TOKEN_REFRESHED" | ...
    const { data } = sb.auth.onAuthStateChange((event, session) => callback(session?.user || null, event));
    unsubscribe = () => data.subscription.unsubscribe();
  });
  return () => { unsubscribed = true; unsubscribe(); };
}
