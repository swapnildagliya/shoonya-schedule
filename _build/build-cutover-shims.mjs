#!/usr/bin/env node
/**
 * build-cutover-shims.mjs — hash-preserving redirect shims for the P3 cutover (D-095).
 *
 * ⚠️ STAGED ONLY. Writes to _estate/cutover-shims-<date>/, which is OUTSIDE both Pages
 *    repos, so nothing can deploy by accident. Installing these IS the cutover: the moment
 *    styles./info. redirect, live traffic lands on the hub — so they must not be installed
 *    while the hub is still noindex.
 *
 * WHY A NEW SHIM VARIANT — the estate's existing template is not sufficient here.
 *   Today's stubs (e.g. classes./partner-social/) hardcode their destination anchor, which
 *   works because each stub knows where it goes. These shims replace the ROOT of styles./
 *   info., where the visitor's anchor is unknown — and a URL fragment NEVER reaches the
 *   server. A plain meta-refresh therefore DROPS #partner and dumps the visitor at the top
 *   of the page. 35+ internal links depend on those anchors.
 *   Fix: JS reads location.hash and appends it. Meta-refresh stays as the no-JS fallback
 *   (it cannot carry the fragment — an accepted, documented limitation).
 *
 * LANGUAGE: the pages being replaced were bilingual toggles, so sending every visitor to
 *   the English hub page would be a regression for Dutch users. The shim routes
 *   navigator.language "nl*" to the /nl/ twin. Crawlers follow canonical + meta-refresh to
 *   the English URL, which carries hreflang to the Dutch one.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', '..', 'Claude', 'Projects', '_estate', 'cutover-shims-2026-08-17');
const HUB = 'https://schedule.shoonyadance.com';

// source path -> { en, nl } hub targets. A target may carry its own anchor, in which case
// an incoming hash is NOT appended (the mapping is more specific than the visitor's).
const MAP = {
  'shoonya-styles': {
    '':                      { en: '/styles/',  nl: '/nl/styles/' },
    'partner-social':        { en: '/styles/#partner',   nl: '/nl/styles/#partner' },
    'classical-technique':   { en: '/styles/#classical', nl: '/nl/styles/#classical' },
    'culture-wellness':      { en: '/styles/#culture',   nl: '/nl/styles/#culture' },
  },
  // The three CATEGORY STUBS exist on THREE hosts and all currently point at
  // styles.#anchor. Left alone they would double-hop at cutover (stub -> styles. shim ->
  // hub) and their canonicals would point at a redirect page. Repoint them straight at the
  // hub in the same pass.
  //   ⚠️ shoonya-styles/partner-social uses a RELATIVE /#partner in both its canonical and
  //      its body link, unlike its siblings — a find-and-replace of the absolute pattern
  //      silently misses it. Regenerating the whole file sidesteps that entirely.
  //   ⚠️ schooljaar. (shoonya-website) is a staging shell (D-027) but it is LIVE and serves
  //      its own copies, so it must be in scope or it keeps pointing at a shimmed host.
  'shoonya-classes': {
    'partner-social':      { en: '/styles/#partner',   nl: '/nl/styles/#partner' },
    'classical-technique': { en: '/styles/#classical', nl: '/nl/styles/#classical' },
    'culture-wellness':    { en: '/styles/#culture',   nl: '/nl/styles/#culture' },
  },
  'shoonya-website': {
    'partner-social':      { en: '/styles/#partner',   nl: '/nl/styles/#partner' },
    'classical-technique': { en: '/styles/#classical', nl: '/nl/styles/#classical' },
    'culture-wellness':    { en: '/styles/#culture',   nl: '/nl/styles/#culture' },
  },
  'shoonya-info': {
    '':                        { en: '/new/',      nl: '/nl/new/' },
    'about':                   { en: '/about/',    nl: '/nl/about/' },
    'our-studios':             { en: '/studios/',  nl: '/nl/studios/' },
    'register':                { en: '/register/', nl: '/nl/register/' },
    'who-is-a-shoonya-member': { en: '/register/#membership', nl: '/nl/register/#membership' },
  },
};

function shim(enPath, nlPath) {
  const en = HUB + enPath, nl = HUB + nlPath;
  const targetHasHash = enPath.includes('#');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Redirecting…</title>
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="${en}">
  <script>
  (function () {
    // A URL fragment never reaches the server, so a meta-refresh alone would drop it.
    // Read it here and carry it across. ${targetHasHash ? 'This target has its own anchor, so an incoming hash is ignored.' : 'Any incoming #anchor is preserved.'}
    var nl = (navigator.language || '').toLowerCase().indexOf('nl') === 0;
    var to = nl ? ${JSON.stringify(nl)} : ${JSON.stringify(en)};
    ${targetHasHash ? '' : 'if (location.hash) to += location.hash;'}
    location.replace(to);
  })();
  </script>
  <!-- No-JS fallback. Cannot carry the fragment: a documented limitation, not an oversight. -->
  <meta http-equiv="refresh" content="0; url=${en}">
</head>
<body>
  <p><a href="${en}">Click here if not redirected automatically.</a></p>
</body>
</html>
`;
}

let n = 0;
for (const [repo, paths] of Object.entries(MAP)) {
  for (const [p, t] of Object.entries(paths)) {
    const out = join(OUT, repo, p, 'index.html');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, shim(t.en, t.nl));
    console.log(`  ${repo}/${p || '(root)'}`.padEnd(46) + `-> ${t.en}`);
    n++;
  }
}
console.log(`\n${n} shims written to _estate/cutover-shims-2026-08-17/`);
console.log('⚠️  STAGED ONLY — installing these is the cutover. Do not copy into the Pages');
console.log('    repos until the hub is --publish (noindex removed).');
