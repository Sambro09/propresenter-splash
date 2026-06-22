# Claude Design link

This folder links the launcher UI to a **Claude Design** design-system project so
the UI can be designed/iterated at claude.ai/design.

- **Project:** ProPresenter Launcher
- **Project ID:** `fa0cc3ee-fb75-4b6c-a51d-e4bbd0b34b4b`

## How it works

`build-bundle.mjs` reads the launcher's real `src/renderer/src/styles.css` and emits
self-contained preview cards into `out/`. Each card's first line is a
`<!-- @dsCard group="..." -->` marker, which the Design System pane uses to index cards.
Because the previews use the **actual** CSS + class names, design changes map straight
back to `styles.css` / `App.tsx`.

## Update the design system after a UI change

```bash
node design/build-bundle.mjs   # rebuild out/ from the live CSS
```

Then re-sync with the DesignSync tool (ask Claude: "sync the design bundle"):
`finalize_plan` (localDir = `design/out`) -> `write_files`.

## Cards

| Group       | Card                         |
| ----------- | ---------------------------- |
| Foundations | Color tokens                 |
| Components  | Toolbar + status             |
| Components  | Workspace rows (all states)  |
| Components  | Buttons                      |
| Components  | Banners (warn/error/info/success) |
| Components  | Edit-mode bar                |
| Components  | Confirm switch dialog        |
| Components  | Workspace editor dialog      |
| States      | Empty / loading / error      |
| Screens     | Launcher — full window       |
