# ProPresenter Splash — Specification

> Working title: **ProPresenter Splash** (repo: `propresenter-splash`)
> Status: Draft v0.4 — launcher implemented; future implementation backlog lives in `docs/ROADMAP.md`
> Platform: macOS · Electron · Target app: **ProPresenter 21+**

---

## 1. Summary

A lightweight macOS "splash" app that, on open, lists **every ProPresenter workspace
found on the device** and lets the user click one to **launch ProPresenter directly into
that workspace**.

Today, a volunteer has to open ProPresenter, navigate to **Settings → General → Active
Workspace**, and read/change which workspace is active — easy to get wrong before a
service. This app replaces that flow with a single, obvious picker shown the moment you
sit down at the machine.

---

## 2. Problem & goals

### Problem
- Multiple ministries/services share one machine, each with its own ProPresenter workspace.
- The currently-active workspace is buried in Settings, so people routinely start a service
  in the **wrong** workspace.
- Switching workspaces requires a manual dig through menus and an app restart.

### Goals (v1)
1. Show all workspaces on the device in a clear, clickable list.
2. Make the currently-active workspace obvious at a glance.
3. Launch ProPresenter directly into the selected workspace with one click.
4. Be usable by non-technical volunteers with zero training.

### Non-goals (v1)
- Creating, duplicating, renaming, or deleting workspaces (see §13, future).
- Editing workspace contents (slides, media, playlists).
- Remote control of a running ProPresenter (that is what ProPresenter's own API/Remote is for).
- Windows support (macOS only for v1; see §13 for notes).

---

## 3. Target users & environment

| | |
|---|---|
| **Users** | Church A/V volunteers and staff; mostly non-technical. |
| **Machines** | Church-owned Macs running a current macOS (assume macOS 13 Ventura or later). |
| **App under control** | ProPresenter **21.x** (released Nov 2025; current 21.4 as of Jun 2026). Versioning is now a single major number (… 19, 20, 21). |
| **Install footprint** | A handful of machines per church initially; built for easy future fan-out. |

---

## 4. Decisions (confirmed with stakeholder)

| Decision | Choice |
|---|---|
| **Distribution (v1)** | Internal, **code-signed + notarized** (Apple Developer ID). |
| **Distribution (future)** | **Public distribution** — keep the architecture and packaging ready for it from day one. |
| **ProPresenter already running** | **Prompt** the user in ProPresenter Splash (remind them to save), then close & relaunch into the chosen workspace without requiring ProPresenter's own quit prompt. |
| **v1 feature scope** | **Minimal launcher** — list + click-to-launch. |

---

## 5. Background: how ProPresenter 21 stores workspaces

Findings from research (sources in §16) plus local Phase 0 validation on ProPresenter 21.4.
The active-workspace mechanism is undocumented, so future ProPresenter releases should still be
checked with a version/schema self-check.

- **Workspaces directory (macOS):**
  `~/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces`
  (Default *content* such as libraries/media may also live under `~/Documents/ProPresenter`;
  some installs use a custom/relocated support-files path shown in Settings → General.)
- **App preferences:** `~/Library/Preferences/com.renewedvision.propresenter.plist`
- **Bundle identifier:** `com.renewedvision.propresenter`
- **In-app switching:** Settings → General → **Active Workspace** dropdown → **Manage Workspaces**.
  Switching the active workspace requires ProPresenter to **restart**.
- **No documented CLI flag or URL scheme** exists to boot ProPresenter into a chosen
  workspace.

### The core technical bet
Because there is no public "open workspace X" command, the launcher will boot a specific
workspace by **setting the values ProPresenter reads at startup to decide which workspace is
active, then launching the app.** Phase 0 confirmed this preference-backed mechanism for
ProPresenter 21.4:

- `applicationShowDirectory` stores the selected workspace path.
- `userWorkspaces` stores `NSData` containing a JSON workspace registry; exactly one object
  should have `isActive: true`.

The validated command sequence and local evidence are summarized in §11 and §14.

---

## 6. How "launch into a workspace" works (design)

### Primary approach — set active workspace, then launch
1. **Ensure ProPresenter is fully quit.** (If it owns the prefs/pointer while running, it may
   overwrite our change on exit — so we must write *after* it has terminated.)
2. **Write the active-workspace value** for the chosen workspace:
   - If (A): use `defaults write com.renewedvision.ProPresenter <key> <value>` so the change
     goes through macOS's `cfprefsd` cache (editing the plist bytes directly while `cfprefsd`
     holds a cached copy is unreliable).
   - If (B): atomically rewrite the pointer/manifest file (write-temp-then-rename), preserving
     all other fields.
