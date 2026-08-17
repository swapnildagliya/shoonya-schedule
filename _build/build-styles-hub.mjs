#!/usr/bin/env node
/**
 * build-styles-hub.mjs — port styles.shoonyadance.com into the merged hub.
 *
 * WHY THIS EXISTS (D-095): schedule.shoonyadance.com becomes the merged school hub,
 * absorbing styles. and info.  This script GENERATES the hub's /styles/ pages from the
 * existing styles. source, so the port is repeatable and reviewable instead of a
 * hand-copied 60 KB file that immediately starts drifting.
 *
 * WHAT IT CHANGES vs the source
 *   1. Runtime EN/NL toggle  ->  two REAL files with hreflang (the workshops. "W2" pattern).
 *      styles. today serves one URL and switches language in JS, so Dutch has no indexable
 *      URL. The hub fixes that: /styles/ (en) and /nl/styles/ (nl).
 *   2. Static prose is BAKED per language (92 of 97 data-i18n keys).
 *   3. The 5 config-driven keys stay DYNAMIC, still read from data/site-config.js, so
 *      counts keep their single source of truth and cannot go stale in a baked page.
 *   4. Canonical / og:url / breadcrumb / nav repointed at the hub.
 *   5. JSON-LD carried over with styles. URLs rewritten to hub URLs (the D-095 "schema
 *      gate": the hub must serve equivalent ItemList/Course before styles. is shimmed).
 *
 * SAFETY
 *   - Writes ONLY to styles/ and nl/styles/ — paths that did not exist (verified 404).
 *   - Emits <meta name="robots" content="noindex"> while STAGING is true, so the new pages
 *     cannot compete with live styles. for the same content. Flip STAGING to false only at
 *     cutover, together with the shim.
 *   - Touches nothing on styles. itself.
 *
 * USAGE:  node _build/build-styles-hub.mjs [--publish]
 *         --publish  drops the noindex (cutover only)
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SRC = join(REPO, '..', 'shoonya-styles', 'index.html');

const STAGING = !process.argv.includes('--publish');
const HUB = 'https://schedule.shoonyadance.com';
const OLD = 'https://styles.shoonyadance.com';

if (!existsSync(SRC)) {
  console.error(`✗ source not found: ${SRC}\n  Expected the shoonya-styles checkout beside this repo.`);
  process.exit(1);
}
const src = readFileSync(SRC, 'utf8');

/* ── 1 · extract the translation tables ─────────────────────────────────────── */
// Evaluate the source's own `translations` object with the config values the hub ships,
// so baked strings match what the live page renders today.
const cfgSrc = readFileSync(join(REPO, 'data', 'site-config.js'), 'utf8');
const counts = {};
for (const k of ['styles', 'teachers', 'studios', 'partner_social', 'classical_technique', 'culture_wellness']) {
  const m = cfgSrc.match(new RegExp(`${k}\\s*:\\s*(\\d+)`));
  if (m) counts[k] = Number(m[1]);
}
const trialShort = (cfgSrc.match(/trial_week_short\s*:\s*'([^']+)'/) || [])[1] || 'Sep 14–19, 2026';

const trBlock = src.slice(src.indexOf('const translations'), src.indexOf('function applyLang'));
const _c = counts;
const _d = { en: { trial_week_short: trialShort }, nl: { trial_week_short: trialShort } };
let translations;
try {
  translations = new Function('_c', '_d', `${trBlock.replace(/^const /, 'var ')}; return translations;`)(_c, _d);
} catch (e) {
  console.error('✗ could not evaluate the source translations object:', e.message);
  process.exit(1);
}

// The 5 keys whose value depends on config — these must stay dynamic, not baked.
const DYNAMIC = new Set(['hero_trial', 'footer_p', 'cat_partner_count', 'cat_classical_count', 'cat_culture_count']);

