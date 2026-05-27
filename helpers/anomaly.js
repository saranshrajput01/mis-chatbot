/**
 * helpers/anomaly.js — Phase 22 Sprint 3B
 *
 * Pure z-score-based anomaly detection on KPI sparkline arrays.
 * Returns { flagged: boolean, sigma: number, reason: string } given a
 * sparkline (array of daily values).
 *
 * Usage:
 *   const { detectAnomaly } = require('./helpers/anomaly');
 *   const result = detectAnomaly([1.2, 1.4, 1.1, 0.9, 4.2]);
 *   // { flagged: true, sigma: 2.6, reason: 'today is 2.6σ above 30-day mean' }
 */

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr, m) {
  if (arr.length < 2) return 0;
  const mu = (m === undefined) ? mean(arr) : m;
  const variance = arr.reduce((a, b) => a + (b - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Detect anomaly on the LAST point of a sparkline.
 *
 * @param {number[]} sparkline - daily values (oldest → newest)
 * @param {object} opts
 * @param {number} [opts.threshold=2]   - σ multiplier above which to flag
 * @param {number} [opts.minPoints=7]   - need at least this many points
 * @returns {{ flagged:boolean, sigma:number, reason:string, last:number, mean:number, std:number } | null}
 */
function detectAnomaly(sparkline, opts = {}) {
  if (!Array.isArray(sparkline) || sparkline.length < (opts.minPoints || 7)) return null;
  const threshold = opts.threshold || 2;

  // Sanitize: convert to numbers, drop NaN
  const arr = sparkline.map(v => Number(v) || 0);
  const last = arr[arr.length - 1];

  // Reference set: all points EXCEPT the last (so we judge the last vs prior pattern)
  const ref = arr.slice(0, -1);
  const m = mean(ref);
  const std = stdDev(ref, m);

  if (std === 0) {
    // All historical points equal — only flag if last is different
    if (last !== m) {
      return { flagged: true, sigma: Infinity, reason: `today (${fmt(last)}) breaks a flat history of ${fmt(m)}`, last, mean: m, std: 0 };
    }
    return { flagged: false, sigma: 0, reason: 'flat history', last, mean: m, std: 0 };
  }

  const sigma = (last - m) / std;
  const absSigma = Math.abs(sigma);

  // Special case: if `last` is 0 but history was non-zero, that's a noteworthy
  // dip even if sigma calculation is misleading (could be end-of-day dashboard
  // load with no transactions yet today).
  const allHistoryNonZero = ref.every(v => v > 0);
  if (last === 0 && allHistoryNonZero && m > 0) {
    return { flagged: true, sigma: -Infinity, reason: 'today is zero — no activity recorded', last, mean: m, std };
  }

  if (absSigma >= threshold) {
    const dir = sigma > 0 ? 'above' : 'below';
    return {
      flagged: true,
      sigma,
      reason: `today is ${absSigma.toFixed(1)}σ ${dir} the ${ref.length}-day average`,
      last, mean: m, std
    };
  }

  return { flagged: false, sigma, reason: 'within normal range', last, mean: m, std };
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (Math.abs(n) >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  if (Math.abs(n) >= 1e3) return '₹' + (n / 1e3).toFixed(2) + ' K';
  return String(Math.round(n));
}

module.exports = { detectAnomaly, mean, stdDev };
