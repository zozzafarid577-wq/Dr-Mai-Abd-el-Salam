// Static regression checks over the portal HTML pages.
// These catch the class of bug where a bad merge leaves broken inline JS or a
// duplicated/broken sidebar link in one of the page-per-file portals.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(import.meta.dirname, '..', '..');
const PORTAL_DIRS = ['drmai-staff-portal', 'portal'];

const pages = PORTAL_DIRS.flatMap((dir) =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.html'))
    .map((f) => ({ dir, file: f, path: join(ROOT, dir, f) }))
);

function inlineScripts(html) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!/\bsrc\s*=/i.test(m[1])) scripts.push(m[2]);
  }
  return scripts;
}

function sidebarLinks(html) {
  const aside = html.match(/<aside[^>]*class="[^"]*sidebar[^"]*"[\s\S]*?<\/aside>/i)?.[0] ?? '';
  return [...aside.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*class="[^"]*nav-item[^"]*"/gi)].map(
    (x) => x[1]
  );
}

describe.each(pages)('$dir/$file', ({ path }) => {
  const html = readFileSync(path, 'utf8');

  it('has syntactically valid inline JavaScript', () => {
    for (const code of inlineScripts(html)) {
      // Throws (failing the test) on any syntax error; does not execute the code.
      new vm.Script(code, { filename: path });
    }
  });

  // Some pages (e.g. take-test.html) intentionally have no sidebar.
  const hasSidebar = sidebarLinks(html).length > 0;

  it.runIf(hasSidebar)('has no duplicate sidebar links', () => {
    const links = sidebarLinks(html);
    expect(new Set(links).size).toBe(links.length);
  });

  it('only links to portal pages that exist', () => {
    for (const href of sidebarLinks(html)) {
      const clean = href.split(/[?#]/)[0];
      if (!clean.startsWith('/')) continue;
      let target = join(ROOT, clean.replace(/^\//, ''));
      if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
      expect(existsSync(target), `${href} -> missing file`).toBe(true);
    }
  });
});
