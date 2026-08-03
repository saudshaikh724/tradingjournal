/**
 * utils.js
 * ---------------------------------------------------------------------------
 * Small, dependency-free helpers shared across the app:
 * DOM lookups, date maths (timezone-safe), money formatting and toasts.
 * ---------------------------------------------------------------------------
 */

import { APP_CONFIG } from './config.js';

/* ═══════════════════════════════════════════════════════════════
   DOM
   ═══════════════════════════════════════════════════════════════ */

/** Query a single element. */
export const $ = (selector, root = document) => root.querySelector(selector);

/** Query all elements as a real array. */
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Set an element's text only when it actually changed (avoids layout churn). */
export function setText(el, value) {
  if (el && el.textContent !== value) el.textContent = value;
}

/** Create an element with optional class list, text and attributes. */
export function el(tag, { className, text, attrs } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/* ═══════════════════════════════════════════════════════════════
   DATES
   All dates are handled as local calendar dates. We deliberately avoid
   `new Date('2026-08-03')` because that parses as UTC midnight and can
   shift the day backwards for users in negative-offset timezones.
   ═══════════════════════════════════════════════════════════════ */

/** Convert a Date to a `YYYY-MM-DD` string using local time. */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a `YYYY-MM-DD` string into a local Date at midnight. */
export function fromISODate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Today as `YYYY-MM-DD`. */
export const todayISO = () => toISODate(new Date());

/** First day of the month containing `date`. */
export const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

/** Last day of the month containing `date`. */
export const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

/** Return a new Date shifted by `n` months (day clamped to 1). */
export const addMonths = (date, n) => new Date(date.getFullYear(), date.getMonth() + n, 1);

/** Add `n` days to a Date (returns a new Date). */
export const addDays = (date, n) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/** True when two Dates fall on the same calendar day. */
export const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** e.g. "August 2026" */
export function monthLabel(date) {
  return date.toLocaleDateString(APP_CONFIG.locale, { month: 'long', year: 'numeric' });
}

/** e.g. "Wednesday, 29 July 2026" */
export function longDateLabel(iso) {
  return fromISODate(iso).toLocaleDateString(APP_CONFIG.locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Weekday header labels ordered by the configured week start. */
export function weekdayNames() {
  const base = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const start = APP_CONFIG.weekStartsOn === 1 ? 1 : 0;
  return [...base.slice(start), ...base.slice(0, start)];
}

/**
 * Build the 6x7 (or 5x7) grid of dates for a month, including the
 * leading/trailing days needed to complete the first and last weeks.
 */
export function buildMonthMatrix(viewDate) {
  const start = startOfMonth(viewDate);
  const weekStart = APP_CONFIG.weekStartsOn === 1 ? 1 : 0;

  // How many leading days from the previous month we need.
  const lead = (start.getDay() - weekStart + 7) % 7;
  const gridStart = addDays(start, -lead);

  const daysInMonth = endOfMonth(viewDate).getDate();
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const date = addDays(gridStart, i);
    cells.push({
      date,
      iso: toISODate(date),
      inMonth: date.getMonth() === viewDate.getMonth(),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    });
  }
  return cells;
}

/* ═══════════════════════════════════════════════════════════════
   NUMBERS & MONEY
   ═══════════════════════════════════════════════════════════════ */

const currencyFmt = new Intl.NumberFormat(APP_CONFIG.locale, {
  style: 'currency',
  currency: APP_CONFIG.currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Coerce anything to a finite number (Supabase NUMERIC arrives as a string). */
export function num(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Full currency string, e.g. `-$2,620.00`.
 * @param {number} value
 * @param {{ signed?: boolean }} [opts] signed:true prefixes positives with "+"
 */
export function formatMoney(value, { signed = false } = {}) {
  const n = num(value);
  const str = currencyFmt.format(n);
  return signed && n > 0 ? `+${str}` : str;
}

/**
 * Compact currency for tight calendar cells: `$885`, `-$2.62K`, `$3.2K`, `$1.24M`.
 * Mirrors the density of the reference design.
 */
export function formatMoneyCompact(value) {
  const n = num(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const symbol = currencySymbol();

  const trim = (x, digits) => String(parseFloat(x.toFixed(digits)));

  if (abs >= 1_000_000) return `${sign}${symbol}${trim(abs / 1_000_000, 2)}M`;
  if (abs >= 1_000)     return `${sign}${symbol}${trim(abs / 1_000, 2)}K`;
  if (abs >= 100 || Number.isInteger(abs)) return `${sign}${symbol}${Math.round(abs).toLocaleString(APP_CONFIG.locale)}`;
  return `${sign}${symbol}${trim(abs, 2)}`;
}

/** The currency symbol for the configured locale/currency. */
function currencySymbol() {
  const part = currencyFmt.formatToParts(0).find((p) => p.type === 'currency');
  return part ? part.value : '$';
}

/** Percentage with one decimal, e.g. `62.5%`. */
export const formatPercent = (value) => `${num(value).toFixed(1)}%`;

/** Round to 2 decimals, avoiding float drift like 0.1 + 0.2. */
export const round2 = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100;

/** "1 trade" / "5 trades" */
export const pluralTrades = (count) => `${count} ${count === 1 ? 'trade' : 'trades'}`;

/* ═══════════════════════════════════════════════════════════════
   FEEDBACK
   ═══════════════════════════════════════════════════════════════ */

/**
 * Show a transient toast in the bottom-right corner.
 * @param {string} message
 * @param {'default'|'success'|'error'} [type]
 */
export function showToast(message, type = 'default') {
  const host = $('#toast-host');
  if (!host) return;

  const toast = el('div', { className: `toast ${type}`, text: message });
  host.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 2800);
}

/** Show an inline message inside an `.auth-message` / `.modal-message` box. */
export function setMessage(node, text, type = 'error') {
  if (!node) return;
  node.className = `${node.classList.contains('modal-message') ? 'modal-message' : 'auth-message'}`;
  if (!text) return;
  node.classList.add('show', type);
  node.textContent = text;
}

/** Briefly re-trigger a CSS animation class on an element. */
export function flash(node, className = 'flash') {
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth; // force reflow so the animation restarts
  node.classList.add(className);
}
