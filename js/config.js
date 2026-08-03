/**
 * config.js
 * ---------------------------------------------------------------------------
 * Supabase project credentials.
 *
 * Project:  Trading Journal  (fgngiipeygfnqqolbpao)
 *
 * The key below is a PUBLISHABLE key. It is designed to ship in frontend code
 * and is safe to commit to a public repo — it only grants what the Row Level
 * Security policies in sql/schema.sql allow.
 *
 * NEVER put either of these in this file:
 *   • the `secret` / `service_role` key  — bypasses RLS entirely
 *   • the database password              — full Postgres superuser access
 *
 * To find these values again: Supabase Dashboard → Project Settings → API Keys.
 * ---------------------------------------------------------------------------
 */

export const SUPABASE_URL = 'https://fgngiipeygfnqqolbpao.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_JgCUOU2VgsNaGlQtDb9nEA_YpDR8Hfx';

/** App-wide preferences. */
export const APP_CONFIG = {
  /** 0 = weeks start on Sunday, 1 = weeks start on Monday. */
  weekStartsOn: 0,

  /** Currency used for all money formatting. */
  currency: 'USD',
  locale: 'en-US',
};
