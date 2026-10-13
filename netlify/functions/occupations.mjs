// Full Home Affairs skilled occupation list for the Invitation Rounds Tracker.
// Calls the same data endpoint the official "Skilled occupation list" page uses
// and returns a compact list: name (n), ANZSCO code (c), lists (l), visas (v),
// 491 family-sponsored eligibility (f) and assessing authorities (a).
// Netlify's CDN caches it for 12 hours.

const ORIGIN = "https://immi.homeaffairs.gov.au";
const PAGE = `${ORIGIN}/visas/working-in-australia/skill-occupation-list`;
const ENDPOINT = `${ORIGIN}/_layouts/15/api/Data.aspx/GetSkillOccupation`;
const BODY = JSON.stringify({ webUrl: "/work-in-australia", listname: "Occupations" });

const HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "accept": "application/json, text/plain, */*",
  "accept-language": "en-AU,en;q=0.9",
  "content-type": "application/json; charset=UTF-8",
  "origin": ORIGIN,
  "referer": PAGE,
  "x-requested-with": "XMLHttpRequest",
};

const strip = (h) => String(h || "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Visa codes we care about, matched against the "visas" field (semicolon list).
const VISAS = [
  ["189", /\b189\b/], ["190", /\b190\b/], ["491", /\b491\b/], ["494", /\b494\b/],
  ["482", /\b482\b/], ["186", /\b186\b/], ["485", /\b485\b/], ["407", /\b407\b/],
];

export function normalise(rows) {
  return rows.map((r) => {
    const codes = strip(r.anzscocode);
    const c2013 = codes.match(/ANZSCO 2013[^0-9]*?(\d{6})/);
    const anyCode = codes.match(/\b(\d{6})\b/);
    const visas = String(r.visas || "");
    const auth = [...String(r.assessauth || "").matchAll(/<a[^>]*href='javascript:[^']*'[^>]*>([^<]+)<\/a>/gi)].map((m) => strip(m[1]));
    return {
      n: strip(r.occupation),
      c: (c2013 || anyCode || [])[1] || "",
      l: String(r.list || "").split(/[;,]/).map((x) => x.trim()).filter(Boolean),
      v: VISAS.filter(([, re]) => re.test(visas)).map(([k]) => k),
      f: /491[^;]*Family/i.test(visas),
      a: [...new Set(auth)],
    };
  }).filter((o) => o.n).sort((x, y) => x.n.localeCompare(y.n));
}

export default async (req) => {
  const url = new URL(req.url);
  const out = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, max-age=0, must-revalidate" };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(ENDPOINT, { method: "POST", headers: HEADERS, body: BODY, signal: ctrl.signal });
    clearTimeout(t);
    const text = await res.text();
    if (!res.ok) throw new Error(`Home Affairs responded ${res.status}`);
    if (url.searchParams.has("raw")) {
      return new Response(JSON.stringify({ status: res.status, bytes: text.length, head: text.slice(0, 3000) }), { headers: { ...out, "netlify-cdn-cache-control": "no-store" } });
    }
    const json = JSON.parse(text);
    const rows = (json && json.d && json.d.data) || [];
    const occupations = normalise(rows);
    const ok = occupations.length >= 300;
    return new Response(JSON.stringify({ ok, fetchedAt: new Date().toISOString(), source: PAGE, count: occupations.length, occupations }), {
      status: ok ? 200 : 502,
      headers: { ...out, "netlify-cdn-cache-control": ok ? "public, durable, s-maxage=43200, stale-while-revalidate=604800" : "public, s-maxage=300" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String((err && err.message) || err) }), { status: 502, headers: { ...out, "netlify-cdn-cache-control": "no-store" } });
  }
};

export const config = { path: "/api/occupations" };
