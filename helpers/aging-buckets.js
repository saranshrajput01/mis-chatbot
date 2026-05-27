// ────────────────────────────────────────────────────────────────────────────
// AGING BUCKETS — pure, dependency-free
//
// Sliders rows of {amount, date} into outstanding-aging buckets:
//   0-30  31-60  61-90  90+
//
// Used by /api/page/outstanding to summarise unpaid invoices by age. Pure
// function (no DB / no I/O), so it's trivially unit-testable.
// ────────────────────────────────────────────────────────────────────────────
'use strict';

const BUCKETS = ['0-30', '31-60', '61-90', '90+'];

/**
 * Classify a single age (in days) into a bucket label.
 * @param {number} days — age in days (positive = past, 0 = today)
 * @returns {string} one of '0-30', '31-60', '61-90', '90+'
 */
function bucketOf(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d < 0) return '0-30';
  if (d <= 30) return '0-30';
  if (d <= 60) return '31-60';
  if (d <= 90) return '61-90';
  return '90+';
}

/**
 * Compute aging summary across an array of rows.
 *
 * @param {Array<{amount: number|string, date: string|Date}>} rows
 * @param {string|Date} [asOf] — reference date (default: today)
 * @returns {{
 *   buckets:   {'0-30': number, '31-60': number, '61-90': number, '90+': number},
 *   counts:    {'0-30': number, '31-60': number, '61-90': number, '90+': number},
 *   total:     number,
 *   totalCount: number,
 *   asOf:      string,    // ISO YYYY-MM-DD
 *   oldest:    {age: number, amount: number, party: string|null} | null
 * }}
 */
function computeAging(rows, asOf) {
  const refDate = asOf ? new Date(asOf) : new Date();
  const refMs = refDate.getTime();
  const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const counts  = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  let total = 0;
  let totalCount = 0;
  let oldest = null;

  for (const r of rows || []) {
    const amount = Number(r.amount) || 0;
    if (amount <= 0) continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    if (isNaN(d.getTime())) continue;
    const ageDays = Math.floor((refMs - d.getTime()) / 86_400_000);
    const b = bucketOf(ageDays);
    buckets[b] += amount;
    counts[b] += 1;
    total += amount;
    totalCount += 1;
    if (!oldest || ageDays > oldest.age) {
      oldest = { age: ageDays, amount, party: r.party || null };
    }
  }

  // Round bucket sums to 2 dp for cleaner display
  for (const k of BUCKETS) buckets[k] = Math.round(buckets[k] * 100) / 100;

  return {
    buckets,
    counts,
    total: Math.round(total * 100) / 100,
    totalCount,
    asOf: refDate.toISOString().slice(0, 10),
    oldest
  };
}

/**
 * Group rows by party with their total outstanding + bucket distribution.
 * Useful for the "Top Defaulters" view.
 *
 * @param {Array<{amount, date, party}>} rows
 * @param {string|Date} [asOf]
 * @param {number} [limit=10]
 * @returns {Array<{party, total, count, oldest_age, buckets}>}
 *   sorted by total DESC
 */
function topDefaulters(rows, asOf, limit = 10) {
  const refMs = (asOf ? new Date(asOf) : new Date()).getTime();
  const byParty = new Map();

  for (const r of rows || []) {
    const amount = Number(r.amount) || 0;
    if (amount <= 0) continue;
    const party = String(r.party || '').trim();
    if (!party || party === 'NA') continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    if (isNaN(d.getTime())) continue;
    const ageDays = Math.floor((refMs - d.getTime()) / 86_400_000);

    if (!byParty.has(party)) {
      byParty.set(party, {
        party,
        total: 0,
        count: 0,
        oldest_age: 0,
        buckets: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
      });
    }
    const e = byParty.get(party);
    e.total += amount;
    e.count += 1;
    if (ageDays > e.oldest_age) e.oldest_age = ageDays;
    e.buckets[bucketOf(ageDays)] += amount;
  }

  return Array.from(byParty.values())
    .map(e => ({
      ...e,
      total: Math.round(e.total * 100) / 100,
      buckets: Object.fromEntries(
        Object.entries(e.buckets).map(([k, v]) => [k, Math.round(v * 100) / 100])
      )
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

module.exports = {
  bucketOf,
  computeAging,
  topDefaulters,
  BUCKETS
};
