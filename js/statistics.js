/**
 * statistics.js
 * ---------------------------------------------------------------------------
 * Pure calculation + rendering of the dashboard metrics.
 *
 * `calculateStatistics()` is a pure function — give it an array of trading-day
 * records and it hands back every number the dashboard shows. That makes it
 * trivial to reuse for "all time" vs. "this month" without duplicating logic.
 * ---------------------------------------------------------------------------
 */

import { $, setText, flash, formatMoney, formatPercent, num, round2 } from './utils.js';

/**
 * @typedef {Object} Stats
 * @property {number} totalProfit    sum of all positive days
 * @property {number} totalLoss      sum of all losing days, as a positive number
 * @property {number} netPnl         totalProfit - totalLoss
 * @property {number} tradingDays    number of days with a logged record
 * @property {number} winningDays
 * @property {number} losingDays
 * @property {number} breakEvenDays
 * @property {number} totalTrades
 * @property {number} avgProfitPerWinningDay
 * @property {number} avgLossPerLosingDay    positive number
 * @property {number} avgPnlPerDay
 * @property {number} winRate        % of decided days (wins vs. losses) that were wins
 * @property {number} profitFactor   totalProfit / totalLoss
 * @property {number} bestDay
 * @property {number} worstDay
 */

/**
 * Crunch every dashboard metric from a list of records.
 * @param {Array<{profit_loss: number, trade_count: number}>} records
 * @returns {Stats}
 */
export function calculateStatistics(records = []) {
  let totalProfit = 0;
  let totalLoss = 0;          // accumulated as a positive magnitude
  let totalTrades = 0;
  let winningDays = 0;
  let losingDays = 0;
  let breakEvenDays = 0;
  let bestDay = 0;
  let worstDay = 0;

  for (const record of records) {
    const pnl = num(record.profit_loss);
    totalTrades += Math.max(0, Math.trunc(num(record.trade_count)));

    if (pnl > 0) {
      winningDays++;
      totalProfit += pnl;
      if (pnl > bestDay) bestDay = pnl;
    } else if (pnl < 0) {
      losingDays++;
      totalLoss += Math.abs(pnl);
      if (pnl < worstDay) worstDay = pnl;
    } else {
      breakEvenDays++;
    }
  }

  const tradingDays = records.length;
  const decidedDays = winningDays + losingDays; // break-even days don't count as win or loss

  return {
    totalProfit:  round2(totalProfit),
    totalLoss:    round2(totalLoss),
    netPnl:       round2(totalProfit - totalLoss),
    tradingDays,
    winningDays,
    losingDays,
    breakEvenDays,
    totalTrades,
    avgProfitPerWinningDay: winningDays ? round2(totalProfit / winningDays) : 0,
    avgLossPerLosingDay:    losingDays  ? round2(totalLoss / losingDays)   : 0,
    avgPnlPerDay:           tradingDays ? round2((totalProfit - totalLoss) / tradingDays) : 0,
    winRate:      decidedDays ? round2((winningDays / decidedDays) * 100) : 0,
    profitFactor: totalLoss   ? round2(totalProfit / totalLoss) : (totalProfit ? Infinity : 0),
    bestDay:      round2(bestDay),
    worstDay:     round2(worstDay),
  };
}

/**
 * Write the stats into the dashboard DOM.
 * @param {Stats} stats
 * @param {{ scopeLabel?: string, animate?: boolean }} [options]
 */
export function renderStatistics(stats, { scopeLabel = 'All time', animate = true } = {}) {
  /* ── Net P&L (with accent stripe) ── */
  const netEl   = $('#stat-net-pnl');
  const netCard = document.querySelector('.stat-card-net');

  setText(netEl, formatMoney(stats.netPnl, { signed: true }));
  netEl.className = `stat-value ${stats.netPnl > 0 ? 'text-profit' : stats.netPnl < 0 ? 'text-loss' : ''}`;

  netCard?.classList.toggle('is-profit', stats.netPnl > 0);
  netCard?.classList.toggle('is-loss',   stats.netPnl < 0);

  setText($('#stat-net-sub'),
    stats.tradingDays
      ? `${scopeLabel} · ${stats.tradingDays} trading day${stats.tradingDays === 1 ? '' : 's'}`
      : `${scopeLabel} · no days logged yet`);

  /* ── Headline cards ── */
  setText($('#stat-total-profit'), formatMoney(stats.totalProfit));
  setText($('#stat-total-loss'),   formatMoney(-stats.totalLoss));
  setText($('#stat-winning-days'), String(stats.winningDays));
  setText($('#stat-losing-days'),  String(stats.losingDays));

  setText($('#stat-win-rate'), formatPercent(stats.winRate));
  const bar = $('#stat-win-rate-bar');
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, stats.winRate))}%`;

  /* ── Secondary metrics ── */
  setText($('#stat-trading-days'),   String(stats.tradingDays));
  setText($('#stat-total-trades'),   String(stats.totalTrades));
  setText($('#stat-breakeven-days'), String(stats.breakEvenDays));
  setText($('#stat-avg-win'),  formatMoney(stats.avgProfitPerWinningDay));
  setText($('#stat-avg-loss'), formatMoney(-stats.avgLossPerLosingDay));

  const avgDayEl = $('#stat-avg-day');
  setText(avgDayEl, formatMoney(stats.avgPnlPerDay, { signed: true }));
  avgDayEl.className = `mini-value ${
    stats.avgPnlPerDay > 0 ? 'text-profit' : stats.avgPnlPerDay < 0 ? 'text-loss' : ''
  }`;

  /* ── Subtle pulse so the user notices the numbers moved ── */
  if (animate) {
    [netEl, $('#stat-total-profit'), $('#stat-total-loss'), $('#stat-win-rate')]
      .forEach((node) => flash(node));
  }
}
