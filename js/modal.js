/**
 * modal.js
 * ---------------------------------------------------------------------------
 * The add / edit / delete dialog for a single trading day.
 *
 * It knows nothing about Supabase. app.js passes in `onSubmit` and `onDelete`
 * callbacks; this module just collects and validates input, then reports the
 * result back.
 * ---------------------------------------------------------------------------
 */

import { $, setMessage, longDateLabel, todayISO, num } from './utils.js';

/* ── Module state ───────────────────────────────────────────── */

let handlers = { onSubmit: null, onDelete: null };

/** The record currently being edited, or `null` when creating a new one. */
let activeRecord = null;

let isOpen = false;
let isBusy = false;
let boundOnce = false;

/* ── DOM refs ───────────────────────────────────────────────── */
const dom = {};

function cacheDom() {
  dom.overlay   = $('#modal-overlay');
  dom.modal     = $('#modal');
  dom.title     = $('#modal-title');
  dom.subtitle  = $('#modal-subtitle');
  dom.form      = $('#trade-form');
  dom.recordId  = $('#record-id');
  dom.date      = $('#trade-date');
  dom.count     = $('#trade-count');
  dom.pnl       = $('#profit-loss');
  dom.notes     = $('#notes');
  dom.message   = $('#modal-message');
  dom.saveBtn   = $('#save-btn');
  dom.deleteBtn = $('#delete-btn');
  dom.cancelBtn = $('#cancel-btn');
  dom.closeBtn  = $('#modal-close');
  dom.quickPl   = $('#quick-pl');
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════ */

/**
 * Wire the modal up once at boot.
 * @param {{ onSubmit: (payload, record) => Promise<void>,
 *           onDelete: (record) => Promise<void> }} options
 */
export function initModal(options = {}) {
  handlers = { ...handlers, ...options };
  cacheDom();
  bindEvents();
}

/**
 * Open the dialog.
 * @param {string} [iso]      date to preselect (`YYYY-MM-DD`), defaults to today
 * @param {object|null} [record] existing row — when present the form is
 *                               pre-filled and switches to "edit" mode
 */
export function openTradeModal(iso = todayISO(), record = null) {
  if (!dom.overlay) cacheDom();

  activeRecord = record;
  isBusy = false;
  isOpen = true;

  const editing = Boolean(record);

  dom.title.textContent    = editing ? 'Edit trading day' : 'Log trading day';
  dom.subtitle.textContent = longDateLabel(record?.trade_date ?? iso);
  dom.saveBtn.textContent  = editing ? 'Update' : 'Save';
  dom.deleteBtn.classList.toggle('hidden', !editing);

  dom.recordId.value = record?.id ?? '';
  dom.date.value     = record?.trade_date ?? iso;
  dom.count.value    = editing ? String(record.trade_count) : '';
  dom.pnl.value      = editing ? String(record.profit_loss) : '';
  dom.notes.value    = record?.notes ?? '';

  setMessage(dom.message, '');
  syncPnlColour();
  setBusy(false);

  dom.overlay.classList.remove('hidden', 'closing');
  document.body.style.overflow = 'hidden';

  // Focus the most useful field: trade count for a new day, notes when editing.
  setTimeout(() => (editing ? dom.notes : dom.count).focus(), 60);
}

/** Close the dialog with its exit animation. */
export function closeModal() {
  if (!isOpen || !dom.overlay) return;
  isOpen = false;

  dom.overlay.classList.add('closing');
  document.body.style.overflow = '';

  setTimeout(() => {
    dom.overlay.classList.add('hidden');
    dom.overlay.classList.remove('closing');
    dom.form.reset();
    activeRecord = null;
  }, 170);
}

/** Is the dialog currently on screen? */
export const isModalOpen = () => isOpen;

/* ═══════════════════════════════════════════════════════════════
   EVENTS
   ═══════════════════════════════════════════════════════════════ */

function bindEvents() {
  if (boundOnce) return;
  boundOnce = true;

  dom.form.addEventListener('submit', handleSubmit);
  dom.cancelBtn.addEventListener('click', closeModal);
  dom.closeBtn.addEventListener('click', closeModal);
  dom.deleteBtn.addEventListener('click', handleDelete);

  // Click the dim backdrop to dismiss.
  dom.overlay.addEventListener('mousedown', (e) => {
    if (e.target === dom.overlay && !isBusy) closeModal();
  });

  // Esc closes; Cmd/Ctrl+Enter saves.
  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape' && !isBusy) { e.preventDefault(); closeModal(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      dom.form.requestSubmit();
    }
  });

  // Live colour feedback on the P&L field.
  dom.pnl.addEventListener('input', syncPnlColour);

  // "Make negative" / "Make positive" chips.
  dom.quickPl?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sign]');
    if (!btn) return;
    const sign = Number(btn.dataset.sign);
    const value = Math.abs(num(dom.pnl.value));
    if (!value) { dom.pnl.focus(); return; }
    dom.pnl.value = String(sign * value);
    syncPnlColour();
  });
}

