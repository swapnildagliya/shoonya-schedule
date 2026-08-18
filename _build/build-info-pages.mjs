#!/usr/bin/env node
/**
 * build-info-pages.mjs — port info.shoonyadance.com into the merged hub (D-095).
 *
 *   info./            "New to Shoonya?"  ->  hub /new/      + /nl/new/
 *   info./about/      About              ->  hub /about/    + /nl/about/
 *   info./our-studios Our Studios        ->  hub /studios/  + /nl/studios/
 *
 * SOURCE MECHANISM differs from styles.: info. ships BOTH languages in the DOM as
 * paired <span|p|h3 data-lang="en|nl"> elements toggled by setLang(). So the port is a
 * SPLIT, not a bake — each output keeps one language's elements and drops the other's.
 * That is what turns one bilingual URL into two indexable single-language URLs.
 *
 * WHY REMOVAL, NOT HIDING: leaving the other language in the DOM behind display:none
 * would give each URL two languages of body copy and halve its search value. The whole
 * point of /nl/ is a page that is unambiguously Dutch.
 *
 * SAFETY
 *   - Writes only to new/, about/, studios/ and their /nl/ twins — all verified 404.
 *   - noindex while STAGING, so nothing competes with live info.
 *   - info. itself is untouched.
 *   - Reports any internal link it could not map, so no page ships a silent 404.
 *
 * USAGE: node _build/build-info-pages.mjs [--publish]
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyNlA11y, remainingEnglish } from './nl-a11y-strings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SRCREPO = join(REPO, '..', 'shoonya-info');
const STAGING = !process.argv.includes('--publish');
const HUB = 'https://schedule.shoonyadance.com';

const PAGES = [
  { src: 'index.html', slug: 'new' },
  { src: 'about/index.html', slug: 'about' },
  { src: 'our-studios/index.html', slug: 'studios' },
  { src: 'register/index.html', slug: 'register' },
];

/* Internal links on info. are root-absolute and must be remapped to hub paths, in the
   right language. Anything unmapped is reported rather than silently shipped. */
function linkMap(lang) {
  const p = lang === 'en' ? '' : '/nl';
  return {
    '/about/': `${p}/about/`,
    '/our-studios/': `${p}/studios/`,
    // The hub now HAS its own /register/ (the registration-intent hub: Shoonya ID band,
    // route cards, FAQ - all via /go/ shims). www/register stays the Squarespace conversion
    // page; the two are cross-linked rather than duplicated.
    '/register/': `${p}/register/`,
    '/who-is-a-shoonya-member/': `${p}/register/#membership`,
  };
}

/* ── remove every element carrying data-lang="<drop>", tracking nesting depth ─────
   A non-greedy regex breaks the moment a same-tag element nests inside one of these
   (e.g. a <span> inside a <span data-lang>). This scanner walks the tag stack instead. */
function stripLang(html, drop) {
  const open = new RegExp(`<([a-z0-9]+)([^>]*\\sdata-lang="${drop}"[^>]*)>`, 'i');
  let out = html, guard = 0;
  for (;;) {
    if (++guard > 5000) throw new Error('stripLang: runaway loop');
    const m = open.exec(out);
    if (!m) break;
    const tag = m[1];
    const bodyStart = m.index + m[0].length;
    const tagRe = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'gi');
    tagRe.lastIndex = bodyStart;
    let depth = 1, end = -1, t;
    while ((t = tagRe.exec(out))) {
      if (t[0][1] === '/') { if (--depth === 0) { end = t.index + t[0].length; break; } }
      else if (!t[0].endsWith('/>')) depth++;
    }
    if (end < 0) throw new Error(`stripLang: unbalanced <${tag}> near index ${m.index}`);
    out = out.slice(0, m.index) + out.slice(end);
  }
  return out;
}

