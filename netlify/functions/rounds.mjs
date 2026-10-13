// Live SkillSelect data for the Invitation Rounds Tracker.
// Reads the official Home Affairs invitation rounds page on request and returns
// the parts the site shows as JSON. Netlify's CDN caches the response for
// 30 minutes, so Home Affairs is contacted at most a couple of times an hour.

const SOURCE = "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/invitation-rounds";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const decode = (s) => s
  .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&ndash;|&#8211;/g, "–")
  .replace(/[​ ]/g, " ");

// Turn the page into plain lines; table cells are separated by " | ".
export function toText(html) {
  return decode(html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // keep each table row on one line, cells separated by " | "
    .replace(/<tr[\s>][\s\S]*?<\/tr>/gi, (row) => " " + row.replace(/<\/(td|th)>/gi, " | ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() + "\n")
    .replace(/<\/(tr|p|h\d|li|div)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

const toISO = (d) => {
  const m = d && d.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  if (!m) return null;
  const mi = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  return mi < 0 ? null : `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};
const cells = (line) => line.split("|").map((c) => c.trim()).filter((c) => c !== "");
const num = (c) => (c === undefined ? null : /^<\s*5$/.test(c) ? "<5" : /^[\d,]+$/.test(c) ? Number(c.replace(/,/g, "")) : c);

export function parse(html) {
  const lines = toText(html);
  const all = lines.join("\n");
  const out = { nextRound: null, current: null, programYear: null, states: null };

  // Next round: "will be held on 15 October 2026" or "is expected to be held by 30 September 2026"
  const nr = all.match(/next invitation round for the Skilled Independent \(subclass 189\) visa (will be held on|is expected to be held by|is expected to be held on|will be held by) (\d{1,2} [A-Za-z]+ \d{4})/i);
  if (nr) out.nextRound = { date: toISO(nr[2]), label: nr[2], firm: /will be held on|expected to be held on/i.test(nr[1]), wording: nr[0] };

  // Current round summary
  const ci = lines.findIndex((l) => /^Invitations issued on \d{1,2} [A-Za-z]+ \d{4}$/.test(l));
  if (ci >= 0) {
    const label = lines[ci].replace("Invitations issued on ", "");
    const cur = { date: toISO(label), label, invited189: null, invited491: null, tieBreak189: null, occupations: [] };
    for (let i = ci + 1; i < Math.min(ci + 15, lines.length); i++) {
      const c = cells(lines[i]);
      if (/^Skilled Independent visa \(subclass 189\)$/.test(c[0]) && c.length >= 2) { cur.invited189 = num(c[1]); cur.tieBreak189 = c[2] || null; }
      if (/^Skilled Work Regional.*Family Sponsored$/.test(c[0]) && c.length >= 2) { cur.invited491 = num(c[1]); }
    }
    // Occupation table follows "Invitations issued by occupation and minimum score invited"
    const oi = lines.findIndex((l, i) => i > ci && /^Invitations issued by occupation/i.test(l));
    if (oi >= 0) {
      for (let i = oi + 1; i < lines.length; i++) {
        if (/Results could indicate|^Total invitations issued/i.test(lines[i])) break;
        const c = cells(lines[i]);
        if (c.length >= 2 && /^\d{2,3}$/.test(c[c.length - 1]) && !/^Occupation/i.test(c[0])) {
          cur.occupations.push({ n: c[0].replace(/\s*\*$/, ""), p: Number(c[c.length - 1]) });
        }
      }
    }
    out.current = cur;
  }

  // Invitations per month in the current program year
  const pi = lines.findIndex((l) => /^Total invitations issued during \d{4}-\d{2} program year$/i.test(l));
  if (pi >= 0) {
    const py = { label: lines[pi].match(/\d{4}-\d{2}/)[0], months: [], s189: null, f491: null };
    for (let i = pi + 1; i < Math.min(pi + 10, lines.length); i++) {
      const c = cells(lines[i]);
      if (c[0] === "Visa subclass" && !py.months.length) py.months = c.slice(1);
      else if (/^Skilled Independent visa \(subclass 189\)$/.test(c[0])) py.s189 = c.slice(1).map(num);
      else if (/^Skilled Work Regional.*Family Sponsored$/.test(c[0])) py.f491 = c.slice(1).map(num);
    }
    const sum = (a) => (a || []).reduce((t, v) => t + (typeof v === "number" ? v : 0), 0);
    py.total189 = sum(py.s189); py.total491 = sum(py.f491);
    out.programYear = py;
  }

  // State and territory nominations so far this program year
  const si = lines.findIndex((l) => /received nominations from state and territory governments from/i.test(l));
  if (si >= 0) {
    const per = lines[si].match(/from (\d{1,2} [A-Za-z]+ \d{4}) to (\d{1,2} [A-Za-z]+ \d{4})/);
    const st = { from: per && per[1], to: per && per[2], cols: [], s190: {}, s491: {} };
    for (let i = si + 1; i < Math.min(si + 10, lines.length); i++) {
      const c = cells(lines[i]);
      if (c[0] === "Visa subclass") st.cols = c.slice(1);
      else if (/^Skilled Nominated visa \(subclass 190\)$/.test(c[0])) st.cols.forEach((k, j) => (st.s190[k] = num(c[j + 1])));
      else if (/^Skilled Work Regional.*State and Territory Nominated$/i.test(c[0])) st.cols.forEach((k, j) => (st.s491[k] = num(c[j + 1])));
    }
    out.states = st;
  }
  return out;
}

export default async () => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=0, must-revalidate",
  };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(SOURCE, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "en-AU,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        "upgrade-insecure-requests": "1",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
      },
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`Home Affairs responded ${res.status}`);
    const data = parse(await res.text());
    const ok = !!(data.current && data.current.date && data.current.occupations.length >= 20);
    return new Response(JSON.stringify({ ok, fetchedAt: new Date().toISOString(), source: SOURCE, ...data }), {
      headers: { ...headers, "netlify-cdn-cache-control": ok ? "public, durable, s-maxage=1800, stale-while-revalidate=86400" : "public, s-maxage=300" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err && err.message || err), fetchedAt: new Date().toISOString(), source: SOURCE }), {
      status: 502,
      headers: { ...headers, "netlify-cdn-cache-control": "public, s-maxage=120" },
    });
  }
};

export const config = { path: "/api/rounds" };
