/**
 * supabase.js
 * ---------------------------------------------------------------------------
 * The only module that talks to the database.
 *
 * Responsibilities:
 *   • create + expose the Supabase client
 *   • authentication (sign up / sign in / sign out / session)
 *   • CRUD against the `trading_days` table
 *
 * Everything here returns plain JS objects; the rest of the app never sees
 * a Supabase-specific type. Errors are thrown as normal `Error`s with a
 * human-readable message so callers can just try/catch.
 * ---------------------------------------------------------------------------
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { round2, num } from './utils.js';

const TABLE = 'trading_days';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;

/* ═══════════════════════════════════════════════════════════════
   CLIENT
   ═══════════════════════════════════════════════════════════════ */

/**
 * Create the Supabase client. Safe to call more than once — the client
 * is memoised.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function initializeSupabase() {
  if (client) return client;

  const configured =
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
    !SUPABASE_ANON_KEY.includes('YOUR-ANON');

  if (!configured) {
    throw new Error(
      'Supabase is not configured. Open js/config.js and paste your Project URL and anon key.'
    );
  }

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,      // keep the user signed in across reloads
      autoRefreshToken: true,
      detectSessionInUrl: true,  // handles email-confirmation redirects
    },
  });

  return client;
}

/** Get the initialised client (throws if `initializeSupabase()` was not called). */
export function getClient() {
  if (!client) throw new Error('Supabase client has not been initialised yet.');
  return client;
}

/* ═══════════════════════════════════════════════════════════════
   AUTH
   ═══════════════════════════════════════════════════════════════ */

/** Current session, or `null` when signed out. */
export async function getSession() {
  const { data, error } = await getClient().auth.getSession();
  if (error) throw asError(error);
  return data.session ?? null;
}

/** Current user, or `null`. */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/** Sign in with email + password. */
export async function signIn(email, password) {
  const { data, error } = await getClient().auth.signInWithPassword({ email, password });
  if (error) throw asError(error);
  return data.user;
}

/**
 * Register a new account.
 * @returns {{ user: object|null, needsConfirmation: boolean }}
 */
export async function signUp(email, password) {
  const { data, error } = await getClient().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw asError(error);

  // When "Confirm email" is enabled in Supabase, no session is returned.
  return { user: data.user, needsConfirmation: !data.session };
}

/** Sign the current user out. */
export async function signOut() {
  const { error } = await getClient().auth.signOut();
  if (error) throw asError(error);
}

/**
 * Subscribe to auth changes (sign in, sign out, token refresh).
 * @param {(event: string, session: object|null) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onAuthChange(callback) {
  const { data } = getClient().auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}

/* ═══════════════════════════════════════════════════════════════
   CRUD — trading_days
   ═══════════════════════════════════════════════════════════════ */

/**
 * Fetch trading days for the signed-in user.
 * RLS already scopes rows to the user, so no `user_id` filter is needed.
 *
 * @param {{ from?: string, to?: string }} [range] optional `YYYY-MM-DD` bounds
 * @returns {Promise<Array<TradingDay>>}
 */
export async function loadTradingDays(range = {}) {
  let query = getClient()
    .from(TABLE)
    .select('id, trade_date, trade_count, profit_loss, notes, created_at, updated_at')
    .order('trade_date', { ascending: true });

  if (range.from) query = query.gte('trade_date', range.from);
  if (range.to)   query = query.lte('trade_date', range.to);

  const { data, error } = await query;
  if (error) throw asError(error);

  return (data ?? []).map(normalise);
}

/**
 * Insert a new trading day.
 * @param {{ trade_date: string, trade_count: number, profit_loss: number, notes?: string }} payload
 */
export async function saveTradingDay(payload) {
  const user = await requireUser();

  const { data, error } = await getClient()
    .from(TABLE)
    .insert({ ...sanitise(payload), user_id: user.id })
    .select()
    .single();

  if (error) throw asError(error);
  return normalise(data);
}

/**
 * Update an existing trading day by id.
 * @param {string} id
 * @param {{ trade_date: string, trade_count: number, profit_loss: number, notes?: string }} payload
 */
export async function updateTradingDay(id, payload) {
  const { data, error } = await getClient()
    .from(TABLE)
    .update({ ...sanitise(payload), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw asError(error);
  return normalise(data);
}

/**
 * Insert-or-update in one round trip, keyed on (user_id, trade_date).
 * Used by the modal so re-saving an existing date never trips the
 * unique constraint.
 */
export async function upsertTradingDay(payload) {
  const user = await requireUser();

  const { data, error } = await getClient()
    .from(TABLE)
    .upsert(
      { ...sanitise(payload), user_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,trade_date' }
    )
    .select()
    .single();

  if (error) throw asError(error);
  return normalise(data);
}

/** Delete a trading day by id. */
export async function deleteTradingDay(id) {
  const { error } = await getClient().from(TABLE).delete().eq('id', id);
  if (error) throw asError(error);
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   INTERNAL HELPERS
   ═══════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} TradingDay
 * @property {string} id
 * @property {string} trade_date  `YYYY-MM-DD`
 * @property {number} trade_count
 * @property {number} profit_loss
 * @property {string} notes
 */

/** Coerce a DB row into predictable JS types. */
function normalise(row) {
  if (!row) return null;
  return {
    id: row.id,
    trade_date: String(row.trade_date).slice(0, 10),
    trade_count: Math.max(0, Math.trunc(num(row.trade_count))),
    profit_loss: round2(row.profit_loss),
    notes: row.notes ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Clamp/normalise a payload before it hits the database. */
function sanitise({ trade_date, trade_count, profit_loss, notes }) {
  return {
    trade_date,
    trade_count: Math.max(0, Math.trunc(num(trade_count))),
    profit_loss: round2(profit_loss),
    notes: (notes ?? '').trim() || null,
  };
}

/** Throw if nobody is signed in; otherwise return the user. */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('You are signed out. Please sign in again.');
  return user;
}

/** Turn a Supabase error into a friendlier Error. */
function asError(error) {
  const raw = error?.message || 'Something went wrong talking to the database.';

  if (/duplicate key|unique constraint/i.test(raw)) {
    return new Error('You already logged a day for that date. Open it to edit instead.');
  }
  if (/row-level security|violates row-level/i.test(raw)) {
    return new Error('Permission denied. Make sure the RLS policies from sql/schema.sql are applied.');
  }
  if (/relation .* does not exist/i.test(raw)) {
    return new Error('The `trading_days` table is missing. Run sql/schema.sql in the Supabase SQL editor.');
  }
  if (/invalid login credentials/i.test(raw)) {
    return new Error('Incorrect email or password.');
  }
  if (/email not confirmed/i.test(raw)) {
    return new Error('Please confirm your email address first — check your inbox.');
  }
  if (/failed to fetch|networkerror/i.test(raw)) {
    return new Error('Cannot reach Supabase. Check your internet connection and the URL in config.js.');
  }
  return new Error(raw);
}
