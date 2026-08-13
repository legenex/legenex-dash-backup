#!/usr/bin/env node
// Legenex page inventory generator.
//
// Derives a normalized manifest of every page, tab, redirect and portal route in
// the app from the REAL sources of truth:
//
//   src/App.jsx + src/AppRoutes.jsx    router (routes, layouts, host branches)
//   src/components/layout/navConfig.js operator sidebar (sections, labels, tabs)
//   src/lib/permissions.js             permission keys and role presets
//   src/components/docs/docsConfig.jsx public documentation routes
//
// It also walks each page component's transitive @/ import graph to collect the
// Base44 entities and backend functions that page actually reads, and inverts
// that into a file to pages map so a commit touching a shared component can be
// mapped to the pages it affects.
//
// The manifest is machine owned and safe to regenerate. Human judgement lives in
// a separate file (criticality, owners, LeadByte equivalent, notes) which this
// script only ever ADDS keys to, never overwrites. Regeneration is idempotent.
//
// Outputs:
//   docs/progress/page-inventory.json   generated, do not hand edit
//   docs/progress/page-metadata.json    human owned, seeded then left alone
//
// It EVALUATES ONLY. It never writes app code, never touches records, never
// calls the live path.
//
// Run:  node scripts/generate-page-inventory.mjs
//       node scripts/generate-page-inventory.mjs --check   (exit 1 if stale)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT_DIR = join(ROOT, 'docs/progress');
const INVENTORY_PATH = join(OUT_DIR, 'page-inventory.json');
const METADATA_PATH = join(OUT_DIR, 'page-metadata.json');
// The frontend imports the manifest directly so the Application Review tree can
// render before any records exist.
const FRONTEND_MANIFEST = join(ROOT, 'src/lib/progress/pageManifest.json');
// Backend functions cannot import across function folder boundaries, so the
// sync function gets its own bundled copy rather than a relative import.
const BACKEND_MANIFEST = join(ROOT, 'base44/functions/progressSync/pageManifest.js');

const CHECK_ONLY = process.argv.includes('--check');

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/* ------------------------------------------------------------------ *
 * 1. Router parse
 * ------------------------------------------------------------------ */

// Scan a JSX source for <Route> tags. Brace and quote aware, so an inline
// element like element={<LeadsView view="all" />} does not terminate the tag
// early on its inner closing bracket.
function scanRouteTags(code) {
  const tags = [];
  let i = 0;
  while (i < code.length) {
    const open = code.indexOf('<Route', i);
    const close = code.indexOf('</Route>', i);
    if (open === -1 && close === -1) break;
    if (close !== -1 && (open === -1 || close < open)) {
      tags.push({ kind: 'close', index: close });
      i = close + 8;
      continue;
    }
    // Guard against matching <RouteSomethingElse.
    const after = code[open + 6];
    if (after && /[A-Za-z0-9_]/.test(after)) { i = open + 6; continue; }
    let j = open + 6;
    let depth = 0;
    let quote = null;
    while (j < code.length) {
      const c = code[j];
      if (quote) {
        if (c === quote && code[j - 1] !== '\\') quote = null;
      } else if (c === '"' || c === "'" || c === '`') {
        quote = c;
      } else if (c === '{') {
        depth += 1;
      } else if (c === '}') {
        depth -= 1;
      } else if (c === '>' && depth === 0) {
        break;
      }
      j += 1;
    }
    const raw = code.slice(open, j + 1);
    const selfClosing = /\/\s*>$/.test(raw);
    tags.push({ kind: 'open', index: open, raw, attrs: code.slice(open + 6, j - (selfClosing ? 1 : 0)), selfClosing });
    i = j + 1;
  }
  return tags.sort((a, b) => a.index - b.index);
}

// Pull a balanced {...} expression that follows `name=` inside an attribute blob.
function attrExpression(attrs, name) {
  const at = attrs.indexOf(`${name}={`);
  if (at === -1) return null;
  let j = attrs.indexOf('{', at);
  let depth = 0;
  let quote = null;
  const start = j;
  while (j < attrs.length) {
    const c = attrs[j];
    if (quote) {
      if (c === quote && attrs[j - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c;
    } else if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) return attrs.slice(start + 1, j);
    }
    j += 1;
  }
  return null;
}

