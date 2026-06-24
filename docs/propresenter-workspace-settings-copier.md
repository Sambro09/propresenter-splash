# ProPresenter Workspace Settings Copier

## Purpose

Add an admin-only helper that makes it easier to copy selected ProPresenter
workspace/support-file settings from one ProPresenter "sync" folder to one or
more other sync folders.

This is implemented **inside the existing ProPresenter Splash desktop app**, not
as a website. Because Splash is an Electron app, its main process already has
safe, sandboxed-but-real access to the local filesystem (it scans workspace
folders, reads ProPresenter preferences, and launches the app). So the copier
works directly on folders the admin picks on disk — no zip upload/download dance
is needed. The admin selects a source folder and one or more target folders, the
app previews the matched files by category, makes an automatic backup of each
target, then copies the selected settings into the targets in place.

> Context for readers coming from the original draft: an earlier version of this
> spec was written for a browser-based tool that "cannot safely browse to or
> mutate ProPresenter's local folders," which is why it relied on zip
> upload/patch/download. That constraint does not apply here — Splash is a local
> desktop app — so this version copies folders directly and keeps everything on
> the operator's machine.

## V1 Scope

- Admin-only feature, shown only in the existing **Edit Mode** admin panel
  (`AdminPanel` in `src/renderer/src/App.tsx`).
- Source input: one ProPresenter sync folder (the folder that contains
  `Configuration/`) chosen with the native folder picker.
- Target input: one or more sync folders chosen with the native folder picker.
- Output: the selected category files copied into each target's `Configuration/`
  in place, after an automatic timestamped backup of that target's
  `Configuration/`.
- Storage/privacy policy: everything stays on the local disk the admin chooses.
  The app has **no server, Supabase, R2, or cloud backend** and never uploads or
  transmits workspace settings anywhere. The only writes are the backup folder
  and the copied files inside the target the admin selected.
- Target use case: copying settings between workspaces/sync folders on the same
  computer.
- Category selection: allow admins to choose which groups to copy.

Out of scope for v1:

- Editing ProPresenter files beyond the small set of mapped `Configuration/`
  files (no slide/media/playlist editing).
- Automatically quitting or relaunching ProPresenter around the copy (the admin
  does this manually; the UI reminds them to).
- Stored reusable templates or saved copy presets.
- Multi-user audit/history of copy operations.
- Cloud or cross-machine sync between presentation computers.
- Inventing files in a target that the source does not have (replace-only; see
  Behavior and limits).

## Phase 1: Discovery And File Pattern Mapping

Goal: identify a conservative set of ProPresenter support-file path patterns that
can be copied safely by category.

Tasks:

- Use the sample sync folder checked into the repo at `ProPresenter Sync/` (with
  its `Configuration/` subfolder) as the reference shape. Collect at least one
  more sample from the same ProPresenter version used in production to confirm.
- Inspect folder contents and list the paths that correspond to:
  - Screen configuration
  - Looks
  - Macros
  - Props
  - Messages
  - Timers
- Create a small, pure mapping module that associates each category with one or
  more path/filename matchers.
- Prefer exact or tightly scoped path matching over broad substring matching.
- Document unknown or version-dependent paths in this file as implementation
  notes.

Acceptance checks:

- Given a representative folder, the matcher can report matched files by
  category.
- Categories with no matches are visible and treated as warnings, not silent
  success.
- No unrelated workspace files are matched by default.

## Phase 2: Filesystem Copy Foundation (main process)

Goal: add reliable local file read/copy support in the Electron main process,
without ever sending ProPresenter settings off the machine.

Tasks:

- Build pure, framework-agnostic helper functions (no Electron or `fs`
  dependency inside the pure layer) for:
  - Listing the relative entry paths of a scanned `Configuration/` folder.
  - Finding entries by selected category.
  - Planning which target entries should be replaced by which source entries
    (replace-only — see Behavior and limits).
  - Naming the timestamped backup folder for a target.
- Build a thin filesystem glue layer (in the main process, using
  `node:fs/promises`) that:
  - Resolves the `Configuration/` folder from a picked path (accept either the
    sync root that contains `Configuration/`, or a `Configuration/` folder
    chosen directly).
  - Reads the file inventory of a folder.
  - Copies the chosen files from source to target.
  - Writes each file atomically where practical (write to a temp name in the
    same directory, then rename) so a mid-copy failure can't leave a partially
    written file.
- Keep the pure helpers unit-testable without spinning up Electron or touching
  the real disk.
- Validate inputs before processing: confirm the picked folders exist and
  contain a `Configuration/` folder; skip anything that is not a regular file.

Acceptance checks:

- The helper can read a source folder and a target folder.
- Selected category files from the source replace matching files in the target.
- Unselected files remain unchanged.
- Unrelated files remain unchanged.
- The target folder structure is preserved (files are replaced in place, not
  relocated).

