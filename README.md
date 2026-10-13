# Invitation Rounds Tracker

Live site: https://au-invitation-rounds.netlify.app

Dashboard of Australian SkillSelect invitation rounds, occupation cut-offs, 2026–27 planning levels, state nomination status and Home Affairs updates.

- `index.html` is the whole site (no build step).
- `netlify/functions/rounds.mjs` serves `/api/rounds`: it reads the official
  [Home Affairs SkillSelect page](https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/invitation-rounds)
  and returns the next round date, latest round results, occupation cut-offs and
  state nomination counts as JSON. Netlify caches it for 30 minutes. When someone
  opens the site, the page loads this and updates itself; if Home Affairs can't be
  reached, the saved data in `index.html` stays on screen.
- Netlify redeploys automatically on every push to `main`.
- News, state program status and saved data are refreshed every Monday morning (Brisbane time).

General information only, not migration advice.
