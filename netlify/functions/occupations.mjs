// Full Home Affairs skilled occupation list for the Invitation Rounds Tracker.
// Calls the same data endpoint the official "Skilled occupation list" page uses
// and returns a compact list. Netlify's CDN caches it for 12 hours.

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

export default async (req) => {
  const url = new URL(req.url);
  const out = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, max-age=0, must-revalidate" };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(ENDPOINT, { method: "POST", headers: HEADERS, body: BODY, signal: ctrl.signal });
    clearTimeout(t);
    const text = await res.text();
    // Temporary: show the raw shape so the parser can be written against it.
    if (url.searchParams.has("raw")) {
      return new Response(JSON.stringify({ status: res.status, type: res.headers.get("content-type"), bytes: text.length, head: text.slice(0, 4000) }), { headers: { ...out, "netlify-cdn-cache-control": "no-store" } });
    }
    return new Response(JSON.stringify({ ok: false, error: "parser not ready", status: res.status, bytes: text.length }), { status: 502, headers: { ...out, "netlify-cdn-cache-control": "no-store" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String((err && err.message) || err) }), { status: 502, headers: { ...out, "netlify-cdn-cache-control": "no-store" } });
  }
};

export const config = { path: "/api/occupations" };
