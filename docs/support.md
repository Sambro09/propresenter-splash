# Support Guide

Use this for first-line support on installed church machines.

## What To Ask For

Ask the user to open ProPresenter Splash and use **Copy details** from any visible error. The copied
details include:

- Workspace root
- Active workspace
- ProPresenter install path
- ProPresenter running state
- Visible ProPresenter Splash errors
- Workspace list
- Support log path

The support log is stored in Electron's app data folder as `propresenter-splash.log`. It contains
local diagnostic events only. ProPresenter Splash does not send telemetry or crash reports to a
remote server.

## Common Cases

### ProPresenter Not Found

Confirm ProPresenter is installed and opens normally. ProPresenter Splash resolves ProPresenter by
bundle identifier, then searches common install paths and Spotlight results.

### No Workspaces Found

Confirm the workspace folder exists. The default is:

```text
~/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces
```

If the church relocated ProPresenter support files, use **Choose folder** in ProPresenter Splash
and select the relocated `UserWorkspaces` folder.

### ProPresenter Will Not Quit

ProPresenter Splash asks the operator to save work first, then sends ProPresenter a normal
termination signal so ProPresenter's own extra quit confirmation does not block the workspace
switch. If ProPresenter Splash still reports that ProPresenter did not quit, ask the operator to
quit ProPresenter manually and retry the workspace launch.

### Workspace Switch Fails

Do not launch ProPresenter manually until the copied support details have been saved. A switch
failure usually means the selected folder was deleted, the `userWorkspaces` preference is
missing/malformed, or macOS blocked preference access.

## Privacy

ProPresenter Splash records local logs for support. It does not collect usage analytics, upload
crash reports, or send workspace names/paths to a remote service.
