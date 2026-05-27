/* ============================================================
   MIS × Apple — Shared App Helpers
   - Theme persistence
   - Auth state helpers (phone in localStorage)
   - Lucide icon init
   - Number / currency formatters
   ============================================================ */

(function () {
  const App = {};
  window.MIS = App;

  // ---- Theme ---------------------------------------------------------
  App.theme = {
    get() {
      return localStorage.getItem('mis_theme') || 'light';
    },
    set(theme) {
      localStorage.setItem('mis_theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      // Update ALL toggle switches on the page (some pages have multiple
      // surfaces showing the dark-mode pill — sidebar, settings, drawer).
      document.querySelectorAll('.toggle-switch').forEach(t => {
        t.classList.toggle('on', theme === 'dark');
      });
    },
    toggle() {
      App.theme.set(App.theme.get() === 'dark' ? 'light' : 'dark');
    },
    init() {
      // Apply persisted or system preference
      const stored = localStorage.getItem('mis_theme');
      if (stored) {
        App.theme.set(stored);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        App.theme.set('dark');
      } else {
        App.theme.set('light');
      }
    }
  };

  // ---- Auth ----------------------------------------------------------
  App.auth = {
    getPhone() {
      return localStorage.getItem('mis_phone') || '';
    },
    setPhone(phone) {
      if (phone) localStorage.setItem('mis_phone', phone);
      else localStorage.removeItem('mis_phone');
    },
    getTenantName() {
      return localStorage.getItem('mis_tenant_name') || '';
    },
    setTenantName(name) {
      if (name) localStorage.setItem('mis_tenant_name', name);
      else localStorage.removeItem('mis_tenant_name');
    },
    // Sprint 1.4: HMAC chat token. Issued by /api/auth/issue-token after phone
    // resolves to a known tenant or MIS user. Sent as X-Chat-Token on /chat.
    getChatToken() {
      const t = localStorage.getItem('mis_chat_token') || '';
      if (!t) return '';
      const exp = Number(localStorage.getItem('mis_chat_token_exp') || 0);
      if (exp && exp * 1000 < Date.now() + 60_000) {
        // Within 60s of expiry → treat as expired so caller re-issues.
        return '';
      }
      return t;
    },
    setChatToken(token, expSec) {
      if (token) {
        localStorage.setItem('mis_chat_token', token);
        if (expSec) localStorage.setItem('mis_chat_token_exp', String(expSec));
      } else {
        localStorage.removeItem('mis_chat_token');
        localStorage.removeItem('mis_chat_token_exp');
      }
    },
    async issueChatToken(phone) {
      const p = String(phone || App.auth.getPhone() || '').replace(/[^0-9]/g, '');
      if (!p) return null;
      try {
        const res = await fetch('/api/auth/issue-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: p })
        });
        if (!res.ok) {
          console.warn('[issueChatToken] HTTP', res.status);
          return null;
        }
        const data = await res.json();
        if (data && data.token) {
          App.auth.setChatToken(data.token, data.exp);
          return data.token;
        }
      } catch (e) {
        console.warn('[issueChatToken] error', e.message);
      }
      return null;
    },
    // Refresh token if missing/expiring. Best-effort — never throws.
    async ensureChatToken() {
      const cur = App.auth.getChatToken();
      if (cur) return cur;
      return await App.auth.issueChatToken();
    },
    logout() {
      localStorage.removeItem('mis_phone');
      localStorage.removeItem('mis_tenant_name');
      localStorage.removeItem('mis_chat_token');
      localStorage.removeItem('mis_chat_token_exp');
      window.location.replace('/login');
    },
    requireAuth() {
      // Use on protected pages — redirect to /login if no phone stored
      if (!App.auth.getPhone()) {
        window.location.replace('/login');
      }
    }
  };

  // chatFetch — POST to /chat with X-Chat-Token auto-attached. Re-issues
  // the token once if the server responds 401 with auth_error: 'expired'.
  App.chatFetch = async function (body, opts = {}) {
    await App.auth.ensureChatToken();
    const doFetch = () => {
      const headers = Object.assign(
        { 'Content-Type': 'application/json' },
        opts.headers || {}
      );
      const t = App.auth.getChatToken();
      if (t) headers['X-Chat-Token'] = t;
      return fetch('/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(body || {})
      });
    };
    let res = await doFetch();
    if (res.status === 401) {
      // Try one re-issue then retry once
      App.auth.setChatToken(null);
      const fresh = await App.auth.issueChatToken();
      if (fresh) res = await doFetch();
    }
    return res;
  };

  // ---- Formatters ----------------------------------------------------
  // Defensive against Safari's `TypeError: No default value` which fires
  // when Number() is called on a Symbol or an object whose Symbol.toPrimitive
  // / valueOf / toString returns a non-primitive. Chart.js v4 occasionally
  // passes such objects to tick / tooltip callbacks during render — without
  // this guard the error halts axis-layout and the line/area silently fails.
  function _toFiniteNumber(n) {
    if (n == null) return null;
    if (typeof n === 'number') return Number.isFinite(n) ? n : null;
    try {
      const v = Number(n);
      return Number.isFinite(v) ? v : null;
    } catch { return null; }
  }
  App.fmt = {
    inr(n) {
      const v = _toFiniteNumber(n);
      if (v == null) return '—';
      const abs = Math.abs(v);
      if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
      if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
      if (abs >= 1e3) return `₹${(v / 1e3).toFixed(1)} K`;
      try { return `₹${Math.round(v).toLocaleString('en-IN')}`; }
      catch { return `₹${Math.round(v)}`; }
    },
    num(n) {
      const v = _toFiniteNumber(n);
      if (v == null) return '—';
      try { return v.toLocaleString('en-IN'); }
      catch { return String(v); }
    },
    pct(n, digits = 1) {
      if (n === null || n === undefined) return '—';
      const v = typeof n === 'number' ? n : Number(n);
      if (!Number.isFinite(v)) return '—';
      return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
    },
    relativeTime(d) {
      const date = typeof d === 'string' ? new Date(d) : d;
      const diff = (Date.now() - date.getTime()) / 1000;
      if (diff < 60) return 'just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    },
    today() {
      return new Date().toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
    }
  };

  // ---- Counter animation -------------------------------------------
  App.animateCounter = function (el, to, opts = {}) {
    const dur = opts.duration || 900;
    const fmt = opts.formatter || App.fmt.num;
    const startTime = performance.now();
    const fromVal = +(el.dataset.value || 0);
    function tick(now) {
      const elapsed = Math.min((now - startTime) / dur, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const current = fromVal + (to - fromVal) * eased;
      el.textContent = fmt(current);
      if (elapsed < 1) requestAnimationFrame(tick);
      else el.dataset.value = to;
    }
    requestAnimationFrame(tick);
  };

  // ---- XLSX (Excel) export -----------------------------------------
  // Requires SheetJS to be loaded via CDN <script src="…/xlsx.full.min.js">
  // Usage:
  //   MIS.xlsx.download('sales-2026-05.xlsx', [
  //     { name: 'Summary', headers: ['Metric','Value'], rows: [['Total','₹37 Cr']] },
  //     { name: 'Invoices', headers: ['Date','Party','Amount'], rows: [...] }
  //   ]);
  // Single-sheet shortcut:
  //   MIS.xlsx.downloadSimple('top-customers.xlsx', headers, rows, 'Customers');
  App.xlsx = {
    isReady() { return typeof window.XLSX !== 'undefined'; },
    download(filename, sheets) {
      if (!App.xlsx.isReady()) {
        alert('Excel export library not loaded. Please refresh the page and retry.');
        return false;
      }
      const wb = window.XLSX.utils.book_new();
      const list = Array.isArray(sheets) ? sheets : [sheets];
      list.forEach((s, idx) => {
        const headers = s.headers || [];
        const rows = s.rows || [];
        const aoa = headers.length ? [headers, ...rows] : rows;
        const ws = window.XLSX.utils.aoa_to_sheet(aoa);
        // Auto-size columns based on max content length per column
        if (aoa.length && Array.isArray(aoa[0])) {
          const widths = aoa[0].map((_, ci) => {
            let max = 8;
            for (const row of aoa) {
              const v = row[ci];
              const len = (v == null ? 0 : String(v).length);
              if (len > max) max = len;
            }
            return { wch: Math.min(max + 2, 60) };
          });
          ws['!cols'] = widths;
        }
        const sheetName = (s.name || ('Sheet' + (idx + 1))).slice(0, 31).replace(/[\\/?*\[\]:]/g, '_');
        window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });
      try {
        window.XLSX.writeFile(wb, filename);
        return true;
      } catch (e) {
        console.error('[xlsx export]', e);
        alert('Excel export failed: ' + (e.message || e));
        return false;
      }
    },
    downloadSimple(filename, headers, rows, sheetName) {
      return App.xlsx.download(filename, [{ name: sheetName || 'Sheet1', headers, rows }]);
    }
  };

  // ---- Futuristic page-header tilt (Phase 22 Level-3) ---------------
  // Auto-attaches mouse-move 3D tilt on every .page-header-hero element.
  App.attachHeroTilt = function () {
    document.querySelectorAll('.page-header-hero').forEach(el => {
      if (el.dataset.tiltBound) return;
      el.dataset.tiltBound = '1';
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--hero-rx', ((0.5 - py) * 4) + 'deg');
        el.style.setProperty('--hero-ry', ((px - 0.5) * 4) + 'deg');
      });
      el.addEventListener('mouseleave', () => {
        el.style.setProperty('--hero-rx', '0deg');
        el.style.setProperty('--hero-ry', '0deg');
      });
    });
  };

  // ---- Auto count-up on KPI value when scrolled into view -----------
  // Parses .kpi-value text content (preserves currency / suffix) and
  // animates from 0. Runs once per element via IntersectionObserver.
  App.attachAutoCountUp = function () {
    if (!('IntersectionObserver' in window)) return;
    const seen = new WeakSet();
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        if (seen.has(el)) return;
        seen.add(el);
        const txt = (el.textContent || '').trim();
        // Extract first numeric token; preserve prefix (₹) + suffix (Cr / L / K / d / %).
        const m = txt.match(/^(\D*)([\d.,]+)(\D*)$/);
        if (!m) return;
        const prefix = m[1] || '';
        const suffix = m[3] || '';
        const target = parseFloat(m[2].replace(/,/g, '')) || 0;
        if (target <= 0) return;
        const dec = (m[2].split('.')[1] || '').length;
        const start = performance.now();
        const dur = 900;
        const isInt = dec === 0;
        function tick(now) {
          const t = Math.min((now - start) / dur, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          const cur = target * eased;
          let s;
          if (isInt) s = Math.round(cur).toLocaleString('en-IN');
          else s = cur.toFixed(dec);
          el.textContent = prefix + s + suffix;
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });
    document.querySelectorAll('.kpi-value').forEach(el => io.observe(el));
  };

  // ---- Refresh button: add .spinning class while a fetch is in flight
  // Page-local code can call window.MIS.spinRefresh(true|false) around fetches.
  App.spinRefresh = function (on) {
    const btn = document.getElementById('refreshBtn');
    if (!btn) return;
    btn.classList.toggle('spinning', !!on);
  };

  // ---- Init ---------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    App.theme.init();
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
    if (App.attachHeroTilt) App.attachHeroTilt();
    // Auto count-up runs once after a short delay so KPI values are populated
    setTimeout(() => { if (App.attachAutoCountUp) App.attachAutoCountUp(); }, 600);
    // Re-attach on dynamic content changes (drill pages render KPIs after fetch)
    new MutationObserver(() => {
      if (App.attachHeroTilt) App.attachHeroTilt();
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
