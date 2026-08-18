/**
 * nl-a11y-strings.mjs — Dutch alt text and aria-labels for the hub's /nl/ pages.
 *
 * WHY THIS FILE EXISTS: info. and styles. never language-paired their alt/aria attributes,
 * so their Dutch view has always announced English to screen readers. The split made that
 * visible; this fixes it. Shared by both generators so the two never drift.
 *
 * SCOPE: functional descriptions only — image alt text and landmark labels. These are
 * mechanical translations of existing strings, not new marketing copy.
 *
 * NOT TRANSLATED, deliberately: proper names ("Swapnil Dagliya", "Wim Boussery") and
 * studio names ("Studio Aakash", "Studio Ananta 1 & 2", "Studio Art Deco") are the same
 * in both languages.
 *
 * Place names follow the estate convention: Gent in Dutch, Ghent in English.
 */
export const NL_A11Y = {
  // alt — image descriptions
  'Rueda de Casino class at Shoonya':                      'Rueda de Casino-les bij Shoonya',
  'Flamenco class at Shoonya Dance Centre':                'Flamencoles bij Shoonya Dance Centre',
  'Kathak dance class at Shoonya Dance Centre':            'Kathak-dansles bij Shoonya Dance Centre',
  'Shoonya Dance Centre building, Stapelplein 41, Ghent':  'Gebouw van Shoonya Dance Centre, Stapelplein 41, Gent',
  'Shoonya Dance Centre staircase, Stapelplein 41, Ghent': 'Trap van Shoonya Dance Centre, Stapelplein 41, Gent',

  // aria-label — landmark and control labels
  'Site navigation':    'Sitenavigatie',
  'Footer navigation':  'Footernavigatie',
  'Footer links':       'Footerlinks',
  'Language':           'Taal',
  'Language selection': 'Taalkeuze',
  'Breadcrumb':         'Kruimelpad',
  'Filter by category': 'Filter op categorie',
};

/** Apply to a built NL page. Reports anything still English so the gap can never go silent. */
export function applyNlA11y(html) {
  for (const [en, nl] of Object.entries(NL_A11Y)) {
    const esc = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`(alt|aria-label)="${esc}"`, 'g'), (m, a) => `${a}="${nl}"`);
  }
  return html;
}

/** Strings still English after translation — excludes the deliberate proper-name skips. */
export function remainingEnglish(html) {
  const SKIP = new Set(['Swapnil Dagliya', 'Wim Boussery', 'Studio Aakash', 'Studio Ananta 1 & 2', 'Studio Art Deco']);
  const found = [];
  for (const m of html.matchAll(/(?:alt|aria-label)="([^"]{2,})"/g)) {
    const v = m[1];
    if (SKIP.has(v)) continue;
    if (!Object.values(NL_A11Y).includes(v)) found.push(v);
  }
  return [...new Set(found)];
}
