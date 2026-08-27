# ProPresenter Splash

ProPresenter Splash is a macOS launcher for shared presentation Macs. It lets an operator choose
the correct ProPresenter workspace before ProPresenter opens.

The app can discover workspaces, switch the active ProPresenter workspace, keep common choices
pinned and ordered, and provide a menu-bar control while ProPresenter runs.

## Requirements

- macOS 13 or later
- ProPresenter 21.4 for the currently tested workspace preference contract

Download signed builds from [GitHub Releases](https://github.com/Sambro09/propresenter-splash/releases).

## Automatic updates

Packaged builds check the public GitHub release feed after startup and every six hours. The app
downloads a newer signed release in the background and installs it when ProPresenter Splash quits.
The release must include `latest-mac.yml`, the macOS ZIP, and its blockmap.

The first public release creates the update feed. To test a new release, install the previous
signed version, publish the new version, open the old version, and confirm the update in the local
app log.

## Development

Install Node.js 22, then run:

```sh
npm ci
npm test
npm run dev
```

Use `npm run build` for a production compile. Use `npm run dist` to create local macOS artifacts
without publishing them.

## Release process

1. Update the version in `package.json` and `package-lock.json`.
2. Merge the release commit into `main`.
3. Create and push a matching tag, such as `v0.2.0`.
4. Check the **Release macOS** workflow in GitHub Actions.

The workflow accepts only a tag whose version matches `package.json` and whose commit is on
`main`. It runs the tests, builds a universal app, signs and notarizes it, checks the update
manifest, and publishes a GitHub release only after those checks pass.

Repository administrators must configure these GitHub Actions secrets:

- `MACOS_CERTIFICATE_BASE64`
- `MACOS_CERTIFICATE_PASSWORD`
- `APPLE_API_KEY_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

See [the roadmap](docs/ROADMAP.md) for planned work and [the product specification](docs/spec.md)
for the current behavior.
