// Base44 caps a single list() page at 500 rows regardless of the limit passed.
// Asking for 2000 or 5000 does not error, it just silently returns the newest
// 500, so any total computed from the result is quietly wrong. AdSpend is the
// worst affected: at three levels (account, campaign, ad) across 39 enabled ad
// accounts with daily rows, 500 rows is only a few days of data.
//
// Page until a short page comes back. list() also returns null rather than []
// for an empty entity, so coalesce.
//
// Usage:
//   const spend = await fetchAll((limit, skip) =>
//     base44.entities.AdSpend.list('-date', limit, skip));

export const PAGE = 500;

export async function fetchAll(fn, { page = PAGE, maxPages = 200 } = {}) {
  const all = [];
  for (let i = 0; i < maxPages; i += 1) {
    const batch = (await fn(page, i * page)) || [];
    all.push(...batch);
    if (batch.length < page) return all;
  }
  // Guard against an unbounded loop if a caller's fn never returns a short
  // page. Returning what we have is better than hanging the query.
  return all;
}

export default fetchAll;