/* ═══════════════════════════════════════════════════════════════
   ACTIONS
   ═══════════════════════════════════════════════════════════════ */

async function handleSubmit(event) {
  event.preventDefault();
  if (isBusy) return;

  const payload = readForm();
  const problem = validate(payload);
  if (problem) {
    setMessage(dom.message, problem, 'error');
    return;
  }

  setBusy(true);
  setMessage(dom.message, '');

  try {
    await handlers.onSubmit?.(payload, activeRecord);
    closeModal();
  } catch (error) {
    setMessage(dom.message, error.message, 'error');
    setBusy(false);
  }
}

async function handleDelete() {
  if (isBusy || !activeRecord) return;

  const label = longDateLabel(activeRecord.trade_date);
  if (!window.confirm(`Delete the entry for ${label}? This cannot be undone.`)) return;

  setBusy(true);
  try {
    await handlers.onDelete?.(activeRecord);
    closeModal();
  } catch (error) {
    setMessage(dom.message, error.message, 'error');
    setBusy(false);
  }
}

/* ═══════════════════════════════════════════════════════════════
   FORM HELPERS
   ═══════════════════════════════════════════════════════════════ */

/** Read the form into a plain payload object. */
function readForm() {
  return {
    trade_date:  dom.date.value,
    trade_count: parseInt(dom.count.value, 10),
    profit_loss: parseFloat(dom.pnl.value),
    notes:       dom.notes.value,
  };
}

/**
 * Validate a payload.
 * @returns {string|null} an error message, or null when valid
 */
function validate({ trade_date, trade_count, profit_loss }) {
  if (!trade_date || !/^\d{4}-\d{2}-\d{2}$/.test(trade_date)) {
    return 'Pick a valid trading date.';
  }
  if (!Number.isFinite(trade_count) || trade_count < 0) {
    return 'Number of trades must be 0 or more.';
  }
  if (trade_count > 10_000) {
    return 'That trade count looks wrong — please double-check it.';
  }
  if (!Number.isFinite(profit_loss)) {
    return 'Enter a profit or loss amount (use a minus sign for losses).';
  }
  if (trade_count === 0 && profit_loss !== 0) {
    return 'A day with 0 trades should have a P&L of 0.';
  }
  return null;
}

/** Tint the P&L input green/red as the user types. */
function syncPnlColour() {
  const value = parseFloat(dom.pnl.value);
  dom.pnl.classList.toggle('is-profit', Number.isFinite(value) && value > 0);
  dom.pnl.classList.toggle('is-loss',   Number.isFinite(value) && value < 0);
}

/** Disable the dialog while a request is in flight. */
function setBusy(busy) {
  isBusy = busy;
  const editing = Boolean(activeRecord);

  dom.saveBtn.disabled   = busy;
  dom.deleteBtn.disabled = busy;
  dom.cancelBtn.disabled = busy;
  dom.saveBtn.textContent = busy ? 'Saving…' : editing ? 'Update' : 'Save';
}
