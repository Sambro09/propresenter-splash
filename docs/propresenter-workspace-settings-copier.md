# ProPresenter Workspace Settings Copier

## Purpose

Add an admin-only helper that makes it easier to copy selected ProPresenter workspace/support-file settings from one workspace to other workspaces.

This should be implemented as a browser-based copy tool, not as direct local file automation. The app cannot safely browse to or mutate ProPresenter's local workspace folders from a normal website. Instead, admins will zip the relevant source and target folders, use the admin panel to generate patched target zips, then manually restore/test them in ProPresenter.

## V1 Scope

- Admin-only feature in the existing `/admin` panel.
- Source input: one zipped ProPresenter workspace/support-files folder.
- Target input: one or more zipped ProPresenter workspace/support-files folders.
- Output: patched target zip downloads plus backup/original zips.
- Storage policy: temporary browser memory only; do not upload or persist bundles in Supabase, R2, or server storage.
- Target use case: copying settings between workspaces on the same computer.
- Category selection: allow admins to choose which groups to copy.

Out of scope for v1:

- Directly editing ProPresenter files on disk.
- A local desktop companion app.
- Stored reusable templates.
- Multi-user audit/history of copied bundles.
- Cloud sync between presentation computers.

## Phase 1: Discovery And File Pattern Mapping

Goal: identify a conservative set of ProPresenter support-file path patterns that can be copied safely by category.

Tasks:

- Collect sample zipped source and target support folders from the same ProPresenter version used in production.
- Inspect zip contents and list the paths that correspond to:
  - Screen configuration
  - Looks
  - Macros
  - Props
  - Messages
  - Timers
- Create a small mapping module that associates each category with one or more path/filename matchers.
- Prefer exact or tightly scoped path matching over broad substring matching.
- Document unknown or version-dependent paths in this file as implementation notes.

Acceptance checks:

- Given a representative zip, the matcher can report matched files by category.
- Categories with no matches are visible and treated as warnings, not silent success.
- No unrelated workspace files are matched by default.

## Phase 2: Browser Zip Processing Foundation

Goal: add reliable client-side zip read/write support without sending ProPresenter settings to the server.

Tasks:

- Add a browser-side zip dependency, preferably `fflate`.
- Build pure helper functions for:
  - Reading zip entries from a `File`.
  - Listing zip entry paths.
  - Finding entries by selected category.
  - Replacing target entries with matching source entries.
  - Rebuilding a patched target zip.
- Keep the helpers framework-agnostic where practical so they can be unit tested without rendering the admin UI.
- Enforce practical file limits in the UI before processing large uploads.

Acceptance checks:

- The helper can read a source zip and a target zip.
- Selected category files from the source replace matching files in the target.
- Unselected files remain unchanged.
- Unrelated files remain unchanged.
- The output zip keeps the target folder structure.

## Phase 3: Admin UI Workflow

Goal: add a clear, cautious admin experience inside the existing admin panel.

Tasks:

- Add a new admin section titled `ProPresenter workspace copier`.
- Add a client component for the interactive workflow.
- UI steps:
  1. Select source zip.
  2. Select one or more target zips.
  3. Choose categories to copy.
  4. Preview matched source and target files by category.
  5. Generate downloads.
- Show warnings when:
  - A selected category has no source matches.
  - A selected category has no matching target files.
  - A target zip appears to have a different folder shape than the source.
- Keep all selected files local to the browser; the component should not call server routes.

Acceptance checks:

- Admin can complete the workflow without leaving `/admin`.
- The UI makes it clear which files/categories will be affected before generating output.
- The UI does not claim this is official ProPresenter sync.
- The tool is not visible outside the existing admin-only page.

## Phase 4: Output And Backup Packaging

Goal: make the generated files safe to apply manually.

Tasks:

- For each target zip, generate:
  - The untouched original target zip.
  - A patched target zip with selected settings copied from the source.
- Use predictable filenames:
  - Original backup: `<target-name>-backup-original.zip`
  - Patched output: `<target-name>-with-copied-settings.zip`
- Include concise on-screen restore/apply guidance:
  - Quit ProPresenter before replacing workspace/support files.
  - Keep the backup until the patched workspace has been tested.
  - Reopen ProPresenter and verify screens/looks/macros/etc. before using live.
- Do not auto-delete the user's local files; only avoid persisting files inside the web app.

Acceptance checks:

- Every target produces a backup and patched output.
- The patched output can be unzipped and inspected manually.
- The backup output is byte-equivalent to the original target upload.

## Phase 5: Tests And Verification

Goal: verify the copier behavior before shipping it in the admin panel.

Tasks:

- Add unit tests for path/category matching.
- Add unit tests for zip replacement behavior.
- Add tests for:
  - Selected files are copied.
  - Unselected categories are not copied.
  - Unknown files are preserved.
  - Multiple target zips produce separate outputs.
  - Zero-match categories produce warnings.
- Run project checks:
  - `npm run lint`
  - `npm run build`

Acceptance checks:

- Tests cover the copy behavior without relying on real private ProPresenter files.
- Lint and build pass.
- Manual browser test confirms source/target zips can be selected and outputs downloaded.

## Phase 6: Release Notes And Operator Instructions

Goal: make the feature usable by an admin without extra explanation.

Tasks:

- Add a short usage note near the tool in `/admin`.
- Add a warning that this modifies copied zip contents, not the live ProPresenter workspace.
- Add troubleshooting notes for:
  - No files matched.
  - Output did not change ProPresenter behavior.
  - ProPresenter version changed folder paths.
- Keep wording practical and brief; avoid turning the admin panel into a long documentation page.

Acceptance checks:

- An admin can understand the workflow from the UI.
- Failure states explain what to inspect next.
- The implementation remains reversible because backups are always generated.

## Implementation Defaults

- Process files client-side only.
- Do not add Supabase schema changes for v1.
- Do not add API routes for zip processing.
- Keep the first version conservative: prefer fewer supported categories with reliable matching over broad matching that may overwrite unrelated support files.
- If ProPresenter file paths differ by version, expose matched-file previews rather than hardcoding assumptions invisibly.

## Implementation Notes (Phase 1 — observed file mapping)

These notes record what was actually observed in a ProPresenter 7 "sync"
folder so the matchers can stay conservative and version changes are easy to
spot. ProPresenter writes its synced workspace settings into a top-level
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
| Looks | `Configuration/Looks` | low | **No `Looks` file existed** in the sampled version, so this usually reports "no match." Kept as a best-guess matcher; verify via the preview. |
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

### macOS zip noise

Zips created on macOS include `__MACOSX/…/._<name>` AppleDouble resource forks
and `.DS_Store` files. These are never matched, never modified, and excluded
from the folder-shape comparison.

### Behavior and limits

- **Replace-only.** A category copies only when both the source and the target
  contain its file. If the source has it but the target does not, it is skipped
  with a warning (the tool never invents a path in the target).
- **Version dependence.** Filenames can change between ProPresenter versions.
  When a category shows no match, the preview names the file it looked for so an
  operator can verify against a fresh export.

### Where the code lives

- `src/lib/propresenter/categories.ts` — category catalog, path matching, copy
  planning, output naming (pure; unit-tested).
- `src/lib/propresenter/zip.ts` — fflate read/write + `overwriteEntries` (pure
  copy primitive; unit-tested).
- `src/lib/propresenter/copier.ts` — browser File/Blob glue used by the UI.
- `src/components/admin/propresenter-copier.tsx` — the admin workflow UI.
- Tests: `src/lib/propresenter/*.test.ts` (run with `npm test`).
