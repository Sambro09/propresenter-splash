/*
 * Builds the Claude Design bundle for the ProPresenter Workspace Launcher.
 *
 * Each component is emitted as a SELF-CONTAINED preview HTML file: the launcher's
 * real styles.css is inlined verbatim (single source of truth) plus a small
 * preview-only "stage" wrapper. The first line of every file is a
 *   <!-- @dsCard group="..." -->
 * marker, which the Design System pane compiles into its card index.
 *
 * Run: node design/build-bundle.mjs
 * Then sync the design/out/ folder up with the DesignSync tool.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const outDir = join(here, 'out');

const baseCss = readFileSync(join(repo, 'src/renderer/src/styles.css'), 'utf8');

// Preview-only chrome: a padded dark stage sized like the launcher window.
const stageCss = `
/* ---- preview stage (not part of the app) ---- */
html, body { overflow: auto; min-width: 0; min-height: 0; }
body { padding: 28px; background: var(--bg); }
.stage {
  width: 460px;
  max-width: 100%;
  margin: 0 auto;
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  background: var(--bg);
  box-shadow: 0 24px 70px rgba(0,0,0,0.5);
}
.stage.window { height: 560px; display: flex; flex-direction: column; }
.stage.window .app { height: 100%; }
.stage.pad { padding: 18px; }
.row-stack { display: grid; gap: 8px; padding: 14px; }
.swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px,1fr)); gap: 12px; padding: 18px; }
.swatch { border:1px solid var(--border-soft); border-radius:10px; overflow:hidden; font-size:11px; }
.swatch .chip { height: 52px; }
.swatch .meta { padding: 8px 10px; color: var(--text-2); display:grid; gap:2px; }
.swatch .meta b { color: var(--text); font-weight:600; }
.btn-grid { display:flex; flex-wrap:wrap; gap:12px; align-items:center; padding:18px; }
.label { padding: 4px 18px 0; color: var(--text-3); font-size:11px; font-weight:700; letter-spacing:.8px; text-transform:uppercase; }
`;

// --- Minimal inline icons (stroke, currentColor) approximating the Phosphor set ---
const I = {
  stack: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/></svg>`,
  monitor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M9 21h6M12 17v4"/><path d="m11 9 3 1.8L11 12.5V9Z" fill="currentColor"/></svg>`,
  caret: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="m9 6 6 6-6 6"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3"/></svg>`,
  warnCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><circle cx="12" cy="12" r="9.2"/><path d="M12 7.5v5"/><circle cx="12" cy="16.4" r="1" fill="currentColor" stroke="none"/></svg>`,
  checkCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><circle cx="12" cy="12" r="9.2"/><path d="m8 12 2.8 2.8L16 9.2"/></svg>`,
  warnTri: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M12 3.2 1.8 20.5h20.4L12 3.2Z"/><path d="M12 9.5v5"/><circle cx="12" cy="17.6" r="1" fill="currentColor" stroke="none"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M12 3.5v11M7.5 10 12 14.5 16.5 10M4 20h16"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5a3 3 0 0 1 6 0"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.2H20a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 20 19.5H4.5A1.5 1.5 0 0 1 3 18V6.5Z"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M14.5 5.5 18.5 9.5M4 20l1-4L16 5a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L8 19l-4 1Z"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="1em" height="1em" class="spin"><path d="M12 3a9 9 0 1 0 9 9" opacity=".9"/></svg>`
};

const wsRow = ({ name, sub, state }) => {
  const active = state === 'active';
  const launching = state === 'launching';
  const editing = state === 'editing';
  const cls = ['wsRow', active ? 'active' : '', editing ? 'editing' : ''].filter(Boolean).join(' ');
  const glyph = launching ? I.spinner : I.monitor;
  const trail = active
    ? `<span class="activePill"><span class="activeDot"></span>Active</span>`
    : editing ? '' : `<span class="wsTrail">${I.caret}</span>`;
  const subLine = sub ? `<span class="wsPath">${sub}</span>` : '';
  const gear = editing ? `<button class="wsGear" type="button" title="Edit">${I.gear}</button>` : '';
  return `<div class="wsRowWrap">
    <button type="button" class="${cls}">
      <span class="wsGlyph">${glyph}</span>
      <span class="wsText"><span class="wsName">${name}</span>${subLine}</span>
      ${trail}
    </button>${gear}
  </div>`;
};