const attrString = (attrs, name) => {
  const m = attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`));
  return m ? m[1] : null;
};

function parseRouter(code) {
  const tags = scanRouteTags(code);
  const stack = [];
  const routes = [];

  for (const tag of tags) {
    if (tag.kind === 'close') { stack.pop(); continue; }

    const path = attrString(tag.attrs, 'path');
    const isIndex = /\bindex\b/.test(tag.attrs) && !path;
    const elementExpr = attrExpression(tag.attrs, 'element') || '';
    const elementName = (elementExpr.match(/<\s*([A-Za-z0-9_.]+)/) || [])[1] || null;

    if (path || isIndex) {
      const redirectTo = elementName === 'Navigate'
        ? (elementExpr.match(/\bto=["']([^"']+)["']/) || [])[1] || null
        : null;
      // Component props carried inline, e.g. view="sold".
      const propsMatch = elementExpr.replace(/<\s*[A-Za-z0-9_.]+\s*/, '').replace(/\/?\s*>\s*$/, '').trim();
      routes.push({
        route: path,
        index: isIndex,
        element: elementName,
        element_props: propsMatch || null,
        redirect_to: redirectTo,
        layouts: stack.map((s) => s.element).filter(Boolean),
      });
    }

    if (!tag.selfClosing) stack.push({ element: elementName, path });
  }
  return routes;
}

function parseImports(code) {
  const map = {};
  const re = /import\s+(?:\{([^}]*)\}|([A-Za-z0-9_$]+))\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code))) {
    const source = m[3];
    if (m[2]) map[m[2]] = source;
    if (m[1]) {
      m[1].split(',').forEach((part) => {
        const name = part.split(/\s+as\s+/).pop().trim();
        if (name) map[name] = source;
      });
    }
  }
  return map;
}

/* ------------------------------------------------------------------ *
 * 2. Nav, permissions, docs
 * ------------------------------------------------------------------ */

async function loadNav() {
  // Preferred: import the real module so the manifest cannot drift from it.
  try {
    const mod = await import(pathToFileURL(join(SRC, 'components/layout/navConfig.js')).href);
    if (Array.isArray(mod.navGroups)) return mod.navGroups;
  } catch {
    // Falls through to the text parse when icon resolution is unavailable.
  }
  const code = read(join(SRC, 'components/layout/navConfig.js'));
  const groups = [];
  let current = null;
  code.split('\n').forEach((line) => {
    const label = (line.match(/\blabel:\s*'([^']+)'/) || [])[1];
    const path = (line.match(/\bpath:\s*'([^']+)'/) || [])[1];
    const tab = (line.match(/\btab:\s*'([^']+)'/) || [])[1];
    const permKey = (line.match(/\bpermKey:\s*'([^']+)'/) || [])[1];
    const isGroup = /\btype:\s*'(dropdown|single)'/.test(line) || (label && path && /^\s{2}\{/.test(line));
    if (!label) return;
    if (isGroup) {
      current = { label, path, permKey, children: [] };
      groups.push(current);
    } else if (current) {
      current.children.push({ label, path, tab, permKey });
    }
  });
  return groups;
}

async function loadPermissions() {
  try {
    return await import(pathToFileURL(join(SRC, 'lib/permissions.js')).href);
  } catch {
    return { PATH_KEYS: {}, SETTINGS_TAB_KEYS: {}, ROLE_PRESETS: {} };
  }
}

function loadDocsRoutes() {
  const code = read(join(SRC, 'components/docs/docsConfig.jsx')) || read(join(SRC, 'components/docs/docsConfig.js'));
  const out = [];
  const re = /\{\s*slug:\s*'([^']*)'\s*,\s*title:\s*'([^']+)'\s*,\s*Component:\s*([A-Za-z0-9_$]+)/g;
  let m;
  let group = null;
  code.split('\n').forEach((line) => {
    const g = (line.match(/\bgroup:\s*'([^']+)'/) || [])[1];
    if (g) group = g;
    re.lastIndex = 0;
    const hit = re.exec(line);
    if (hit) out.push({ slug: hit[1], title: hit[2], component: hit[3], group });
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * 3. Dependency graph
 * ------------------------------------------------------------------ */

const EXTS = ['.jsx', '.js', '.tsx', '.ts'];

function resolveAlias(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolvePath(dirname(fromFile), spec);
  else return null;
  for (const ext of EXTS) {
    if (existsSync(base + ext)) return base + ext;
  }
  if (existsSync(base)) {
    for (const ext of EXTS) {
      const idx = join(base, `index${ext}`);
      if (existsSync(idx)) return idx;
    }
  }
  return null;
}

// Walk a component's local import graph and collect what it touches.
function scanDependencies(entryFile, cache) {
  if (!entryFile || !existsSync(entryFile)) {
    return { entities: [], functions: [], files: [] };
  }
  if (cache.has(entryFile)) return cache.get(entryFile);

  const entities = new Set();
  const functions = new Set();
  const files = new Set();
  const seen = new Set();
  const queue = [entryFile];
  // Bounded so a cycle or a very wide shared barrel cannot run away.
  let budget = 400;

  while (queue.length && budget > 0) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    budget -= 1;
    const code = read(file);
    if (!code) continue;
    files.add(file.replace(`${ROOT}/`, ''));

    let m;
    const entRe = /base44\.entities\.([A-Z][A-Za-z0-9_]*)/g;
    while ((m = entRe.exec(code))) entities.add(m[1]);
    // Functions are called as base44.functions.invoke('name', args). Capture the
    // NAME, not the invoke wrapper. A direct base44.functions.name(...) call is
    // supported too in case that form appears.
    const invokeRe = /base44\.functions\.invoke\(\s*['"]([A-Za-z][A-Za-z0-9_]*)['"]/g;
    while ((m = invokeRe.exec(code))) functions.add(m[1]);
    const directRe = /base44\.functions\.(?!invoke\b)([a-zA-Z][A-Za-z0-9_]*)\s*\(/g;
    while ((m = directRe.exec(code))) functions.add(m[1]);

    const impRe = /from\s+['"]([^'"]+)['"]/g;
    while ((m = impRe.exec(code))) {
      const target = resolveAlias(m[1], file);
      // Skip the UI primitive barrel, it adds noise without signal.
      if (target && !seen.has(target) && !/\/components\/ui\//.test(target)) queue.push(target);
      else if (target && /\/components\/ui\//.test(target)) files.add(target.replace(`${ROOT}/`, ''));
    }
  }

  const result = {
    entities: [...entities].sort(),
    functions: [...functions].sort(),
    files: [...files].sort(),
  };
  cache.set(entryFile, result);
  return result;
}

/* ------------------------------------------------------------------ *
 * 4. Classification helpers
 * ------------------------------------------------------------------ */

const slugify = (s) => {
  if (s === '/') return 'overview-root';
  if (s === '*') return 'not-found';
  return (s || '')
    .replace(/^\//, '')
    .replace(/\?/g, '-')
    .replace(/\*/g, 'wildcard')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'root';
};

// page_key must be unique across the manifest. The router legitimately mounts
// the same path in more than one host branch, so disambiguate rather than losing
// an entry.
function dedupeKeys(pages) {
  const seen = new Map();
  pages.forEach((p) => {
    const base = p.page_key;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    if (n > 0) p.page_key = `${base}-${p.host_scope.replace(/[^a-z]/g, '') || 'alt'}-${n}`;
  });
  return pages;
}

function hostScopeFor(route, element) {
  if (element === 'ApiStatus') return 'api';
  if (route.startsWith('/docs')) return 'docs+dashboard';
  // The Progress Control Center is served on its own subdomain and, for
  // authorised users, under /progress on the main dashboard.
  if (route.startsWith('/progress')) return 'progress+dashboard';
  return 'dashboard';
}

function portalScopeFor(route) {
  if (route.startsWith('/portal')) return 'buyer_portal';
  if (route.startsWith('/supplier-portal')) return 'supplier_portal';
  if (route.startsWith('/progress')) return 'progress';
  if (route.startsWith('/docs') || route === '/apply' || route === '/login'
    || route === '/register' || route === '/forgot-password' || route === '/reset-password') return 'public';
  return 'operator';
}

function routeTypeFor(entry) {
  if (entry.redirect_to) return 'redirect';
  if (entry.route === '*') return 'catchall';
  if (entry.route && entry.route.includes(':')) return 'detail';
  return 'page';
}

function rolesFor(permissionKey, rolePresets) {
  if (!permissionKey) return Object.keys(rolePresets || {});
  return Object.entries(rolePresets || {})
    .filter(([, preset]) => preset.permissions && preset.permissions[permissionKey])
    .map(([name]) => name);
}

/* ------------------------------------------------------------------ *
 * 5. Build
 * ------------------------------------------------------------------ */

async function build() {
  // The route table was extracted from App.jsx into AppRoutes.jsx. Parsing only
  // App.jsx found 7 routes instead of 116 and silently emptied the review tree,
  // so both files are read and their imports merged. Any future router file goes
  // in this list.
  const ROUTER_FILES = ['App.jsx', 'AppRoutes.jsx'];
  const routerSources = ROUTER_FILES
    .map((f) => ({ file: f, code: read(join(SRC, f)) }))
    .filter((r) => r.code);
  if (routerSources.length === 0) throw new Error('No router source found; run from the app root.');
  const appCode = routerSources.map((r) => r.code).join('\n');

  const imports = {};
  const importOrigin = {};
  routerSources.forEach(({ file, code }) => {
    const parsed = parseImports(code);
    Object.entries(parsed).forEach(([name, spec]) => {
      imports[name] = spec;
      importOrigin[name] = join(SRC, file);
    });
  });
  const routes = routerSources.flatMap(({ code }) => parseRouter(code));
  const originFor = (name) => importOrigin[name] || join(SRC, 'App.jsx');
  const navGroups = await loadNav();
  const perms = await loadPermissions();
  const docsRoutes = loadDocsRoutes();

  // Nav lookup: route (and route?tab=) to its section and label.
  const navByRoute = new Map();
  const tabEntries = [];
  navGroups.forEach((group) => {
    const sectionKey = slugify(group.label);
    if (group.path && !group.children?.length) {
      navByRoute.set(group.path, { section_key: sectionKey, section_label: group.label, title: group.label });
    }
    (group.children || []).forEach((child) => {
      if (!child.path) return;
      if (child.tab) {
        tabEntries.push({
          route: `${child.path}?tab=${child.tab}`,
          parent_route: child.path,
          tab: child.tab,
          title: child.label,
          section_key: sectionKey,
          section_label: group.label,
          permission_key: child.permKey || null,
        });
      } else if (!navByRoute.has(child.path)) {
        navByRoute.set(child.path, { section_key: sectionKey, section_label: group.label, title: child.label });
      }
    });
    if (group.path && !navByRoute.has(group.path)) {
      navByRoute.set(group.path, { section_key: sectionKey, section_label: group.label, title: group.label });
    }
  });

  const depCache = new Map();
  const pages = [];

  // 5a. Router routes.
  for (const r of routes) {
    if (!r.route) continue;
    const componentSpec = r.element ? imports[r.element] : null;
    const componentPath = componentSpec ? (resolveAlias(componentSpec, originFor(r.element)) || '') : '';
    const nav = navByRoute.get(r.route);
    const permissionKey = typeof perms.keyForLocation === 'function'
      ? perms.keyForLocation(r.route, '')
      : (perms.PATH_KEYS || {})[r.route] || null;
    const deps = componentPath ? scanDependencies(componentPath, depCache) : { entities: [], functions: [], files: [] };
    const isPublic = r.layouts.every((l) => l !== 'ProtectedRoute');
    // A page also inherits whatever its layout chain fetches. Portal pages read
    // their data from the layout via useOutletContext, so without this the
    // manifest would under-report their real backend dependencies. Kept in
    // separate fields so per page signal is not drowned by shared layout noise.
    const layoutDeps = { entities: new Set(), functions: new Set(), files: new Set() };
    r.layouts.forEach((name) => {
      const spec = imports[name];
      const lp = spec ? resolveAlias(spec, originFor(name)) : null;
      if (!lp) return;
      const d = scanDependencies(lp, depCache);
      d.entities.forEach((x) => layoutDeps.entities.add(x));
      d.functions.forEach((x) => layoutDeps.functions.add(x));
      d.files.forEach((x) => layoutDeps.files.add(x));
    });

    pages.push({
      page_key: slugify(r.route),
      section_key: nav?.section_key || sectionFromRoute(r.route),
      section_label: nav?.section_label || sectionLabelFromRoute(r.route),
      title: nav?.title || titleFromRoute(r.route, r.element),
      route: r.route,
      parent_route: null,
      tab: null,
      host_scope: hostScopeFor(r.route, r.element),
      portal_scope: portalScopeFor(r.route),
      route_type: routeTypeFor(r),
      redirect_to: r.redirect_to,
      component: r.element,
      component_props: r.element_props,
      component_path: componentPath.replace(`${ROOT}/`, ''),
      layouts: r.layouts,
      auth: isPublic ? 'public' : 'protected',
      nav_visibility: nav ? 'nav' : 'hidden',
      permission_key: permissionKey,
      roles: rolesFor(permissionKey, perms.ROLE_PRESETS),
      entity_dependencies: deps.entities,
      function_dependencies: deps.functions,
      component_dependencies: deps.files,
      layout_entity_dependencies: [...layoutDeps.entities].sort().filter((x) => !deps.entities.includes(x)),
      layout_function_dependencies: [...layoutDeps.functions].sort().filter((x) => !deps.functions.includes(x)),
      layout_files: [...layoutDeps.files].sort(),
    });
  }

  // 5b. Query string tabs from the nav (Reports, Finances, Settings).
  const byRoute = new Map(pages.map((p) => [p.route, p]));
  const settingsTabKeys = perms.SETTINGS_TAB_KEYS || {};
  Object.keys(settingsTabKeys).forEach((tab) => {
    if (!tabEntries.some((t) => t.route === `/settings?tab=${tab}`)) {
      tabEntries.push({
        route: `/settings?tab=${tab}`,
        parent_route: '/settings',
        tab,
        title: `Settings: ${tab}`,
        section_key: 'settings',
        section_label: 'Settings',
        permission_key: settingsTabKeys[tab] || null,
      });
    }
  });

  for (const t of tabEntries) {
    const parent = byRoute.get(t.parent_route);
    pages.push({
      page_key: slugify(t.route),
      section_key: t.section_key,
      section_label: t.section_label,
      title: t.title,
      route: t.route,
      parent_route: t.parent_route,
      tab: t.tab,
      host_scope: 'dashboard',
      portal_scope: 'operator',
      route_type: 'tab',
      redirect_to: null,
      component: parent?.component || null,
      component_props: null,
      component_path: parent?.component_path || '',
      layouts: parent?.layouts || [],
      auth: 'protected',
      nav_visibility: 'nav',
      permission_key: t.permission_key,
      roles: rolesFor(t.permission_key, perms.ROLE_PRESETS),
      entity_dependencies: parent?.entity_dependencies || [],
      function_dependencies: parent?.function_dependencies || [],
      component_dependencies: parent?.component_dependencies || [],
      layout_entity_dependencies: parent?.layout_entity_dependencies || [],
      layout_function_dependencies: parent?.layout_function_dependencies || [],
      layout_files: parent?.layout_files || [],
    });
  }

  // 5c. Public documentation pages, expanded from docsConfig.
  const docsImports = parseImports(read(join(SRC, 'components/docs/docsConfig.jsx')) || read(join(SRC, 'components/docs/docsConfig.js')));
  for (const d of docsRoutes) {
    const route = d.slug ? `/docs/${d.slug}` : '/docs';
    if (byRoute.has(route)) continue;
    const spec = docsImports[d.component];
    const componentPath = spec ? (resolveAlias(spec, join(SRC, 'components/docs/docsConfig.jsx')) || '') : '';
    const deps = componentPath ? scanDependencies(componentPath, depCache) : { entities: [], functions: [], files: [] };
    pages.push({
      page_key: slugify(route),
      section_key: 'documentation',
      section_label: 'Public documentation',
      title: d.title,
      route,
      parent_route: '/docs',
      tab: null,
      host_scope: 'docs+dashboard',
      portal_scope: 'public',
      route_type: 'page',
      redirect_to: null,
      component: d.component,
      component_props: null,
      component_path: componentPath.replace(`${ROOT}/`, ''),
      layouts: ['DocsLayout'],
      auth: 'public',
      nav_visibility: 'nav',
      permission_key: null,
      roles: ['anonymous'],
      entity_dependencies: deps.entities,
      function_dependencies: deps.functions,
      component_dependencies: deps.files,
      layout_entity_dependencies: [],
      layout_function_dependencies: [],
      layout_files: [],
    });
  }

  pages.sort((a, b) => (a.section_key + a.route).localeCompare(b.section_key + b.route));
  dedupeKeys(pages);

  // 5d. Invert the dependency graph: file to the pages it can affect.
  const fileToPages = {};
  pages.forEach((p) => {
    const own = p.component_path ? [p.component_path] : [];
    [...own, ...(p.component_dependencies || []), ...(p.layout_files || [])].forEach((f) => {
      if (!fileToPages[f]) fileToPages[f] = [];
      if (!fileToPages[f].includes(p.page_key)) fileToPages[f].push(p.page_key);
    });
  });
  Object.values(fileToPages).forEach((list) => list.sort());

  let commit = '';
  try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { commit = 'unknown'; }

  return {
    inventory: {
      generated_at: new Date().toISOString(),
      generator: 'scripts/generate-page-inventory.mjs',
      app_commit: commit,
      sources: [
        'src/App.jsx',
        'src/AppRoutes.jsx',
        'src/components/layout/navConfig.js',
        'src/lib/permissions.js',
        'src/components/docs/docsConfig.jsx',
      ],
      counts: {
        total: pages.length,
        by_type: countBy(pages, 'route_type'),
        by_section: countBy(pages, 'section_key'),
        by_portal_scope: countBy(pages, 'portal_scope'),
        hidden_from_nav: pages.filter((p) => p.nav_visibility === 'hidden').length,
      },
      pages,
      file_to_pages: fileToPages,
    },
  };
}

function countBy(list, key) {
  return list.reduce((acc, item) => {
    const k = item[key] || 'unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function sectionFromRoute(route) {
  if (route.startsWith('/progress')) return 'progress-control-center';
  if (route.startsWith('/portal')) return 'buyer-portal';
  if (route.startsWith('/supplier-portal')) return 'supplier-portal';
  if (route.startsWith('/docs')) return 'documentation';
  if (route.startsWith('/operations')) return 'operations';
  if (route.startsWith('/leads')) return 'leads';
  if (route.startsWith('/ad-manager')) return 'ad-manager';
  if (route.startsWith('/distribution') || route.startsWith('/campaigns')
    || route === '/deliveries' || route === '/conversion-events') return 'lead-distribution';
  if (['/login', '/register', '/forgot-password', '/reset-password'].includes(route)) return 'authentication';
  if (route === '/apply') return 'buyer-onboarding';
  if (route === '*') return 'error-states';
  return 'other';
}

function sectionLabelFromRoute(route) {
  const map = {
    'progress-control-center': 'Progress Control Center',
    'buyer-portal': 'Buyer Portal',
    'supplier-portal': 'Supplier Portal',
    documentation: 'Public documentation',
    operations: 'Operations',
    leads: 'Leads',
    'ad-manager': 'Ad Manager',
    'lead-distribution': 'Lead Distribution',
    authentication: 'Authentication',
    'buyer-onboarding': 'Buyer application and onboarding',
    'error-states': 'Error and empty states',
    other: 'Other routes',
  };
  return map[sectionFromRoute(route)] || 'Other routes';
}

function titleFromRoute(route, element) {
  if (route === '/') return 'Overview';
  if (route === '*') return 'Not found';
  if (element && element !== 'Navigate') {
    return element.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  return route;
}

/* ------------------------------------------------------------------ *
 * 6. Human metadata merge (additive only)
 * ------------------------------------------------------------------ */

const METADATA_TEMPLATE = {
  criticality: 'normal',
  readiness_weight: null,
  business_owner: '',
  technical_owner: '',
  leadbyte_equivalent: '',
  migration_required: null,
  backend_dependencies_manual: [],
  known_risks: [],
  human_notes: '',
};

function mergeMetadata(pages) {
  let existing = {};
  if (existsSync(METADATA_PATH)) {
    try { existing = JSON.parse(readFileSync(METADATA_PATH, 'utf8')); } catch { existing = {}; }
  }
  const entries = existing.pages || {};
  let added = 0;
  pages.forEach((p) => {
    if (!entries[p.page_key]) {
      entries[p.page_key] = { ...METADATA_TEMPLATE, route: p.route, title: p.title };
      added += 1;
    } else if (!entries[p.page_key].route) {
      entries[p.page_key].route = p.route;
    }
  });
  const orphans = Object.keys(entries).filter((k) => !pages.some((p) => p.page_key === k));
  return {
    file: {
      _comment: 'Human owned. The generator only ADDS keys here and never overwrites your values. Delete an entry only when its route is gone for good.',
      _template: METADATA_TEMPLATE,
      updated_at: existing.updated_at || new Date().toISOString(),
      pages: entries,
    },
    added,
    orphans,
  };
}

/* ------------------------------------------------------------------ *
 * 7. Main
 * ------------------------------------------------------------------ */

const { inventory } = await build();
const meta = mergeMetadata(inventory.pages);

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const nextJson = JSON.stringify(inventory, null, 2);
const prev = read(INVENTORY_PATH);
// Compare ignoring the timestamp so --check does not fail on a fresh clock,
// and ignoring trailing whitespace so the written newline is not a diff.
const strip = (s) => s.replace(/"generated_at":\s*"[^"]*",?\n/, '').trim();
const changed = strip(prev) !== strip(nextJson);

if (CHECK_ONLY) {
  if (changed) {
    console.error('page inventory is STALE. Run: node scripts/generate-page-inventory.mjs');
    process.exit(1);
  }
  console.log(`page inventory OK. ${inventory.counts.total} entries, matches the router.`);
  process.exit(0);
}

writeFileSync(INVENTORY_PATH, `${nextJson}\n`);
if (meta.added > 0 || !existsSync(METADATA_PATH)) {
  writeFileSync(METADATA_PATH, `${JSON.stringify(meta.file, null, 2)}\n`);
}

// Fan the manifest out to the two places that consume it at runtime. Both are
// generated artefacts, never hand edited.
//
// The frontend copy is deliberately SLIM. It only has to render the Application
// Review tree before any ProgressPage records exist; the full dependency lists
// live on the records themselves and in the canonical docs JSON. Shipping the
// whole graph to the browser would add half a megabyte to every page load.
const SLIM_FIELDS = [
  'page_key', 'section_key', 'section_label', 'title', 'route', 'parent_route', 'tab',
  'host_scope', 'portal_scope', 'route_type', 'redirect_to', 'component', 'component_path',
  'auth', 'nav_visibility', 'permission_key', 'layouts', 'component_props',
];
const slimPages = inventory.pages.map((p) => {
  const out = {};
  SLIM_FIELDS.forEach((f) => { out[f] = p[f]; });
  out.entity_count = (p.entity_dependencies || []).length;
  out.function_count = (p.function_dependencies || []).length;
  out.dependency_count = (p.component_dependencies || []).length + (p.layout_files || []).length;
  return out;
});

for (const target of [FRONTEND_MANIFEST, BACKEND_MANIFEST]) {
  const dir = dirname(target);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
writeFileSync(FRONTEND_MANIFEST, `${JSON.stringify({
  generated_at: inventory.generated_at,
  app_commit: inventory.app_commit,
  counts: inventory.counts,
  pages: slimPages,
}, null, 2)}\n`);
writeFileSync(
  BACKEND_MANIFEST,
  '// GENERATED by scripts/generate-page-inventory.mjs. Do not edit by hand.\n'
  + '// Bundled copy: backend functions cannot import across function folders.\n'
  + `export const MANIFEST = ${JSON.stringify({
    generated_at: inventory.generated_at,
    app_commit: inventory.app_commit,
    counts: inventory.counts,
    pages: inventory.pages,
    file_to_pages: inventory.file_to_pages,
  })};\n`,
);

const c = inventory.counts;
console.log(`page inventory written: ${INVENTORY_PATH.replace(`${ROOT}/`, '')}`);
console.log(`  ${c.total} entries  (${Object.entries(c.by_type).map(([k, v]) => `${v} ${k}`).join(', ')})`);
console.log(`  ${Object.keys(c.by_section).length} sections, ${c.hidden_from_nav} not visible in the operator nav`);
console.log(`  ${Object.keys(inventory.file_to_pages).length} source files mapped to pages`);
console.log(`  metadata: ${meta.added} new entries seeded${meta.orphans.length ? `, ${meta.orphans.length} orphaned (${meta.orphans.join(', ')})` : ''}`);
console.log('  runtime copies: src/lib/progress/pageManifest.json, base44/functions/progressSync/pageManifest.js');
if (changed) console.log('  inventory CHANGED since last run');