3. **Launch ProPresenter** (`open -a "ProPresenter"` / by resolved app path).
4. ProPresenter starts in the selected workspace.

> Ordering matters: **quit → wait for full termination → write value → launch.**

### Fallbacks (only if the spike proves the primary approach unreliable)
- **(B-fallback) UI automation:** drive Settings → Manage Workspaces via AppleScript /
  Accessibility API to select the workspace. Brittle, breaks across PP UI changes, needs
  Accessibility (TCC) permission. Last resort.
- **(C-fallback) Advisory mode:** just launch ProPresenter and display the chosen workspace
  name prominently so the user selects it in-app. Always works; lowest value. Acceptable
  degraded mode if A and B both fail.

The spike (§11) decides which approach ships in v1.

---

## 7. Functional requirements (v1)

### Must have
- **FR1 — Discover workspaces.** On launch, scan the workspaces directory and present every
  workspace found, each with a human-readable name.
- **FR2 — Show active workspace.** Indicate which workspace ProPresenter currently considers
  active (directly addresses the "which one am I in?" problem). Derived from the same
  active-workspace value used for launching.
- **FR3 — Launch into selection (PP closed).** Clicking a workspace sets it active and starts
  ProPresenter in it.
- **FR4 — Launch into selection (PP running).** If ProPresenter is running, show a confirmation
  dialog that warns to save work, then close ProPresenter without surfacing its own quit prompt,
  switch, and relaunch.
- **FR5 — No-op fast path.** If the user picks the workspace that is already active **and**
  ProPresenter is already running, just bring ProPresenter to the front (no restart).
- **FR6 — Locate ProPresenter.** Find the ProPresenter app even if not in `/Applications`
  (resolve via bundle id); handle "not installed" gracefully.
- **FR7 — Graceful empty/error states.** Clear messaging when PP isn't installed, no
  workspaces are found, or a required folder is inaccessible.

### Should have (cheap, high value)
- **FR8 — Manual rescan / refresh** button.
- **FR9 — Custom workspace location.** If the standard folder is empty (relocated support
  files), let the user pick the workspaces folder; persist it.

### Won't have (v1)
- Search/filter, last-modified metadata, item counts (first "niceties" add — §13).
- Any workspace mutation (create/duplicate/rename/delete).

---

## 8. UX / UI

A single, frameless, centered window (~480×620), styled like a clean macOS launcher.

```
┌─────────────────────────────────────────┐
│            Choose a Workspace             │
│   ProPresenter is currently: “Sunday AM”  │   ← active indicator (FR2)
├─────────────────────────────────────────┤
│  ● Sunday AM                    (active)  │
│  ○ Spanish Service                        │
│  ○ Youth Night                            │
│  ○ Midweek                                │
│                                           │
│            … scrollable list …            │
├─────────────────────────────────────────┤
│  ↻ Rescan                       v0.1.0    │
└─────────────────────────────────────────┘
```

### Interaction states
- **Scanning** — brief spinner while the folder is read.
- **List** — rows of workspaces; the active one is badged; whole row is the click target.
- **Confirm (PP running)** — modal: *"Save any work first. ProPresenter Splash will close ProPresenter
  and reopen '<name>'."* → **Switch Workspace** / **Cancel**.
- **Launching** — row shows progress ("Quitting ProPresenter…", "Opening '<name>'…").
- **Empty** — "No ProPresenter workspaces found" + expected location + **Choose folder…** (FR9).
- **PP not installed** — message + link to download.
- **Error** — human-readable message + a **Copy details** affordance for support.

### Behavior after a successful launch
The splash window **closes itself** once ProPresenter has been launched (configurable later).
Rationale: it is a launcher, not a persistent dashboard.

---

## 9. Technical architecture

**Stack (recommended):** Electron (latest stable) · TypeScript · Vite · a light renderer UI
(React or Svelte — small surface, either is fine) · `electron-builder` for packaging ·
`electron-store` for app config.

### Process layout
- **Main process (Node):** all filesystem, `child_process`, and app-control logic.
- **Renderer:** presentation only; talks to main over a typed IPC bridge exposed via a
  `contextBridge` preload (context isolation **on**, `nodeIntegration` **off**).

