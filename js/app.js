/**
 * app.js
 * ---------------------------------------------------------------------------
 * Application entry point and the single owner of state.
 *
 * Flow:
 *   boot → initialise Supabase → check session
 *        → signed out?  show the auth screen
 *        → signed in?   show the app, load data, render calendar + stats
 *
 * Every mutation funnels through `refreshCalendar()`, so the grid and the
 * dashboard can never drift out of sync with the database.
 * ---------------------------------------------------------------------------
 */

import {
  initializeSupabase, getSession, onAuthChange,
  signIn, signUp, signOut,
  loadTradingDays, saveTradingDay, updateTradingDay, deleteTradingDay,
} from './supabase.js';

import {
  loadCalendar, renderCalendarData, getVisibleRecords,
  getViewDate, goToToday, highlightDay,
} from './calendar.js';

import { calculateStatistics, renderStatistics } from './statistics.js';
import { initModal, openTradeModal } from './modal.js';
import { $, setMessage, showToast, todayISO, monthLabel } from './utils.js';

/* ═══════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════ */

const state = {
  /** @type {Map<string, object>} keyed by `YYYY-MM-DD` */
  days: new Map(),
  /** 'all' | 'month' */
  scope: 'all',
  user: null,
  wired: false,
};

/* ═══════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  try {
    initializeSupabase();
  } catch (error) {
    // Missing/placeholder credentials — surface it on the auth screen.
    showScreen('auth');
    setMessage($('#auth-message'), error.message, 'error');
    $('#auth-form')?.querySelectorAll('input, button').forEach((n) => (n.disabled = true));
    return;
  }

  bindAuthUI();

  // React to sign in / sign out from anywhere (including another tab).
  onAuthChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      state.user = null;
      state.days.clear();
      showScreen('auth');
    } else if (session?.user && session.user.id !== state.user?.id) {
      startApp(session.user);
    }
  });

  try {
    const session = await getSession();
    session?.user ? await startApp(session.user) : showScreen('auth');
  } catch (error) {
    showScreen('auth');
    setMessage($('#auth-message'), error.message, 'error');
  }
}

/** Show the app shell for a signed-in user and load their data. */
async function startApp(user) {
  state.user = user;
  $('#user-email').textContent = user.email ?? '';
  showScreen('app');

  wireApp();
  await refreshCalendar();
}

/** Bind app-level UI exactly once. */
function wireApp() {
  if (state.wired) return;
  state.wired = true;

  loadCalendar({
    onDayClick: (iso, record) => openTradeModal(iso, record),
    onViewChange: () => renderStats(),
  });

  initModal({ onSubmit: handleSubmit, onDelete: handleDelete });

  $('#add-btn')?.addEventListener('click', () => {
    const iso = todayISO();
    openTradeModal(iso, state.days.get(iso) ?? null);
  });

  $('#logout-btn')?.addEventListener('click', handleSignOut);

  // All-time vs. current-month statistics.
  document.querySelectorAll('.scope-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.scope = btn.dataset.scope;
      document.querySelectorAll('.scope-btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      renderStats();
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════ */

/**
 * Re-read every trading day from Supabase, then repaint the calendar
 * and the dashboard. This is the single source of truth after any change.
 *
 * @param {{ highlight?: string }} [options] optional date to pulse after reload
 */
export async function refreshCalendar({ highlight } = {}) {
  try {
    const records = await loadTradingDays();

    state.days = new Map(records.map((r) => [r.trade_date, r]));
    renderCalendarData(state.days);
    renderStats();

    if (highlight) highlightDay(highlight);
  } catch (error) {
    console.error('[trading-journal]', error);
    showToast(error.message, 'error');

    // Still render whatever we already have so the UI is never blank.
    renderCalendarData(state.days);
    renderStats();
  }
}

/** Recompute + repaint the dashboard for the active scope. */
function renderStats() {
  const monthScope = state.scope === 'month';
  const records = monthScope ? getVisibleRecords() : [...state.days.values()];
  const scopeLabel = monthScope ? monthLabel(getViewDate()) : 'All time';

  renderStatistics(calculateStatistics(records), { scopeLabel });
}

/* ═══════════════════════════════════════════════════════════════
   MUTATIONS  (called by the modal)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Create or update a trading day.
 * @param {{trade_date: string, trade_count: number, profit_loss: number, notes: string}} payload
 * @param {object|null} record the row being edited, if any
 */
async function handleSubmit(payload, record) {
  // Editing and moving the entry onto a date that is already taken.
  const clash = state.days.get(payload.trade_date);
  if (record && clash && clash.id !== record.id) {
    throw new Error('Another entry already exists on that date. Delete it first, or pick another day.');
  }

  // If the user opened a blank form on a date that already has a row,
  // treat it as an edit rather than a duplicate insert.
  const target = record ?? clash ?? null;

  if (target) {
    await updateTradingDay(target.id, payload);
    showToast('Trading day updated', 'success');
  } else {
    await saveTradingDay(payload);
    showToast('Trading day saved', 'success');
  }

  await refreshCalendar({ highlight: payload.trade_date });
}

/** Delete a trading day. */
async function handleDelete(record) {
  await deleteTradingDay(record.id);
  showToast('Entry deleted', 'success');
  await refreshCalendar();
}

/* ═══════════════════════════════════════════════════════════════
   AUTH UI
   ═══════════════════════════════════════════════════════════════ */

let authMode = 'signin'; // 'signin' | 'signup'

function bindAuthUI() {
  const form     = $('#auth-form');
  const toggle   = $('#auth-toggle-btn');
  const submit   = $('#auth-submit');
  const message  = $('#auth-message');
  const emailEl  = $('#auth-email');
  const passEl   = $('#auth-password');

  toggle?.addEventListener('click', () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    const signingIn = authMode === 'signin';

    submit.textContent = signingIn ? 'Sign in' : 'Create account';
    $('#auth-toggle-text').textContent = signingIn ? "Don't have an account?" : 'Already have an account?';
    toggle.textContent = signingIn ? 'Create one' : 'Sign in';
    passEl.setAttribute('autocomplete', signingIn ? 'current-password' : 'new-password');
    setMessage(message, '');
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = emailEl.value.trim();
    const password = passEl.value;

    if (!email || !password) {
      return setMessage(message, 'Enter your email and password.', 'error');
    }
    if (password.length < 6) {
      return setMessage(message, 'Password must be at least 6 characters.', 'error');
    }

    setMessage(message, '');
    submit.disabled = true;
    submit.textContent = authMode === 'signin' ? 'Signing in…' : 'Creating account…';

    try {
      if (authMode === 'signin') {
        const user = await signIn(email, password);
        await startApp(user);
      } else {
        const { user, needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) {
          setMessage(message, 'Account created. Check your inbox to confirm your email, then sign in.', 'success');
        } else if (user) {
          await startApp(user);
        }
      }
    } catch (error) {
      setMessage(message, error.message, 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = authMode === 'signin' ? 'Sign in' : 'Create account';
    }
  });
}

async function handleSignOut() {
  try {
    await signOut();
    state.user = null;
    state.days.clear();
    showScreen('auth');
    goToToday();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   SCREENS
   ═══════════════════════════════════════════════════════════════ */

/** @param {'boot'|'auth'|'app'} name */
function showScreen(name) {
  $('#boot-screen')?.classList.toggle('hidden', name !== 'boot');
  $('#auth-screen')?.classList.toggle('hidden', name !== 'auth');
  $('#app')?.classList.toggle('hidden', name !== 'app');
}
