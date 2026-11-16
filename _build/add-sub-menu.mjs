// Adds the shared Shoonya menu loader to every page of this site (idempotent). Run after any build that regenerates pages:
//   node _build/add-sub-menu.mjs
// The loader (links.shoonyadance.com/sdc-nav-sub.js) reads the site's hreflang links for the language switch and keeps the old header if the menu cannot start.
import fs from 'fs'; import path from 'path';
const TAG = '<script src="https://links.shoonyadance.com/sdc-nav-sub.js" defer></script>';
const root = new URL('..', import.meta.url).pathname;
let n = 0;
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (f.name === '.git' || f.name === 'node_modules') continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.html')) {
      const s = fs.readFileSync(p, 'utf8');
      if (s.includes('sdc-nav-sub.js') || !s.includes('</head>')) continue;
      fs.writeFileSync(p, s.replace('</head>', TAG + '\n</head>')); n++;
    }
  }
})(root);
console.log('added to', n, 'pages');