### Main-process modules
| Module | Responsibility |
|---|---|
| `workspaceScanner` | Enumerate workspaces from the workspaces dir (and custom path); resolve display names; return `{ id, name, path }[]`. |
| `activeWorkspace` | Read and write the active-workspace value (approach A or B from §5/§6). Single source of truth for FR2 + FR3. |
| `proPresenterController` | Locate the app (by bundle id), detect running state, quit gracefully (with termination wait/poll + timeout), and launch. |
| `ipc` | Typed handlers: `listWorkspaces`, `getActive`, `selectWorkspace(id)`, `rescan`, `chooseWorkspacesFolder`. |
| `config` | Persisted settings (custom workspace path, future prefs) via `electron-store`. |

### Key sequences
**Select workspace (happy path, PP closed):**
`renderer.selectWorkspace(id)` → controller.isRunning() == false → activeWorkspace.write(id)
→ controller.launch() → renderer shows "Opening…" → window closes.

**Select workspace (PP running):**
isRunning() == true → renderer shows Confirm → on confirm: controller.quit() →
poll until terminated (timeout ~10s) → activeWorkspace.write(id) → controller.launch().

---

## 10. Edge cases & error handling

- ProPresenter **not installed** → empty/installed-check message (FR6).
- **No workspaces** found at standard or configured path → empty state + folder picker (FR9).
- Workspaces folder **inaccessible** (permissions/TCC) → guidance message.
- ProPresenter **fails to close** within timeout → surface error, keep the user in ProPresenter Splash,
  and offer Retry.
- Selected workspace **deleted between scan and click** → re-scan and show error.
- **Multiple ProPresenter installs** / non-standard install path → resolve via bundle id;
  if ambiguous, pick the running one or the newest.
