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

// The 5 config-driven keys. They ARE baked (with the real config values, in the right
// language) so the pre-JS HTML that crawlers read is correct and localised — and they are
// ALSO refreshed at runtime from data/site-config.js so the count stays single-sourced.
//
// Baking them was not optional: skipping it left the source's own markup in place, which
// meant (a) the stale `|| 7` fallback for classical_technique shipped as "7 styles" when
// canonical is 8, and (b) the Dutch page showed English in all five slots. Both were caught
// by rendering the built page, not by reading the build output.
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
    if (typeof val !== 'string') continue;
    const re = new RegExp(`(<([a-z0-9]+)([^>]*\\sdata-i18n="${key}"[^>]*)>)([\\s\\S]*?)(</\\2>)`, 'g');
    h = h.replace(re, (m, open, tag, attrs, inner, close) => {
      const badge = (inner.match(/<span class="badge"[\s\S]*?<\/span>/) || [''])[0];
      return open + escapeHtml(val) + badge + close;
    });
  }

  // 2b · <html lang>
  h = h.replace(/<html[^>]*>/, `<html lang="${lang}">`);

  // 2b2 · head metadata must be in the page's language.
  //   The source's runtime toggle never touched <head>, so styles. serves an ENGLISH title,
  //   description and og:* even when displaying Dutch. That is precisely why a JS toggle
  //   cannot deliver Dutch SEO — the title tag is the single strongest on-page signal.
  //   We reuse the page's OWN approved Dutch strings (hero h1 + hero paragraph) rather than
  //   authoring new marketing copy.
  if (lang === 'nl') {
    const nlTitle = `${t.hero_h1} — Shoonya Dance Centre Gent`;   // "Gent" in Dutch, "Ghent" in English
    const nlDesc = t.hero_p;
    h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(nlTitle)}</title>`);
    h = h.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeHtml(nlDesc)}$2`);
    h = h.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeHtml(nlTitle)}$2`);
    h = h.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeHtml(nlDesc)}$2`);
    h = h.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeHtml(nlTitle)}$2`);
    h = h.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeHtml(nlDesc)}$2`);
    h = h.replace(/(<meta property="og:locale" content=")[^"]*(")/, `$1nl_BE$2`);
  }

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

  // 2e2 · info. links -> the hub's own /new/ page. The hub must be self-contained before
  //       cutover: once info. becomes a shim, a hub page linking to info. would bounce the
  //       visitor back through a redirect for content the hub already hosts.
  h = h.replace(/https:\/\/info\.shoonyadance\.com\/?/g, lang === 'en' ? `${HUB}/new/` : `${HUB}/nl/new/`);

  // 2e · nav + asset paths for the new depth
  h = h.replace('<a href="/" class="active" data-i18n="snav-styles">', `<a href="${selfUrl}" class="active" data-i18n="snav-styles">`);
  h = h.replace(/src="\.\/data\/site-config\.js"/, `src="${depth}/data/site-config.js"`);
  h = h.replace(/src="\.\/images\//g, `src="${depth}/images/`);

  // 2f · JSON-LD + any remaining self-references -> hub
  h = h.replace(new RegExp(OLD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/?', 'g'), `${HUB}/styles/`);

  // 2f2 · JSON-LD repairs. Three defects, all inherited from styles. and made WORSE by the
  //       blanket host rewrite above:
  //   (a) Course.url pointed at category stubs (/partner-social/ etc). Those existed on
  //       styles.; on the hub they 404, so the rewrite produced 25 DEAD schema URLs.
  //       Each Course's real home is its own www style page - and the page already lists
  //       them, one per card. Map name -> card href.
  //   (b) inLanguage was "nl" on 24 of 25 Courses regardless of page language.
  //   (c) On the NL page the ItemList name/description and addressLocality stayed English.
  {
    // Build the name->href map from the SOURCE, not the baked output: Course.name is
    // English in both files, but the NL page's card headings are Dutch, so matching against
    // the baked page failed for 10 of 25 NL Courses.
    const cards = [...src.matchAll(/<a class="strip" href="([^"]+)"[\s\S]{0,240}?<h3[^>]*>([^<]+)/g)];
    // decode entities before normalising: the card reads "Dance &amp; Fit" while the
    // Course name reads "Dance & Fit", which otherwise never matches.
    const decode = x => x.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
    const norm = x => decode(x).toLowerCase().replace(/[^a-z0-9]/g, '');
    const byName = new Map(cards.map(c => [norm(c[2]), c[1]]));
    // "Contemporary dance" has no card of its own — it is taught on the Professional Morning
    // Training page (Tono Ferriol, ballet + contemporary), the same mapping the schedule
    // page's own JSON-LD uses.
    byName.set(norm('Contemporary dance'), 'https://www.shoonyadance.com/professional-morning-training-gent');

    const ld = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ld) {
      let obj;
      try { obj = JSON.parse(ld[1]); } catch { obj = null; }
      if (obj) {
        const list = (obj['@graph'] || []).find(n => n['@type'] === 'ItemList');
        let unmatched = [];
        if (list) {
          for (const it of list.itemListElement) {
            const c = it.item;
            if (!c || c['@type'] !== 'Course') continue;
            const href = byName.get(norm(c.name || ''));
            if (href) c.url = href; else unmatched.push(c.name);
            c.inLanguage = lang;                                  // (b)
            if (c.provider?.url) c.provider.url = 'https://www.shoonyadance.com';
          }
          if (lang === 'nl') {                                    // (c)
            list.name = 'Dansstijlen bij Shoonya Dance Centre Gent';
            list.description = t.hero_p;
            list.url = selfUrl;
          }
        }
        for (const n of (obj['@graph'] || [])) {
          if (n.address?.addressLocality) n.address.addressLocality = lang === 'nl' ? 'Gent' : 'Ghent';
          if (lang === 'nl' && typeof n.description === 'string' && /\bGhent\b/.test(n.description)) {
            n.description = n.description.replace(/\bGhent\b/g, 'Gent');
          }
        }
        if (unmatched.length) console.error(`  ⚠ ${lang}: ${unmatched.length} Course(s) had no matching card: ${unmatched.join(', ')}`);
        h = h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,
          '<script type="application/ld+json">\n' + JSON.stringify(obj, null, 2) + '\n</script>');
      }
    }
  }

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
  var unit = ${JSON.stringify(lang === 'en' ? ' styles' : ' stijlen')};
  var map = {
    hero_trial: ${JSON.stringify(t.hero_trial.replace(/:.*$/, ': '))} + trial,
    cat_partner_count: c.partner_social ? c.partner_social + unit : '',
    cat_classical_count: c.classical_technique ? c.classical_technique + unit : '',
    cat_culture_count: c.culture_wellness ? c.culture_wellness + unit : ''
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
