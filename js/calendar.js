/**
 * calendar.js
 * ---------------------------------------------------------------------------
 * Owns the month grid: which month is on screen, building the cells and
 * painting P&L data into them.
 *
 * This module is deliberately "dumb" about the database — it receives a
 * `Map<'YYYY-MM-DD', TradingDay>` and renders it. app.js supplies the data
 * and handles clicks.
 * ---------------------------------------------------------------------------
 */

import {
  $, el, setText,
  buildMonthMatrix, startOfMonth, endOfMonth, addMonths,
  toISODate, todayISO, monthLabel, weekdayNames,
  formatMoney, formatMoneyCompact as compact,
  pluralTrades, num,
} from './utils.js';

/* ── Module state ───────────────────────────────────────────── */

/** The month currently on screen (always the 1st of that month). */
let viewDate = startOfMonth(new Date());

/** `Map<'YYYY-MM-DD', TradingDay>` of the rows we know about. */
let dayMap = new Map();

/** Callbacks supplied by app.js. */
let handlers = { onDayClick: null, onViewChange: null };

/* ── DOM refs (resolved on init) ─────────────────────────────── */
let gridEl, weekdayEl, titleEl;

/* ═══════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════ */

/**
 * Build the calendar shell and wire up navigation.
 * Call once, after the DOM is ready.
 *
 * @param {{ onDayClick?: (iso: string, record: object|null) => void,
 *           onViewChange?: (viewDate: Date) => void }} options
 */
export function loadCalendar(options = {}) {
  handlers = { ...handlers, ...options };

  gridEl    = $('#calendar-grid');
  weekdayEl = $('#weekday-row');
  titleEl   = $('#cal-title');

  renderWeekdayHeader();
  bindNavigation();
  renderCalendarData();
}

/**
 * Paint trading data into the grid.
 * @param {Map<string, object>} [map] when omitted, re-renders the current data
 */
export function renderCalendarData(map) {
  if (map) dayMap = map;
  renderGrid();
  renderMonthSummary();
}

/** The first day of the month currently displayed. */
export const getViewDate = () => new Date(viewDate);

/** `{ from, to }` ISO bounds of the displayed month. */
export function getViewRange() {
  return { from: toISODate(startOfMonth(viewDate)), to: toISODate(endOfMonth(viewDate)) };
}

/** Records that fall inside the displayed month. */
export function getVisibleRecords() {
  const { from, to } = getViewRange();
  return [...dayMap.values()].filter((r) => r.trade_date >= from && r.trade_date <= to);
}

/** Jump to the month containing `date`. */
export function goToMonth(date) {
  viewDate = startOfMonth(date);
  renderCalendarData();
  handlers.onViewChange?.(getViewDate());
}

/** Jump to the current month. */
export const goToToday = () => goToMonth(new Date());

/** Briefly highlight a day cell (used after a save). */
export function highlightDay(iso) {
  const cell = gridEl?.querySelector(`[data-date="${iso}"]`);
  if (!cell) return;
  cell.classList.remove('just-saved');
  void cell.offsetWidth; // restart the animation
  cell.classList.add('just-saved');
}

/* ═══════════════════════════════════════════════════════════════
   RENDERING
   ═══════════════════════════════════════════════════════════════ */

/** Sun … Sat (or Mon … Sun) column headers. */
function renderWeekdayHeader() {
  if (!weekdayEl) return;
  weekdayEl.replaceChildren(
    ...weekdayNames().map((name) => el('div', { className: 'weekday', text: name }))
  );
}

/** Build every day cell for the visible month. */
function renderGrid() {
  if (!gridEl) return;

  setText(titleEl, monthLabel(viewDate));

  const today = todayISO();

  // Leading/trailing days belong to another month — they stay blank so the
  // month's numbers are never ambiguous.
  const cells = buildMonthMatrix(viewDate).map((cell) =>
    buildDayCell(cell, cell.inMonth ? dayMap.get(cell.iso) ?? null : null, today)
  );

  gridEl.replaceChildren(...cells);

  // Re-trigger the entrance animation on month change.
  gridEl.classList.remove('swap-in');
  void gridEl.offsetWidth;
  gridEl.classList.add('swap-in');
}

/**
 * One calendar cell.
 * @param {{date: Date, iso: string, inMonth: boolean, isWeekend: boolean}} cell
 * @param {object|null} record
 * @param {string} today ISO string for today
 */
function buildDayCell(cell, record, today) {
  const node = el('button', {
    className: 'day-cell',
    attrs: { type: 'button', 'data-date': cell.iso, role: 'gridcell' },
  });

  if (!cell.inMonth)   node.classList.add('is-outside');
  if (cell.isWeekend)  node.classList.add('is-weekend');
  if (cell.iso === today) node.classList.add('is-today');

  // Cells outside the current month are inert — keeps navigation predictable.
  if (!cell.inMonth) node.disabled = true;

  node.appendChild(el('span', { className: 'day-number', text: String(cell.date.getDate()) }));

  if (record) {
    const pnl = num(record.profit_loss);
    node.classList.add(pnl > 0 ? 'is-profit' : pnl < 0 ? 'is-loss' : 'is-flat');

    const body = el('span', { className: 'day-body' });
    body.appendChild(el('span', { className: 'day-pnl', text: compact(pnl) }));
    body.appendChild(el('span', { className: 'day-trades', text: pluralTrades(record.trade_count) }));
    node.appendChild(body);

    if (record.notes) node.appendChild(el('span', { className: 'note-dot' }));

    node.title = `${formatMoney(pnl, { signed: true })} · ${pluralTrades(record.trade_count)}${
      record.notes ? `\n${record.notes}` : ''
    }`;
    node.setAttribute('aria-label',
      `${cell.iso}: ${formatMoney(pnl, { signed: true })}, ${pluralTrades(record.trade_count)}`);
  } else {
    node.classList.add('is-empty');
    if (cell.inMonth) {
      node.appendChild(el('span', { className: 'add-hint', text: '+' }));
      node.title = 'Click to log this day';
      node.setAttribute('aria-label', `${cell.iso}: no trades logged`);
    }
  }

  if (cell.inMonth) {
    node.addEventListener('click', () => handlers.onDayClick?.(cell.iso, record));
  }

  return node;
}

/** The little "Month P&L / Trades" pill in the toolbar. */
function renderMonthSummary() {
  const records = getVisibleRecords();
  const pnl    = records.reduce((sum, r) => sum + num(r.profit_loss), 0);
  const trades = records.reduce((sum, r) => sum + r.trade_count, 0);

  const pnlEl = $('#ms-pnl');
  if (pnlEl) {
    setText(pnlEl, formatMoney(pnl, { signed: true }));
    pnlEl.className = pnl > 0 ? 'text-profit' : pnl < 0 ? 'text-loss' : 'text-flat';
  }
  setText($('#ms-trades'), String(trades));
}

/* ═══════════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════════ */

function bindNavigation() {
  $('#prev-month')?.addEventListener('click', () => goToMonth(addMonths(viewDate, -1)));
  $('#next-month')?.addEventListener('click', () => goToMonth(addMonths(viewDate, 1)));
  $('#today-btn')?.addEventListener('click', goToToday);

  // Arrow keys move between months when focus is not inside a form field.
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')) return;
    if (!$('#modal-overlay')?.classList.contains('hidden')) return; // modal is open

    if (e.key === 'ArrowLeft')  goToMonth(addMonths(viewDate, -1));
    if (e.key === 'ArrowRight') goToMonth(addMonths(viewDate, 1));
    if (e.key.toLowerCase() === 't') goToToday();
  });
}
