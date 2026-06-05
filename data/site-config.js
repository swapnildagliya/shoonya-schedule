// site-config.js — Display config for schedule.shoonyadance.com
// Derived from semester-config.json. Updated by Claude from teacher submissions.
// Each page includes this via <script src="./data/site-config.js"></script>
// and marks dynamic elements with data-cfg="key" attributes.
(function() {
  'use strict';

  var CFG = {
    schoolYear: '2026–2027',
    schoolYearWide: '2026 — 2027',
    semesterNumber: 1,
    counts: {
      styles: 24, teachers: 22, studios: 5,
      partner_social: 7, classical_technique: 7, culture_wellness: 10
    },
    semester: {
      start: '2026-09-14',
      end: '2027-01-30',
      sessions: 16,
      trialWeek: { start: '2026-09-14', end: '2026-09-19' }
    },
    pricing: {
      60:  { full: 198, student: 175 },
      70:  { full: 223, student: 197 },
      75:  { full: 231, student: 204 },
      90:  { full: 248, student: 219 }
    },
    discounts: { student_pct: 12, uitpas_pct: 80 },
    openDoorDates: ['2026-06-14','2026-09-13','2027-01-31','2027-06-13'],
    trialWeeks: [
      { start: '2026-09-14', end: '2026-09-19' },
      { start: '2027-02-15', end: '2027-02-20' }
    ]
  };

  var MF = {
    en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    nl: ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
  };
  var MS = {
    en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    nl: ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
  };

  function pd(iso) { var p = iso.split('-'); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; }
  function dm(iso, lang) { var dt = pd(iso); return dt.d + ' ' + MS[lang][dt.m]; }
  function dmf(iso, lang) { var dt = pd(iso); return dt.d + ' ' + MF[lang][dt.m]; }
  function dmy(iso, lang) { return dm(iso, lang) + ' ' + pd(iso).y; }
  function dmyf(iso, lang) { return dmf(iso, lang) + ' ' + pd(iso).y; }

  function twRange(tw, lang, full) {
    var s = pd(tw.start), e = pd(tw.end);
    var names = full ? MF : MS;
    return s.d + '–' + e.d + ' ' + names[lang][s.m] + ' ' + s.y;
  }

  var D = {};
  ['en', 'nl'].forEach(function(lang) {
    var d = {};
    var sem = CFG.semester;

    d.sem_label = 'Semester ' + CFG.semesterNumber + ', ' + CFG.schoolYear;

    var sep = lang === 'nl' ? ' tot ' : ' – ';
    d.sem_range = dmyf(sem.start, lang) + sep + dmyf(sem.end, lang);

    d.open_door_1 = dm(CFG.openDoorDates[0], lang);
    d.open_door_2 = dmy(CFG.openDoorDates[1], lang);
    d.open_door_next = d.open_door_1 + ' + ' + d.open_door_2;

    d.open_door_all = CFG.openDoorDates.map(function(iso) {
      return dmy(iso, lang);
    }).join(' · ');

    d.trial_week_short = twRange(sem.trialWeek, lang, false);
    d.trial_week_long = twRange(sem.trialWeek, lang, true);

    d.trial_weeks_all = CFG.trialWeeks.map(function(tw) {
      return twRange(tw, lang, false);
    }).join(' · ');

    D[lang] = d;
  });

  window.SHOONYA = { cfg: CFG, display: D };

  function resolve(path, obj) {
    return path.split('.').reduce(function(o, k) {
      return o != null ? o[k] : undefined;
    }, obj);
  }

  function apply() {
    document.querySelectorAll('[data-cfg]').forEach(function(el) {
      var key = el.getAttribute('data-cfg');
      var val;

      var langEl = el.closest('[data-lang]');
      var lang = langEl ? langEl.getAttribute('data-lang') : null;

      if (lang && D[lang] && D[lang][key] !== undefined) {
        val = D[lang][key];
      } else {
        val = resolve(key, CFG);
      }

      if (val !== undefined && val !== null) {
        el.textContent = String(val);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