- Picking the **already-active** workspace while PP is **running** → just focus PP (FR5).
- **Write fails** (active-workspace value can't be set) → abort launch, explain, do not launch
  into the wrong workspace silently.
- macOS preference **caching** (`cfprefsd`) → always write via `defaults`/proper API, never
  raw plist bytes, and only while PP is closed.

---

## 11. Phased plan & milestones

### Phase 0 — Discovery spike *(completed 2026-06-21)*
Goal: nail down the undocumented mechanics. Findings are captured in this spec.
- Inventoried `…/RenewedVision/ProPresenter/UserWorkspaces` and confirmed workspace names map
  to local workspace folders.
- Confirmed ProPresenter 21.4 uses preference domain `com.renewedvision.propresenter`.
- Confirmed external switching requires writing both `applicationShowDirectory` and
  `userWorkspaces`.
- Verified ProPresenter **reads** the externally written value at launch and does not revert it
  on quit.
- Restored the test machine to its original active workspace after validation.

### Phase 1 — MVP launcher (PP-closed path) *(completed 2026-06-21)*
Scan → list → show active (FR1, FR2) → set active + launch when PP is closed (FR3, FR6, FR7).

### Phase 2 — Running-PP handling *(implemented)*
Detect running PP, confirm dialog, graceful quit + relaunch, fast-path focus (FR4, FR5).

### Phase 3 — Hardening *(implemented)*
Error/empty states, custom workspace folder (FR8, FR9), polish, basic logging for support.

### Phase 4 — Packaging & internal release *(configured; credential-gated)*
Code-sign (Developer ID) + notarize + staple; entitlements; signed DMG/zip; install on church
machines.

### Phase 5 — Public-distribution readiness *(scaffolded)*
Auto-update (`electron-updater` + release feed), broader macOS/PP-version testing, crash/usage
diagnostics, support docs, and the "niceties"/management features in §13.

---

## 12. Security, permissions & packaging

### macOS permissions
- Reading `~/Library/Application Support/RenewedVision/…` and `~/Library/Preferences/…` is in
  the user's own home — fine for a **non-sandboxed**, notarized, hardened-runtime app.
- **Hardened runtime** is required for notarization. Apple Events are only used for locate/focus
  fallback paths; the workspace-switch quit path uses process detection/termination to avoid
  ProPresenter's own quit prompt.
- **Do not sandbox** for direct distribution: a sandboxed app cannot read another app's prefs/
  support files. (This is why **Mac App Store is a poor fit** — see §13.)

### Signing & notarization
- `electron-builder` mac target (dmg + zip), **Developer ID Application** certificate,
  hardened runtime, notarize via `notarytool`, then **staple**.
- Entitlements file checked into the repo; secrets (App Store Connect API key / Apple ID app
  password) supplied via CI env, never committed.

### Future public distribution
- Ship updates via `electron-updater` against a hosted release feed (e.g. GitHub Releases or
  S3). Build the update channel in early so v1 installs can self-update later.

---

## 13. Future enhancements (explicitly out of v1)

- **Niceties:** search/filter, last-used highlight, per-workspace metadata (last modified,
  library/playlist counts).
- **Management:** create, duplicate, rename, delete workspaces from the app.
- **Tutorial / onboarding:** first-run guidance for volunteers and admins, including how to
  choose a workspace, switch from the menu-bar item, and recover when ProPresenter is minimized.
- **ProPresenter sync support:** make multi-Mac workspace sync easier to understand and verify
  alongside ProPresenter's built-in sync workflow.
- **Auto-launch most recent** option / configurable post-launch behavior (keep splash open).
- **Windows support:** workspaces live at `%AppData%\RenewedVision\ProPresenter\LocalWorkspaces`;
  the launch mechanism would need its own spike (registry/config + process control).
- **Branding:** church logo/name on the splash.
- **Distribution note:** prefer **direct download + notarization**, not the **Mac App Store**,
  because App Store sandboxing blocks reading ProPresenter's data.

---

## 14. Risks & open questions

| Risk | Impact | Mitigation |
|---|---|---|
| Active-workspace mechanism is undocumented | **High** — it's the core feature | Phase 0 spike before committing to v1; documented fallbacks (§6). |
| PP 21.x patch changes the key/pointer/layout | Medium | Centralize all PP-specific knowledge in `activeWorkspace`/`workspaceScanner`; add a self-check on launch; pin tested PP versions. |
| PP overwrites our value on quit | Medium | Always write only after PP fully terminates. |
| `cfprefsd` caching corrupts writes | Medium | Use `defaults`/API, never raw plist edits; write with PP closed. |
| Relocated/cloud-synced data locations | Medium | Custom-folder setting (FR9); detect common cloud paths. |
| Notarization/TCC friction for volunteers | Low–Med | Proper Developer ID signing + notarization from v1; clear first-run consent copy. |

**Open questions (resolved by the spike unless noted):**
1. Approach **(A) plist key** or **(B) pointer file** — and the exact key/field name?
2. Source of each workspace's **display name** (folder name vs. manifest)?
3. Does PP **re-read** the active workspace at every launch?
4. For v1, is targeting only the **standard** workspaces location acceptable (custom path as
   FR9 fallback)? *(Proposed: yes.)*

---

## 15. Acceptance criteria (v1)

- **AC1.** With PP 21 installed, ≥2 workspaces, and PP **closed**: opening the app lists all
  workspaces and marks the active one; clicking one launches PP into **exactly** that workspace
  (verified by PP's Active Workspace).
- **AC2.** With PP **running**: clicking a different workspace prompts the user inside the
  ProPresenter Splash, then closes and relaunches PP into the chosen workspace without an extra ProPresenter
  quit prompt.
- **AC3.** Clicking the already-active workspace while PP is running just focuses PP (no restart).
- **AC4.** PP-not-installed and no-workspaces-found show clear, non-crashing states.
- **AC5.** The shipped build is signed + notarized and opens on a clean church Mac without
  Gatekeeper warnings.

---

## 16. Sources

- [ProPresenter Preferences / Interface Overview](https://www.renewedvision.com/tutorials/propresenter-interface-overview?95cb428b_page=2)
- [Understanding the ProPresenter User Interface (Active Workspace, Manage Workspaces)](https://support.renewedvision.com/hc/en-us/articles/360041345954-Understanding-The-ProPresenter-User-Interface)
- [How to Prevent ProPresenter Files from Syncing to Cloud Services (data locations)](https://support.renewedvision.com/hc/en-us/articles/45416857033363-How-to-Prevent-ProPresenter-Files-from-Syncing-to-Cloud-Services)
- [Syncing Between Computers with ProPresenter](https://support.renewedvision.com/hc/en-us/articles/360041588774-Syncing-Between-Computers-with-ProPresenter)
- [Uninstalling ProPresenter on Mac (preferences plist & support paths)](https://support.renewedvision.com/hc/en-us/articles/360041880473-Uninstalling-ProPresenter-on-Mac)
- [ProPresenter release notes / versions](https://renewedvision.com/propresenter/release-notes/)
- [ProPresenter download / get started](https://www.renewedvision.com/propresenter/download)
- [GreyShirtGuy — ProPresenter 7 file format deep-dive (background on on-disk data)](https://greyshirtguy.com/blog/propresenter-7-file-format-part-2/)
