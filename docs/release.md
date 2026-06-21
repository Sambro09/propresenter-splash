# Internal macOS Release

Use this checklist for the signed internal release described in `docs/spec.md`.

## Prerequisites

- Apple Developer Program membership.
- Developer ID Application certificate installed in the release keychain. Apple Development
  certificates are not valid for Developer ID notarization.
- Notarization credentials supplied through one of electron-builder's supported environment
  variable sets:
  - `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
  - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
  - `APPLE_KEYCHAIN`, `APPLE_KEYCHAIN_PROFILE`

The app is intentionally not sandboxed because it reads ProPresenter support files and
preferences from the user's home folder.

## Build

```sh
npm ci
npm run dist
```

Expected artifacts:

- `dist/ProPresenter-Workspace-Launcher-0.1.0-arm64.dmg`
- `dist/ProPresenter-Workspace-Launcher-0.1.0-arm64.zip`
- `dist/latest-mac.yml`

To publish the signed/notarized artifacts to GitHub Releases for auto-update:

```sh
GH_TOKEN=<token with repo release access> npm run release
```

For local packaging validation without signing or notarization:

```sh
npm run build
npx electron-builder --mac --dir --config.mac.notarize=false --config.mac.identity=null
```

## CI Release

The GitHub Actions workflow in `.github/workflows/release-macos.yml` runs on `workflow_dispatch`
or `v*` tags. It publishes to GitHub Releases, which is also the app's auto-update feed.
Configure these repository secrets before running it:

- `MACOS_CERTIFICATE_BASE64`
- `MACOS_CERTIFICATE_PASSWORD`
- `APPLE_API_KEY_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

`MACOS_CERTIFICATE_BASE64` should be a base64-encoded Developer ID Application certificate
exported as a `.p12` file. `APPLE_API_KEY_BASE64` should be a base64-encoded App Store
Connect `.p8` key file; the workflow writes it to a temporary file and exposes that path as
`APPLE_API_KEY` for electron-builder.

The workflow uses the built-in `GITHUB_TOKEN` as `GH_TOKEN` for electron-builder publishing.

## Verify

Replace the app path if building a universal or x64 artifact.

```sh
codesign --verify --deep --strict --verbose=2 "dist/mac-arm64/ProPresenter Workspace Launcher.app"
spctl -a -vvv --type execute "dist/mac-arm64/ProPresenter Workspace Launcher.app"
xcrun stapler validate "dist/mac-arm64/ProPresenter Workspace Launcher.app"
```

Before installing on church machines, verify the v1 acceptance criteria on a Mac with
ProPresenter 21 installed and at least two workspaces:

- PP closed: list workspaces, mark active, switch, launch into the selected workspace.
- PP running: prompt, quit, switch, relaunch.
- PP running and selected workspace already active: focus ProPresenter without restart.
- ProPresenter missing and no-workspaces states do not crash.

Run the broader public-release matrix in `docs/testing-matrix.md` before widening distribution.
