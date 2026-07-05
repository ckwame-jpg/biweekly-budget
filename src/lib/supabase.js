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
 * Real auth (Phase 3, see CLAUDE.md): a magic link emailed to the user, no
 * password to manage. Signing in on two devices with the same email is what
 * links them — replacing the old "type the same sync code" model.
 */
export async function signInWithEmail(email) {
  const sb = await getSupabase();
  if (!sb) return { error: new Error("Supabase is not configured") };
  return sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
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
    const { data } = sb.auth.onAuthStateChange((_event, session) => callback(session?.user || null));
    unsubscribe = () => data.subscription.unsubscribe();
  });
  return () => { unsubscribed = true; unsubscribe(); };
}