## Phase 3: Admin UI Workflow

Goal: add a clear, cautious admin experience inside the existing Edit Mode panel.

Tasks:

- Add a new admin section titled `Workspace settings copier`, rendered only when
  Edit Mode is active (alongside the existing Launch-at-login / Focused-startup
  toggles in `AdminPanel`).
- Drive all filesystem work through the existing IPC pattern:
  `window.launcher.*` (preload) → `ipcMain.handle('launcher:…')` (main) →
  the copier service. The renderer never touches `fs` directly.
- UI steps:
  1. Choose source folder (native folder picker).
  2. Add one or more target folders (native folder picker).
  3. Choose categories to copy.
  4. Preview matched source and target files by category.
  5. Confirm, then run the copy (each target is backed up first).
  6. Show a per-target summary (files copied, backup location, warnings).
- Show warnings when:
  - A selected category has no source match.
  - A selected category has no matching target file (skipped — replace-only).
  - A target folder appears to have a different `Configuration/` shape than the
    source (possible ProPresenter version mismatch).
- Reuse existing styling conventions (`.adminPanel`, `.adminBtn`, `.toggleRow`,
  modal/banner classes in `styles.css`); do not introduce a UI framework.

Acceptance checks:

- An admin can complete the workflow entirely inside Edit Mode.
- The UI makes it clear which files/categories will be affected before anything
  is written.
- The UI does not claim this is official ProPresenter sync.
- The tool is not visible outside Edit Mode.

## Phase 4: Output And Backup Packaging

Goal: make the copy safe and reversible.

Tasks:

- For each target, before writing anything:
  - Copy the target's entire `Configuration/` folder to a timestamped sibling
    backup folder.
- Then copy only the selected category files from the source into the target's
  `Configuration/`.
- Use predictable, discoverable backup names alongside the target, e.g.:
  - `Configuration.backup-<YYYYMMDD-HHMMSS>/`
- Include concise on-screen restore/apply guidance:
  - Quit ProPresenter before running the copy.
  - Keep the backup folder until the patched workspace has been tested.
  - Reopen ProPresenter and verify screens/looks/macros/etc. before using live.
  - To undo: delete the modified `Configuration/` and rename the backup folder
    back to `Configuration/`.
- Do not auto-delete any of the operator's files; only ever add the backup folder
  and overwrite the selected category files.

Acceptance checks:

- Every target produces a backup before it is modified.
- The patched target can be opened and inspected manually.
- The backup is byte-equivalent to the target's `Configuration/` as it was before
  the copy.

## Phase 5: Tests And Verification

Goal: verify the copier behavior before shipping it in the admin panel.

Note on tooling: the repo had no test runner before this feature (its scripts
were `dev`, `build` = `typecheck` + `electron-vite build`, `preview`, `package`,
`dist`, `release`, `typecheck`), and there is still no ESLint config; CI
(`.github/workflows/release-macos.yml`) only builds releases. This feature adds
**Vitest** (Vite-based, like `electron-vite`) as a dev dependency with a `test`
script (`vitest run`). The pure helpers from Phase 2 are tested without Electron
or real disk; the service is tested against temp folders with `electron` aliased
to a stub (`test/electron-stub.ts`).

Tasks:

- Add Vitest (dev dependency) and a `"test"` script. ✅
- Add unit tests for path/category matching.
- Add unit tests for copy planning (which files would be replaced).
- Add tests for:
  - Selected files are copied.
  - Unselected categories are not copied.
  - Unknown/unmapped files are preserved.
  - Multiple targets each produce their own backup and patched output.
  - Zero-match categories produce warnings.
  - Backup naming is stable/predictable for a given timestamp input.
- Run project checks:
  - `npm run typecheck`
  - `npm run build`
  - `npm test` (after Vitest is added)

Acceptance checks:

- Tests cover the copy behavior without relying on real private ProPresenter
  files (use small fixtures, e.g. derived from `ProPresenter Sync/`).
- Typecheck and build pass.
- A manual run in the app confirms source/target folders can be selected, files
  are previewed, and the copy + backup happen on disk.

## Phase 6: Release Notes And Operator Instructions

Goal: make the feature usable by an admin without extra explanation.

Tasks:

- Add a short usage note near the tool in the Edit Mode panel.
- Add a warning that this overwrites files inside the target folder you pick
  (after backing them up), and that it is not official ProPresenter sync.
- Add troubleshooting notes for:
  - No files matched.
  - Copy ran but ProPresenter behavior did not change.
  - ProPresenter version changed the folder paths.
- Keep wording practical and brief; avoid turning the admin panel into a long
  documentation page.

Acceptance checks:

- An admin can understand the workflow from the UI.
- Failure states explain what to inspect next.
- The implementation remains reversible because a backup is always made first.