const toolbar = (active = 'Sunday AM') => `<header class="toolbar" style="-webkit-app-region:initial">
  <div class="toolbarTitle">
    <span class="toolbarGlyph">${I.stack}</span>
    <span class="toolbarText">
      <span class="toolbarHeading">Workspaces</span>
      <span class="toolbarSub">Current: <b>${active}</b></span>
    </span>
  </div>
  <span class="ppStatus" title="ProPresenter is open"><span class="statusDot live"></span>Open</span>
</header>`;

const components = [
  {
    file: 'foundations/colors.html',
    group: 'Foundations',
    title: 'Color tokens',
    body: () => {
      const tokens = [
        ['--bg', '#1b1b1d', 'App background'],
        ['--panel', '#242427', 'Panel / banner'],
        ['--row', '#28282b', 'Workspace row'],
        ['--row-hover', '#313137', 'Row hover'],
        ['--border', '#3a3a40', 'Border'],
        ['--text', '#f4f4f6', 'Primary text'],
        ['--text-2', '#a2a2ab', 'Secondary text'],
        ['--text-3', '#74747c', 'Tertiary text'],
        ['--accent', '#2f7bf6', 'Accent'],
        ['--accent-strong', '#2470f0', 'Accent strong'],
        ['--green', '#35c759', 'Running'],
        ['--red', '#ff4d3e', 'Error / danger'],
        ['--amber', '#ff9f0a', 'Warning']
      ];
      const cells = tokens.map(([v, hex, label]) =>
        `<div class="swatch"><div class="chip" style="background:${hex}"></div><div class="meta"><b>${label}</b><span>${v}</span><span>${hex}</span></div></div>`
      ).join('');
      return `<div class="stage"><div class="swatches">${cells}</div></div>`;
    }
  },
  {
    file: 'components/toolbar.html',
    group: 'Components',
    title: 'Toolbar + status',
    body: () => `<div class="stage">${toolbar()}
      <div class="row-stack">
        <span class="ppStatus" title="closed"><span class="statusDot off"></span>Closed</span>
        <span class="ppStatus" title="not installed"><span class="statusDot missing"></span>Not installed</span>
        <span class="ppStatus" title="checking"><span class="statusDot"></span>Checking…</span>
      </div></div>`
  },
  {
    file: 'components/workspace-rows.html',
    group: 'Components',
    title: 'Workspace rows',
    body: () => `<div class="stage"><div class="row-stack">
      ${wsRow({ name: 'Sunday AM', state: 'active' })}
      ${wsRow({ name: 'Sunday PM', state: 'idle' })}
      ${wsRow({ name: 'Midweek', state: 'idle' })}
      ${wsRow({ name: 'Conference 2026', sub: 'Opening “Conference 2026”…', state: 'launching' })}
      ${wsRow({ name: 'Youth', sub: '/Users/sam/ProPresenter/Youth', state: 'editing' })}
    </div></div>`
  },
  {
    file: 'components/buttons.html',
    group: 'Components',
    title: 'Buttons',
    body: () => `<div class="stage"><div class="btn-grid">
      <button class="btn btnPrimary" type="button">Save</button>
      <button class="btn btnGhost" type="button">Cancel</button>
      <button class="btn btnDanger" type="button">Switch Workspace</button>
      <button class="primaryBtn" type="button">${I.folder} Choose Folder</button>
      <button class="bannerBtn" type="button">${I.clipboard} Copy details</button>
      <button class="chooseBtn" type="button">${I.folder} Choose…</button>
      <button class="resetLink" type="button">Reset to detected</button>
    </div></div>`
  },
  {
    file: 'components/banners.html',
    group: 'Components',
    title: 'Banners',
    body: () => `<div class="stage"><div class="alerts" style="display:grid">
      <div class="banner warn"><span>${I.warnCircle}</span><span>ProPresenter isn’t installed on this Mac.</span><button class="bannerBtn" type="button">${I.download} Download</button></div>
      <div class="banner error"><span>${I.warnCircle}</span><span>Could not open ProPresenter. Quit failed.</span><button class="bannerBtn" type="button">Retry</button><button class="bannerBtn" type="button">${I.clipboard} Copy details</button></div>
      <div class="banner success"><span>${I.checkCircle}</span><span>Support details copied.</span></div>
    </div></div>`
  },
  {
    file: 'components/edit-bar.html',
    group: 'Components',
    title: 'Edit-mode bar',
    body: () => `<div class="stage"><div class="editBar">
      <span class="editBarLabel">${I.pencil} Edit Mode</span>
      <span class="editBarHint">Rename or repoint workspaces</span>
      <button class="editBarDone" type="button">Done</button>
    </div></div>`
  },
  {
    file: 'components/modal-confirm.html',
    group: 'Components',
    title: 'Confirm switch dialog',
    body: () => `<div class="stage pad"><div class="modal" role="dialog">
      <span class="modalIcon">${I.warnTri}</span>
      <h2>Switch Workspace?</h2>
      <p>Save any work first. The launcher will close ProPresenter and reopen it with <b>Sunday PM</b>.</p>
      <div class="modalActions">
        <span class="modalSpacer"></span>
        <button class="btn btnGhost" type="button">Cancel</button>
        <button class="btn btnDanger" type="button">Switch Workspace</button>
      </div>
    </div></div>`
  },
  {
    file: 'components/modal-editor.html',
    group: 'Components',
    title: 'Workspace editor dialog',
    body: () => `<div class="stage pad"><div class="modal" role="dialog">
      <span class="modalIcon edit">${I.gear}</span>
      <h2>Edit Workspace</h2>
      <label class="field"><span class="fieldLabel">Name</span>
        <input class="textInput" type="text" value="Sunday AM"></label>
      <label class="field"><span class="fieldLabel">Folder</span>
        <div class="pathRow"><input class="textInput" type="text" value="/Users/sam/ProPresenter/Sunday AM">
        <button class="chooseBtn" type="button">${I.folder} Choose…</button></div></label>
      <div class="modalActions">
        <button class="resetLink" type="button">Reset to detected</button>
        <span class="modalSpacer"></span>
        <button class="btn btnGhost" type="button">Cancel</button>
        <button class="btn btnPrimary" type="button">Save</button>
      </div>
    </div></div>`
  },
  {
    file: 'states/states.html',
    group: 'States',
    title: 'Empty / loading / error',
    body: () => `<div class="stage"><div class="label">Loading</div>
      <div class="placeholder" style="height:160px">${I.spinner}<span>Scanning workspaces…</span></div>
      <div class="label">Empty</div>
      <div class="placeholder" style="height:220px"><span class="placeholderGlyph">${I.stack}</span><h2>No workspaces found</h2><p>/Users/sam/ProPresenter</p><button class="primaryBtn" type="button">${I.folder} Choose Folder</button></div>
      <div class="label">Error</div>
      <div class="placeholder" style="height:180px"><span class="placeholderGlyph">${I.warnCircle}</span><h2>Launcher unavailable</h2><p>The launcher could not start. Try reopening it.</p></div>
    </div>`
  },
  {
    file: 'screens/launcher.html',
    group: 'Screens',
    title: 'Launcher — full window',
    body: () => `<div class="stage window"><div class="app">
      ${toolbar()}
      <main class="library">
        <div class="libraryHeader"><span>Workspaces</span><span class="libraryCount">4</span></div>
        <div class="list">
          ${wsRow({ name: 'Sunday AM', state: 'active' })}
          ${wsRow({ name: 'Sunday PM', state: 'idle' })}
          ${wsRow({ name: 'Midweek', state: 'idle' })}
          ${wsRow({ name: 'Youth', state: 'idle' })}
        </div>
      </main>
    </div></div>`
  }
];

const page = ({ group, title, body }) =>
  `<!-- @dsCard group="${group}" -->
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${baseCss}\n${stageCss}</style>
</head><body>${body()}</body></html>
`;

rmSync(outDir, { recursive: true, force: true });
let count = 0;
for (const c of components) {
  const dest = join(outDir, c.file);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, page(c));
  count++;
  console.log('  wrote', c.file);
}
console.log(`\n${count} cards built into design/out/`);
