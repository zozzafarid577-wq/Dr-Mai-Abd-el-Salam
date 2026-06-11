// Renders the student portal sidebar nav into #nav-scroll.
// Centralised so new sections appear on every page that opts in.
// Usage: <div class="sidebar-scroll" id="nav-scroll"></div> then renderNav('flashcards').
(function () {
  const I = {
    dash:   '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>',
    book:   '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    play:   '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>',
    pdf:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    test:   '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>',
    mock:   '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
    cards:  '<rect x="2" y="7" width="15" height="13" rx="2"/><path d="M6 4h13a2 2 0 0 1 2 2v11"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
    upload: '<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>',
    bell:   '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    chart:  '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    gear:   '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  };

  const SECTIONS = [
    { label: 'Main', items: [
      { key: 'dashboard',   href: '/portal/',                  icon: I.dash, text: 'Dashboard' },
      { key: 'courses',     href: '/portal/courses.html',      icon: I.book, text: 'My Courses' },
      { key: 'lessons',     href: '/portal/lessons.html',      icon: I.play, text: 'Recordings' },
      { key: 'pdfs',        href: '/portal/pdfs.html',         icon: I.pdf,  text: 'Lesson PDFs' },
    ]},
    { label: 'Practice', items: [
      { key: 'tests',       href: '/portal/tests.html',        icon: I.test,   text: 'Practice Tests' },
      { key: 'mock-tests',  href: '/portal/mock-tests.html',   icon: I.mock,   text: 'Mock Tests' },
      { key: 'flashcards',  href: '/portal/flashcards.html',   icon: I.cards,  text: 'Flashcards' },
      { key: 'assignments', href: '/portal/assignments.html',  icon: I.upload, text: 'Assignments' },
    ]},
    { label: 'More', items: [
      { key: 'leaderboard',   href: '/portal/leaderboard.html',   icon: I.trophy, text: 'Leaderboard' },
      { key: 'announcements', href: '/portal/announcements.html', icon: I.bell,   text: 'Announcements' },
      { key: 'progress',      href: '/portal/progress.html',      icon: I.chart,  text: 'My Progress' },
      { key: 'settings',      href: '/portal/settings.html',      icon: I.gear,   text: 'Settings' },
    ]},
  ];

  window.renderNav = function (activeKey) {
    const el = document.getElementById('nav-scroll');
    if (!el) return;
    el.innerHTML = SECTIONS.map(sec =>
      `<div class="nav-section">${sec.label}</div>` +
      sec.items.map(it =>
        `<a href="${it.href}" class="nav-item${it.key === activeKey ? ' active' : ''}">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${it.icon}</svg>${it.text}</a>`
      ).join('')
    ).join('');
  };
})();
