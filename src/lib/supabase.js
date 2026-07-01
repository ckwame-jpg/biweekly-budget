import { createClient } from "@supabase/supabase-js";

let client = null;

/**
 * Returns a Supabase client, or null when env vars are not set.
 * The app is fully usable on-device without Supabase; this only adds sync.
 */
export function getSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key);
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
  const sb = getSupabase();
  if (!sb) return { error: new Error("Supabase is not configured") };
  return sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function getUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data?.user || null;
}

export function onAuthChange(callback) {
  const sb = getSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_event, session) => callback(session?.user || null));
  return () => data.subscription.unsubscribe();
}
