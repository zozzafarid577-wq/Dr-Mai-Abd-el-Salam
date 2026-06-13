// ─────────────────────────────────────────────────────────────────
// Dr Mai Portal — Auth Utilities
// Loaded on every portal/admin page via <script src="/js/auth.js">
//
// SETUP: Replace the two constants below with your Supabase values.
// Find them at: Supabase Dashboard → Project Settings → API
// ─────────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://plcrxugvvnyuoakfxvnk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsY3J4dWd2dm55dW9ha2Z4dm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTI1NjgsImV4cCI6MjA5NTcyODU2OH0.wShniliV9_MpF86yVrZPJzXBctVXN-zP-G-XgBYlVAw';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// ── Core session helpers ──────────────────────────────────────────

async function getSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function getProfile(uid) {
  const id = uid ?? (await getSession())?.user?.id;
  if (!id) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', id).single();
  return data ?? null;
}

// ── Page guard ────────────────────────────────────────────────────
// Call at the top of every protected page.
//   role: 'admin' | 'student' | undefined (any authenticated user)
// Returns the profile object on success.
// On failure, redirects and returns null — caller should return early.

async function requireAuth(role) {
  const session = await getSession();
  if (!session) { location.replace('/login.html'); return null; }

  const profile = await getProfile(session.user.id);
  if (!profile) { await sb.auth.signOut(); location.replace('/login.html'); return null; }

  if (!profile.is_active) {
    await sb.auth.signOut();
    location.replace('/login.html?e=inactive');
    return null;
  }

  if (role && profile.role !== role) {
    location.replace(profile.role === 'admin' ? '/drmai-staff-portal/' : '/portal/');
    return null;
  }

  if (profile.role === 'student' && profile.must_change_pw) {
    if (!location.pathname.endsWith('settings.html')) {
      location.replace('/portal/settings.html?first=1');
      return null;
    }
  }

  // Single-session check for students
  if (profile.role === 'student' && profile.session_token) {
    const stored = localStorage.getItem('drmai_session_token');
    if (stored && stored !== profile.session_token) {
      await sb.auth.signOut();
      location.replace('/login.html?e=session_expired');
      return null;
    }
  }

  if (profile.role === 'student') { try { await setupStudentNav(profile.id); } catch (_) {} }

  return profile;
}

// Enrolment flags, populated by setupStudentNav() (cached in sessionStorage).
function isRevisionStudent() {
  try { return sessionStorage.getItem('drmai_is_revision') === '1'; } catch (_) { return false; }
}
function isBasicsStudent() {
  try { return sessionStorage.getItem('drmai_is_basics') === '1'; } catch (_) { return false; }
}
// Revision-ONLY (not also in basics) — these students get the trimmed view.
function isPureRevisionStudent() {
  return isRevisionStudent() && !isBasicsStudent();
}

// ── Enrolment-aware sidebar ───────────────────────────────────────
// Three cases:
//   • Basics only   → the full standard menu (no revision-only tabs)
//   • Revision only → a focused menu (recordings, real exams,
//                     summaries/cheat codes, real test) + revision tabs
//   • Basics + Revision → everything in one place (full menu + revision tabs)
async function setupStudentNav(studentId) {
  const scroll = document.querySelector('.sidebar .sidebar-scroll');
  if (!scroll) return;

  // Determine basics/revision enrolment (cached for the session).
  let rev = sessionStorage.getItem('drmai_is_revision');
  let bas = sessionStorage.getItem('drmai_is_basics');
  if (rev === null || bas === null) {
    const { data } = await sb.from('enrollments').select('courses(title)').eq('student_id', studentId);
    const titles = (data || []).map(e => e.courses?.title || '');
    rev = titles.some(t => /revision/i.test(t)) ? '1' : '0';
    bas = titles.some(t => /basics/i.test(t))   ? '1' : '0';
    sessionStorage.setItem('drmai_is_revision', rev);
    sessionStorage.setItem('drmai_is_basics', bas);
  }
  const isRevision    = rev === '1';
  const isBasics      = bas === '1';
  const pureRevision  = isRevision && !isBasics;   // trim the menu only for these

  // Inject the shared "Student Notes" tab (all students) + the revision tabs once.
  if (!scroll.querySelector('a[href="/portal/student-notes.html"]')) {
    scroll.insertAdjacentHTML('beforeend', `
      <div class="nav-section nav-notes">Community</div>
      <a href="/portal/chat.html" class="nav-item nav-notes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>Chatroom</a>
      <a href="/portal/student-notes.html" class="nav-item nav-notes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Student Notes</a>
      <div class="nav-section nav-rev">Revision</div>
      <a href="/portal/summaries.html" class="nav-item nav-rev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Summaries &amp; Cheat Codes</a>
      <a href="/portal/retest.html" class="nav-item nav-rev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Real Test</a>`);
  }

  // Highlight the current page (covers the injected tabs too).
  const path = location.pathname.replace(/\/index\.html$/, '/');
  scroll.querySelectorAll('.nav-item').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });

  // Revision-only tabs are visible to anyone enrolled in a revision course
  // (revision-only OR basics+revision). Everyone else doesn't see them.
  if (!isRevision) {
    scroll.querySelectorAll('.nav-rev').forEach(el => { el.style.display = 'none'; });
  }

  // Only a PURE revision student gets the trimmed menu. Basics-only and
  // basics+revision students keep the full menu (everything in one place).
  if (!pureRevision) return;

  const ALLOW = ['/portal/', '/portal/lessons.html', '/portal/mock-tests.html',
                 '/portal/summaries.html', '/portal/retest.html', '/portal/student-notes.html',
                 '/portal/chat.html', '/portal/scores.html', '/portal/settings.html'];
  scroll.querySelectorAll('.nav-item').forEach(a => {
    if (!ALLOW.includes(a.getAttribute('href'))) a.style.display = 'none';
  });
  // "Mock Tests" → "Real Exams" for revision-only students.
  const mock = scroll.querySelector('a[href="/portal/mock-tests.html"]');
  if (mock) mock.childNodes.forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = 'Real Exams'; });
  // Hide section headers that have no visible items under them.
  scroll.querySelectorAll('.nav-section').forEach(sec => {
    let n = sec.nextElementSibling, visible = false;
    while (n && !n.classList.contains('nav-section')) {
      if (n.classList.contains('nav-item') && n.style.display !== 'none') visible = true;
      n = n.nextElementSibling;
    }
    if (!visible) sec.style.display = 'none';
  });
}

