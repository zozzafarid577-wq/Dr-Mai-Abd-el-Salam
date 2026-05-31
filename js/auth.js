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

  return profile;
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