## Implementation Defaults

- Process files on the local disk only; never open a network connection.
- No zip dependency for v1 — copy files directly with `node:fs/promises`.
- No Supabase or other schema changes (the app has no backend).
- No new IPC surface beyond the copier channels needed for scan/preview/copy.
- Remembering the last-used source/target folders is optional; if added, persist
  it in the existing `config.json` (see `src/main/config.ts`), not anywhere
  remote.
- Keep the first version conservative: prefer fewer supported categories with
  reliable matching over broad matching that may overwrite unrelated support
  files.
- If ProPresenter file paths differ by version, expose matched-file previews
  rather than hardcoding assumptions invisibly.

## Implementation Notes (Phase 1 — observed file mapping)

These notes record what was actually observed in a ProPresenter 7-era "sync"
folder (and confirmed against the `ProPresenter Sync/` sample checked into this
repo) so the matchers can stay conservative and version changes are easy to spot.
ProPresenter writes its synced workspace settings into a top-level
`Configuration/` folder, one file per settings area. The observed inventory was:

```
Configuration/CCLI                  Configuration/Macros        Configuration/Stage
Configuration/ClearGroups           Configuration/Messages      Configuration/TestPatterns
Configuration/CommunicationDevices  Configuration/Props         Configuration/Timers
Configuration/Groups                Configuration/Workspace
Configuration/KeyMappings           Configuration/Labels
```

Most files are ProPresenter's binary (protobuf-style) format; a few are JSON.

### Category → file mapping (what v1 copies)

| Category | File matched | Confidence | Notes |
| --- | --- | --- | --- |
| Screen configuration | `Configuration/Workspace` | high | Holds the display/output setup (audience + stage screens, switchers, Syphon, Multiview, resolutions). Copying it replaces the whole display config. |
| Looks | `Configuration/Looks` | low | **No `Looks` file existed** in the sampled version (and none exists in `ProPresenter Sync/`), so this usually reports "no match." Kept as a best-guess matcher; verify via the preview. |
| Macros | `Configuration/Macros` | high | Exact file. |
| Props | `Configuration/Props` | high | Exact file. |
| Messages | `Configuration/Messages` | high | Exact file. |
| Timers | `Configuration/Timers` | high | Exact file. |

Matchers are anchored as `(^|/)Configuration/<File>$` (case-insensitive), so a
wrapping folder such as `ProPresenter Sync/Configuration/Workspace` matches, but
unrelated files never do. Files present in the export but intentionally **not**
mapped for v1 (to stay conservative): `Stage` (stage-display layouts), `Groups`,
`Labels`, `CCLI`, `ClearGroups`, `CommunicationDevices`, `KeyMappings`,
`TestPatterns`. They are preserved untouched in patched output.

### macOS folder noise

Folders created or browsed on macOS can contain `.DS_Store` files and `._<name>`
AppleDouble resource forks (and, if an admin points the picker at an unzipped
archive, a `__MACOSX/` directory). These are never matched, never modified, and
excluded from the folder-shape comparison.

### Behavior and limits

- **Replace-only.** A category copies only when both the source and the target
  contain its file. If the source has it but the target does not, it is skipped
  with a warning (the tool never invents a path in the target).
- **Backup-first.** Each target's `Configuration/` is copied to a timestamped
  backup folder before any file is overwritten, so every operation is
  reversible.
- **Version dependence.** Filenames can change between ProPresenter versions.
  When a category shows no match, the preview names the file it looked for so an
  operator can verify against a fresh export.

### Where the code lives

- `src/shared/copier.ts` — dependency-free copier types + the `COPIER_CATEGORIES`
  catalog, imported by main, preload, and renderer. Re-exported through
  `src/shared/types.ts`, where the two `LauncherApi` methods (`pickCopierFolder`,
  `runCopier`) are declared.
- `src/main/copier/categories.ts` — category matching, copy planning
  (replace-only), and backup naming (pure; unit-tested in `categories.test.ts`).
- `src/main/copier/copierService.ts` — `node:fs/promises` glue used by the IPC
  handlers: resolve `Configuration/`, scan inventory, back up, copy files
  atomically (integration-tested in `copierService.test.ts`).
- `src/preload/index.ts` + `src/main/index.ts` — the `window.launcher.*` bridge
  and `ipcMain.handle('launcher:copier-*', …)` handlers.
- `src/renderer/src/App.tsx` — the `Copy Settings…` button in the Edit Mode
  `AdminPanel` plus the `SettingsCopierModal` workflow (extract into
  `src/renderer/src/SettingsCopier.tsx` if it grows large).
- Tests: `src/main/copier/*.test.ts`, run with `npm test` (Vitest). `electron`
  is aliased to `test/electron-stub.ts` via `vitest.config.ts` so the service is
  importable outside an Electron runtime.