// ── Sign out ──────────────────────────────────────────────────────

async function signOut() {
  await sb.auth.signOut();
  location.replace('/login.html');
}

// ── Post-login redirect ───────────────────────────────────────────
// Called right after a successful signInWithPassword.

async function handlePostLogin() {
  const profile = await getProfile();
  if (!profile) { location.replace('/login.html'); return; }
  if (profile.role === 'admin') { location.replace('/drmai-staff-portal/'); return; }

  // Register this session (kicks any other logged-in device for this student)
  try {
    const session = await getSession();
    if (session && profile.role === 'student') {
      const resp = await fetch('/api/register-session', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + session.access_token }
      });
      if (resp.ok) {
        const { session_token } = await resp.json();
        if (session_token) localStorage.setItem('drmai_session_token', session_token);
      }
    }
  } catch (_) {}

  location.replace(profile.must_change_pw ? '/portal/settings.html?first=1' : '/portal/');
}

// ── Utility helpers ───────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function timeAgo(iso) {
  if (!iso) return '';
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return `${Math.floor(secs/86400)}d ago`;
}

function initials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

// Themed gradient for courses that have no thumbnail
const COURSE_GRADIENTS = [
  'linear-gradient(135deg,#1a56db,#0e38b1)',
  'linear-gradient(135deg,#7c3aed,#4c1d95)',
  'linear-gradient(135deg,#0891b2,#164e63)',
  'linear-gradient(135deg,#059669,#064e3b)',
  'linear-gradient(135deg,#d97706,#78350f)',
];
function courseGradient(index) {
  return COURSE_GRADIENTS[index % COURSE_GRADIENTS.length];
}

// ── Theme (light / dark) + floating biology background ────────────
// Runs on every page that loads this script. The chosen theme is saved
// in localStorage; an inline <head> snippet applies it before paint to
// avoid a flash, and this adds the toggle button + animated icons.
(function themeAndDecor() {
  const KEY = 'theme';
  function current() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function apply(theme) {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = theme === 'dark' ? SUN : MOON;
  }
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  const SUN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

  // Biology icons (DNA, flask, microscope, leaf, atom, cell, heart, capsule).
  const ICONS = [
    '<path d="M4 2c0 4 16 6 16 10S4 18 4 22"/><path d="M20 2c0 4-16 6-16 10s16 6 16 10"/><line x1="6" y1="6" x2="18" y2="6"/><line x1="6" y1="18" x2="18" y2="18"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/>',
    '<path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><line x1="7" y1="16" x2="17" y2="16"/>',
    '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(120 12 12)"/>',
    '<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 9-10 0 6-2 11-2 17z"/><path d="M11 20c0-4 2-7 6-9"/>',
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><circle cx="7" cy="9" r="1.2"/><circle cx="16" cy="15" r="1.2"/>',
    '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21l8.84-8.61a5.5 5.5 0 0 0 0-7.78z"/>',
    '<rect x="3" y="9" width="13" height="6" rx="3" transform="rotate(45 12 12)"/><line x1="9" y1="9" x2="15" y2="15"/>',
    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
  ];

  function decorate() {
    // Floating background — only on the app-shell pages (which lift their
    // content above it); skip exam/viewer/standalone pages.
    if (!document.querySelector('.bio-bg') && document.querySelector('.main') &&
        !/take-test|viewer|attempt/.test(location.pathname)) {
      const layer = document.createElement('div');
      layer.className = 'bio-bg';
      let html = '';
      const N = 11;
      for (let i = 0; i < N; i++) {
        const ic   = ICONS[i % ICONS.length];
        const left = Math.round((i * 97 + 8) % 96);
        const top  = Math.round((i * 53 + 6) % 92);
        const size = 30 + (i % 4) * 16;
        const dur  = 16 + (i % 6) * 5;
        const del  = -(i * 3);
        html += `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
          style="left:${left}%;top:${top}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${del}s">${ic}</svg>`;
      }
      layer.innerHTML = html;
      document.body.insertBefore(layer, document.body.firstChild);
    }
    // Theme toggle button.
    if (!document.getElementById('theme-toggle')) {
      const btn = document.createElement('button');
      btn.id = 'theme-toggle';
      btn.className = 'theme-toggle no-print';
      btn.title = 'Toggle light / dark theme';
      btn.innerHTML = current() === 'dark' ? SUN : MOON;
      btn.onclick = () => apply(current() === 'dark' ? 'light' : 'dark');
      document.body.appendChild(btn);
    }
  }

  // Make sure the saved theme is applied (head snippet may be absent).
  try { if (localStorage.getItem(KEY) === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); } catch (_) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate);
  else decorate();
})();
