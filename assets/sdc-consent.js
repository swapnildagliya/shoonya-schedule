/* Shoonya consent bar + Google Analytics 4. One file for all static Shoonya sites.
   Nothing is loaded from Google and no Google cookie is set before the visitor answers Yes.
   Remove: delete the <script src=".../sdc-consent.js"> line from the pages. */
(function () {
  try {
    var ID = 'G-QDG44K01JR';
    var D = document;
    var started = false;

    function getConsent() {
      var m = D.cookie.match(/(?:^|; )sdc_consent=(yes|no)(?:;|$)/);
      return m ? m[1] : null;
    }
    function setConsent(v) {
      D.cookie = 'sdc_consent=' + v + '; Max-Age=15552000; Domain=.shoonyadance.com; Path=/; SameSite=Lax; Secure';
    }

    function startGA() {
      if (started) return;
      started = true;
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      var s = D.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
      D.head.appendChild(s);
      window.gtag('js', new Date());
      window.gtag('config', ID);

      D.addEventListener('click', function (e) {
        try {
          var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
          if (!a) return;
          var h = a.href || '';
          if (h.indexOf('links.shoonyadance.com/go/') < 0 &&
              h.indexOf('portal.shoonyadance.com') < 0 &&
              h.indexOf('tickets.shoonyadance.com') < 0) return;
          window.gtag('event', 'register_click', {
            link_url: h,
            link_text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            transport_type: 'beacon'
          });
        } catch (err) {}
      }, true);
    }

    function showBar() {
      var nl = (D.documentElement.lang || '').toLowerCase().indexOf('nl') === 0;
      var t = nl
        ? { q: 'We tellen bezoeken met Google Analytics. Mag dat?', y: 'Ja', n: 'Nee', p: 'Privacy', l: 'Cookies' }
        : { q: 'We count visits with Google Analytics. Is that OK?', y: 'Yes', n: 'No', p: 'Privacy', l: 'Cookies' };

      var st = D.createElement('style');
      st.textContent =
        '#sdc-consent{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;box-sizing:border-box;' +
        'background:#fff;color:#000;border-top:1px solid #000;padding:2px 12px;display:flex;align-items:center;' +
        'gap:10px;justify-content:center;font:16px/1.25 Verdana,Geneva,sans-serif}' +
        '#sdc-consent p{margin:0;flex:1 1 auto;max-width:620px;color:#000}' +
        '#sdc-consent a{color:#000;text-decoration:underline;margin-left:4px}' +
        '#sdc-consent button{box-sizing:border-box;min-height:44px;min-width:56px;padding:0 10px;margin:0;' +
        'font:inherit;color:#000;background:#fff;border:2px solid #000;border-radius:0;cursor:pointer;flex:0 0 auto}' +
        '#sdc-consent button:hover{background:#eee}' +
        '#sdc-consent button:focus-visible,#sdc-consent a:focus-visible{outline:3px solid #000;outline-offset:2px}';
      D.head.appendChild(st);

      var bar = D.createElement('div');
      bar.id = 'sdc-consent';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', t.l);

      var p = D.createElement('p');
      p.appendChild(D.createTextNode(t.q));
      var a = D.createElement('a');
      a.href = 'https://www.shoonyadance.com/privacy-policy';
      a.textContent = t.p;
      p.appendChild(a);

      function mk(label, val) {
        var b = D.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', function () {
          try { setConsent(val); } catch (e) {}
          if (bar.parentNode) bar.parentNode.removeChild(bar);
          if (st.parentNode) st.parentNode.removeChild(st);
          if (val === 'yes') startGA();
        });
        return b;
      }
      bar.appendChild(p);
      bar.appendChild(mk(t.y, 'yes'));
      bar.appendChild(mk(t.n, 'no'));
      D.body.appendChild(bar);
    }

    var c = getConsent();
    if (c === 'yes') startGA();
    else if (c === null) showBar();
  } catch (e) {}
})();