function esc(s) { return String(s).replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* ── fold who-is-a-shoonya-member INTO /register/ as a #membership section ────────
   Decision (Swapnil, 2026-08-17): the member page is small and ORPHANED — nothing on
   the estate links to it, not even info.'s own nav. Its content IS the membership
   condition, and D-094 permits publishing a member price only WITH that condition
   stated, so hosting it on the register page makes that compliance natural. Its own
   CTA already said "Register now".

   The old URL becomes a shim to /register/#membership at cutover — hence the id.
   The source page's CTA band is dropped: redundant once the content lives on /register/.
   Its 8 CSS classes were verified unused in register/, so they carry over unscoped. */
function membershipSection(lang) {
  const src = join(SRCREPO, 'who-is-a-shoonya-member', 'index.html');
  if (!existsSync(src)) return { html: '', css: '' };
  let m = readFileSync(src, 'utf8');
  m = stripLang(m, lang === 'en' ? 'nl' : 'en');

  // content: <div class="page"> … </div>, depth-tracked (the CTA band sits AFTER it)
  const openIdx = m.search(/<div class="page">/);
  if (openIdx < 0) return { html: '', css: '' };
  const tagRe = /<div\b[^>]*>|<\/div>/gi;
  tagRe.lastIndex = openIdx;
  let depth = 0, end = -1, t;
  while ((t = tagRe.exec(m))) {
    if (t[0][1] === '/') { if (--depth === 0) { end = t.index + t[0].length; break; } }
    else depth++;
  }
  if (end < 0) return { html: '', css: '' };
  const inner = m.slice(openIdx, end);

  // carry only the CSS rules those blocks need
  const want = ['page', 'kicker', 'page-h1', 'def-box', 'content-section', 'section-h3', 'note-box', 'note-label'];
  const css = (m.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1]
    .split('\n')
    .filter(l => want.some(c => new RegExp('^\\s*\\.' + c + '[\\s,{:]').test(l)))
    .join('\n');

  // The source page is standalone, so its heading is an <h1>. Folded into /register/ —
  // which already has its own <h1> — that would give the page two h1s and a broken
  // heading hierarchy. Demote to <h2> and give it the id that aria-labelledby targets.
  const demoted = inner
    .replace(/<h1 class="page-h1">/, '<h2 class="page-h1" id="membership-h">')
    .replace(/<\/h1>/, '</h2>');

  return {
    html: `\n  <section id="membership" aria-labelledby="membership-h">\n${demoted}\n  </section>\n`,
    css: `\n/* folded from who-is-a-shoonya-member (D-095) */\n${css}\n`,
  };
}

function build(page, lang) {
  const srcPath = join(SRCREPO, page.src);
  let h = readFileSync(srcPath, 'utf8');
  const drop = lang === 'en' ? 'nl' : 'en';
  const selfUrl = lang === 'en' ? `${HUB}/${page.slug}/` : `${HUB}/nl/${page.slug}/`;
  const enUrl = `${HUB}/${page.slug}/`, nlUrl = `${HUB}/nl/${page.slug}/`;

  // Capture the kept language's HERO HEADING before stripping, for the NL <title>.
  //  Must scope to the <h1>: the first data-lang element on the page is the "Skip to
  //  content" link, which produced the title "Naar inhoud — Shoonya Dance Centre, Gent".
  //  Caught by looking at the rendered tab title, not by any build check.
  let keptH1 = '';
  const h1Block = h.match(/<h1[^>]*>[\s\S]*?<\/h1>/i);
  if (h1Block) {
    const inner = h1Block[0].match(new RegExp(`data-lang="${lang}"[^>]*>([\\s\\S]*?)</`, 'i'));
    if (inner) keptH1 = inner[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    // headings split across two spans (e.g. "Where every body" + "dances") — join them
    const allParts = [...h1Block[0].matchAll(new RegExp(`data-lang="${lang}"[^>]*>([\\s\\S]*?)</span>`, 'gi'))]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (allParts.length > 1) keptH1 = allParts.join(' ');
  }

  h = stripLang(h, drop);
  h = h.replace(/<html[^>]*>/, `<html lang="${lang}">`);

  // head: canonical, hreflang, robots, and Dutch metadata for the Dutch page
  const alts = [
    `<link rel="alternate" hreflang="en" href="${enUrl}" />`,
    `<link rel="alternate" hreflang="nl" href="${nlUrl}" />`,
    `<link rel="alternate" hreflang="x-default" href="${enUrl}" />`,
  ].join('\n');
  const robots = STAGING ? '<meta name="robots" content="noindex, nofollow" />\n' : '';
  if (/<link rel="canonical"/.test(h)) h = h.replace(/<link rel="canonical"[^>]*>/, `${robots}${alts}\n<link rel="canonical" href="${selfUrl}" />`);
  else h = h.replace(/<\/title>/, `</title>\n${robots}${alts}\n<link rel="canonical" href="${selfUrl}" />`);
  h = h.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${selfUrl}$2`);

  if (lang === 'nl') {
    // Reuse the page's OWN Dutch heading rather than authoring new copy. The source's
    // toggle never touched <head>, so info. serves an English title even in Dutch.
    const nlTitle = keptH1 ? `${keptH1.trim()} — Shoonya Dance Centre, Gent` : null;
    if (nlTitle) {
      h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(nlTitle)}</title>`);
      h = h.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(nlTitle)}$2`);
      h = h.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(nlTitle)}$2`);
    }
    h = h.replace(/(<meta property="og:locale" content=")[^"]*(")/, `$1nl_BE$2`);

    // Dutch meta/og description. The source's toggle never touched <head>, so every "Dutch"
    // info. page serves an ENGLISH description today - the second-strongest on-page signal
    // after the title. Derive it from the page's own first SUBSTANTIAL Dutch paragraph
    // (>=60 chars skips kickers like "Inschrijving - Schooljaar 2026-2027"); never author
    // new marketing copy. If no such paragraph exists, leave English and REPORT it.
    const paras = [...h.matchAll(/<p[^>]*>([\s\S]{0,400}?)<\/p>/g)]
      .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(x => x.length >= 60);
    if (paras.length) {
      const d = esc(paras[0].slice(0, 300));
      h = h.replace(/(<meta name="description" content=")[^"]*(")/, `$1${d}$2`);
      h = h.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`);
      h = h.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${d}$2`);
    } else {
      console.log(`     \u24d8 ${page.slug} (nl): no Dutch paragraph long enough for a description - left English`);
    }

    // JSON-LD on the Dutch page should also be Dutch where it is mechanical
    h = h.replace(/"addressLocality":\s*"Ghent"/g, '"addressLocality": "Gent"');

    // alt / aria-label: info. never language-paired these, so the Dutch view has always
    // announced English to screen readers. Shared map keeps both generators in step.
    h = applyNlA11y(h);
  }

  // language switcher: setLang() buttons -> real cross-links
  h = h.replace(
    /<button class="lang-btn[^"]*" id="btn-en"[\s\S]*?<\/button>\s*<button class="lang-btn[^"]*" id="btn-nl"[\s\S]*?<\/button>/,
    `<a class="lang-btn${lang === 'en' ? ' active' : ''}" id="btn-en" href="${enUrl}" hreflang="en">EN</a>\n` +
    `      <a class="lang-btn${lang === 'nl' ? ' active' : ''}" id="btn-nl" href="${nlUrl}" hreflang="nl">NL</a>`
  );

  // ── remove the setLang runtime and its CSS ─────────────────────────────────────
  //  A split page has exactly one language, so there is nothing to toggle. Leaving the
  //  runtime in is actively dangerous: its boot reads localStorage 'lang' and calls
  //  setLang('nl'), which adds body.nl, and the CSS rule
  //      body.nl [data-lang="en"] { display: none; }
  //  would then hide EVERY element on the English page — a blank page.
  //  It does not fire today only because this origin happens to use the key
  //  'shoonya-lang' while info. uses 'lang'. That is luck, not design: any future page
  //  on schedule. that writes 'lang' would blank these pages. Remove it at the source.
  const sIdx = h.indexOf('function setLang');
  if (sIdx > -1) {
    const openTag = h.lastIndexOf('<script', sIdx);
    const closeTag = h.indexOf('</script>', sIdx);
    if (openTag > -1 && closeTag > -1) h = h.slice(0, openTag) + h.slice(closeTag + '</script>'.length);
  }
  h = h.replace(/^\s*body\.nl \[data-lang="en"\][^\n]*\n/m, '');
  h = h.replace(/^\s*body:not\(\.nl\) \[data-lang="nl"\][^\n]*\n/m, '');

  // ── Dutch-page place names ──────────────────────────────────────────────────────
  //  INHERITED, not introduced: info. never language-paired its <meta>, JSON-LD or the
  //  hero location line, so its Dutch view already says "Ghent · Belgium". Estate
  //  convention (CLAUDE.md) is Gent in Dutch, Ghent in English — including
  //  schema addressLocality, which should match the page's language.
  //  Scope is deliberately narrow: place names only. alt/aria text is real copy and is
  //  NOT machine-translated here — see the build report.
  if (lang === 'nl') {
    h = h.replace(/>([^<]*)\bGhent\b([^<]*)</g, (m, a, b) => `>${a}Gent${b}<`);
    h = h.replace(/"addressLocality":\s*"Ghent"/g, '"addressLocality": "Gent"');
    h = h.replace(/(<meta[^>]+content="[^"]*?)\bGhent\b/g, '$1Gent');
    h = h.replace(/>([^<]*)\bBelgium\b([^<]*)</g, (m, a, b) => `>${a}Belgi\u00eb${b}<`);
  }

  // fold the membership explainer into /register/, before the FAQ
  if (page.slug === 'register') {
    const mem = membershipSection(lang);
    if (mem.html && /<section class="faq-section"/.test(h)) {
      h = h.replace(/(\s*)<section class="faq-section"/, `${mem.html}$1<section class="faq-section"`);
      h = h.replace(/<\/style>/, `${mem.css}</style>`);
    } else if (!mem.html) { console.error('  ⚠ membership fold produced nothing'); problems++; }
  }

  // og:image and schema url still pointed at info. - the hub hosts its own copies of these
  // assets, and a schema url must be the page's own URL, not the page it was ported from.
  h = h.replace(/https:\/\/info\.shoonyadance\.com\/assets\//g, `${HUB}/assets/`);
  h = h.replace(new RegExp('"url":\\s*"https://info\\.shoonyadance\\.com/' + page.slug + '/?"', 'g'), `"url": "${selfUrl}"`);
  h = h.replace(/"url":\s*"https:\/\/info\.shoonyadance\.com\/?"/g, `"url": "${HUB}/${lang === 'nl' ? 'nl/' : ''}new/"`);

  // internal links -> hub paths
  const map = linkMap(lang);
  for (const [from, to] of Object.entries(map)) {
    h = h.replace(new RegExp(`href="${from.replace(/[/]/g, '\\/')}"`, 'g'), `href="${to}"`);
  }

  // styles. links point at the hub's own styles page now
  h = h.replace(/https:\/\/styles\.shoonyadance\.com\/?/g, lang === 'en' ? `${HUB}/styles/` : `${HUB}/nl/styles/`);

  return h;
}

/* ── write ─────────────────────────────────────────────────────────────────────── */
let problems = 0;
for (const page of PAGES) {
  for (const lang of ['en', 'nl']) {
    const out = lang === 'en'
      ? join(REPO, page.slug, 'index.html')
      : join(REPO, 'nl', page.slug, 'index.html');
    mkdirSync(dirname(out), { recursive: true });
    let html;
    try { html = build(page, lang); }
    catch (e) { console.error(`✗ ${page.slug} (${lang}): ${e.message}`); problems++; continue; }
    writeFileSync(out, html);

    // count ELEMENTS carrying data-lang, not every textual occurrence — CSS selectors
    // mention data-lang too and are not content.
    const els = [...html.matchAll(/<[a-z0-9]+[^>]*\sdata-lang="(en|nl)"/gi)].map(m => m[1]);
    const leftover = els;
    const wrongLang = els.filter(l => l !== lang).length;
    const setLangLeft = /function setLang/.test(html) ? 1 : 0;
    if (lang === 'nl') {
      const left = remainingEnglish(html);
      if (left.length) { console.error(`     ✗ NL a11y strings still English: ${left.join(' | ')}`); problems++; }
    }
    if (setLangLeft) { console.error('  ✗ setLang runtime survived — would blank the page'); problems++; }
    const unmapped = [...html.matchAll(/href="(\/(?!nl\/)[a-z-]+\/)"/g)].map(m => m[1])
      .filter(p => !['/about/', '/studios/', '/new/', '/styles/', '/register/'].includes(p));
    if (wrongLang) { console.error(`  ✗ ${wrongLang} ${lang === 'en' ? 'nl' : 'en'} elements survived`); problems++; }
    if (unmapped.length) { console.error(`  ⚠ unmapped internal links: ${[...new Set(unmapped)].join(', ')}`); problems++; }
    console.log(`✓ ${out.replace(REPO + '/', '').padEnd(26)} ${String(html.length).padStart(6)} B · kept ${leftover.length} ${lang} blocks · noindex=${STAGING}`);
  }
}

/* copy every /assets/ file the built pages actually reference — discovered, not hard-coded,
   so a new page bringing a new image cannot silently ship a broken <img>. */
mkdirSync(join(REPO, 'assets'), { recursive: true });
const wanted = new Set();
for (const page of PAGES) for (const lang of ['en', 'nl']) {
  const f = lang === 'en' ? join(REPO, page.slug, 'index.html') : join(REPO, 'nl', page.slug, 'index.html');
  if (!existsSync(f)) continue;
  for (const m of readFileSync(f, 'utf8').matchAll(/["'(]\/assets\/([^"')?#]+)/g)) wanted.add(m[1]);
}
for (const a of wanted) {
  const from = join(SRCREPO, 'assets', a);
  if (existsSync(from)) { copyFileSync(from, join(REPO, 'assets', a)); console.log(`  ↳ assets/${a}`); }
  else { console.error(`  ⚠ MISSING asset referenced by a built page: assets/${a}`); problems++; }
}

console.log(problems ? `\n⚠ ${problems} problem(s) — do not publish until resolved.` : '\n✓ clean build');
process.exit(problems ? 1 : 0);
