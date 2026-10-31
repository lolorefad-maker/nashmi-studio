// Business KPIs derived from monthly metric rows (sorted oldest → newest).

const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const pct = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
const round = (n, d = 1) => (n == null || !Number.isFinite(n) ? null : +n.toFixed(d));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function computeKpis(rows) {
  if (!rows.length) return null;
  const last = rows.at(-1);
  const prev = rows.at(-2);
  const last3 = rows.slice(-3);
  const prev3 = rows.slice(-6, -3);

  const revenue = last.revenue;
  const profit = last.revenue - last.expenses;
  const margin = revenue ? (profit / revenue) * 100 : 0;
  const aov = last.orders ? last.revenue / last.orders : 0;
  const cac = last.new_customers ? last.marketing_spend / last.new_customers : null;
  const roas = last.marketing_spend ? last.revenue / last.marketing_spend : null;

  const revGrowth = prev ? pct(last.revenue, prev.revenue) : null;
  const quarterGrowth = prev3.length === 3 ? pct(sum(last3, 'revenue'), sum(prev3, 'revenue')) : null;
  const followerGrowth = prev ? pct(last.followers, prev.followers) : null;
  const customerGrowth = prev ? pct(last.new_customers, prev.new_customers) : null;

  // Health score 0–100: profitability, growth, marketing efficiency, audience.
  const score = Math.round(
    clamp(margin, 0, 30) / 30 * 30 +
    clamp((quarterGrowth ?? revGrowth ?? 0) + 5, 0, 25) / 25 * 25 +
    clamp(roas ?? 0, 0, 10) / 10 * 20 +
    clamp((followerGrowth ?? 0) * 2, 0, 15) +
    clamp(last.engagement_rate, 0, 5) / 5 * 10,
  );

  return {
    period: last.period,
    revenue: round(revenue, 0),
    expenses: round(last.expenses, 0),
    profit: round(profit, 0),
    margin: round(margin),
    orders: last.orders,
    aov: round(aov, 2),
    newCustomers: last.new_customers,
    cac: round(cac, 2),
    roas: round(roas, 2),
    followers: last.followers,
    engagement: round(last.engagement_rate, 2),
    visits: last.website_visits,
    conversion: last.website_visits ? round((last.orders / last.website_visits) * 100, 2) : null,
    revGrowth: round(revGrowth),
    quarterGrowth: round(quarterGrowth),
    followerGrowth: round(followerGrowth),
    customerGrowth: round(customerGrowth),
    totalRevenue12: round(sum(rows.slice(-12), 'revenue'), 0),
    totalProfit12: round(sum(rows.slice(-12), 'revenue') - sum(rows.slice(-12), 'expenses'), 0),
    healthScore: clamp(score, 0, 100),
  };
}