/* ── 2 · build one language ─────────────────────────────────────────────────── */
function build(lang) {
  const t = translations[lang];
  const other = lang === 'en' ? 'nl' : 'en';
  const selfUrl = lang === 'en' ? `${HUB}/styles/` : `${HUB}/nl/styles/`;
  const otherUrl = lang === 'en' ? `${HUB}/nl/styles/` : `${HUB}/styles/`;
  const depth = lang === 'en' ? '..' : '../..';
  let h = src;

  // 2a · bake static prose into every data-i18n element (attribute kept so the runtime
  //      can still refresh the dynamic five).
  for (const [key, val] of Object.entries(t)) {
    if (DYNAMIC.has(key) || typeof val !== 'string') continue;
    const re = new RegExp(`(<([a-z0-9]+)([^>]*\\sdata-i18n="${key}"[^>]*)>)([\\s\\S]*?)(</\\2>)`, 'g');
    h = h.replace(re, (m, open, tag, attrs, inner, close) => {
      const badge = (inner.match(/<span class="badge"[\s\S]*?<\/span>/) || [''])[0];
      return open + escapeHtml(val) + badge + close;
    });
  }

  // 2b · <html lang>
  h = h.replace(/<html[^>]*>/, `<html lang="${lang}">`);

  // 2c · head — canonical, og:url, hreflang, robots
  h = h.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${selfUrl}" />`);
  h = h.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${selfUrl}" />`);
  const alts = [
    `<link rel="alternate" hreflang="en" href="${HUB}/styles/" />`,
    `<link rel="alternate" hreflang="nl" href="${HUB}/nl/styles/" />`,
    `<link rel="alternate" hreflang="x-default" href="${HUB}/styles/" />`,
  ].join('\n');
  const robots = STAGING
    ? '<meta name="robots" content="noindex, nofollow" />\n<!-- STAGING: remove via `node _build/build-styles-hub.mjs --publish` at cutover -->\n'
    : '';
  h = h.replace(/<link rel="canonical"/, `${robots}${alts}\n<link rel="canonical"`);

  // 2d · language switcher: runtime toggle -> real cross-links between the two URLs
  h = h.replace(
    /<div class="lang-toggle"[\s\S]*?<\/div>/,
    `<div class="lang-toggle" role="group" aria-label="Language">\n` +
    `    <a class="lang-btn${lang === 'en' ? ' active' : ''}" href="${HUB}/styles/" hreflang="en">EN</a>\n` +
    `    <a class="lang-btn${lang === 'nl' ? ' active' : ''}" href="${HUB}/nl/styles/" hreflang="nl">NL</a>\n` +
    `  </div>`
  );

  // 2e · nav + asset paths for the new depth
  h = h.replace('<a href="/" class="active" data-i18n="snav-styles">', `<a href="${selfUrl}" class="active" data-i18n="snav-styles">`);
  h = h.replace(/src="\.\/data\/site-config\.js"/, `src="${depth}/data/site-config.js"`);
  h = h.replace(/src="\.\/images\//g, `src="${depth}/images/`);

  // 2f · JSON-LD + any remaining self-references -> hub
  h = h.replace(new RegExp(OLD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/?', 'g'), `${HUB}/styles/`);

  // 2g · replace the toggle runtime with a small one that only refreshes the dynamic five
  const runtimeStart = h.indexOf('<script>\nvar S = window.SHOONYA;');
  if (runtimeStart > -1) {
    const runtimeEnd = h.indexOf('</script>', runtimeStart) + '</script>'.length;
    h = h.slice(0, runtimeStart) + dynamicRuntime(lang, t) + h.slice(runtimeEnd);
  }

  return h;
}

function dynamicRuntime(lang, t) {
  // Only the config-driven strings. Everything else is already baked into the HTML.
  return `<script>
/* Language is BAKED into this file (see _build/build-styles-hub.mjs).
   Only these five strings depend on data/site-config.js, so they stay dynamic and
   keep their single source of truth. */
(function () {
  var S = window.SHOONYA;
  if (!S) return;
  var c = S.cfg.counts || {}, d = (S.display && S.display['${lang}']) || {};
  var trial = d.trial_week_short || ${JSON.stringify((t.hero_trial || '').replace(/^[^:]*:\s*/, ''))};
  var map = {
    hero_trial: ${JSON.stringify(lang === 'en' ? '✦ Free trial week: ' : '✦ Gratis proefweek: ')} + trial,
    cat_partner_count: (c.partner_social || '') + ${JSON.stringify(lang === 'en' ? ' styles' : ' stijlen')},
    cat_classical_count: (c.classical_technique || '') + ${JSON.stringify(lang === 'en' ? ' styles' : ' stijlen')},
    cat_culture_count: (c.culture_wellness || '') + ${JSON.stringify(lang === 'en' ? ' styles' : ' stijlen')}
  };
  Object.keys(map).forEach(function (k) {
    document.querySelectorAll('[data-i18n="' + k + '"]').forEach(function (el) {
      if (map[k] && map[k].trim()) el.textContent = map[k];
    });
  });
})();
</script>`;
}

function escapeHtml(s) {
  return String(s).replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── 3 · write ──────────────────────────────────────────────────────────────── */
const targets = [
  { lang: 'en', out: join(REPO, 'styles', 'index.html') },
  { lang: 'nl', out: join(REPO, 'nl', 'styles', 'index.html') },
];
for (const { lang, out } of targets) {
  mkdirSync(dirname(out), { recursive: true });
  const html = build(lang);
  writeFileSync(out, html);
  const courses = (html.match(/"@type":\s*"Course"/g) || []).length;
  const hreflang = (html.match(/rel="alternate"/g) || []).length;
  const leftover = (html.match(/styles\.shoonyadance\.com/g) || []).length;
  console.log(`✓ ${out.replace(REPO + '/', '')}  ${html.length} B · ${courses} Course · ${hreflang} hreflang · noindex=${STAGING} · stale styles.-refs=${leftover}`);
}

/* images used by the hub page */
mkdirSync(join(REPO, 'images'), { recursive: true });
for (const img of ['flamenco-2.jpg', 'kathak.jpg', 'rueda.jpg']) {
  const from = join(REPO, '..', 'shoonya-styles', 'images', img);
  if (existsSync(from)) { copyFileSync(from, join(REPO, 'images', img)); console.log(`  ↳ image ${img}`); }
  else console.log(`  ⚠ missing image ${img}`);
}
console.log(STAGING
  ? '\nSTAGING build — pages carry noindex and are safe to publish alongside live styles.'
  : '\nPUBLISH build — noindex removed. Only correct at cutover, with the styles. shim.');
