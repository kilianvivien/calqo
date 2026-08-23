# Releasing Calqo (macOS, Apple Silicon)

Calqo ships one desktop target: **macOS on Apple Silicon (arm64)**. There is no
universal, Intel, Windows, or Linux build, so there is exactly one bundle per
release and one platform key in the updater manifest.

From 0.6.4 the desktop app updates itself. This document covers the one-time
setup, then the per-release routine.

---

## How auto-update works here

1. `tauri build --config src-tauri/tauri.updater.conf.json` produces, next to
   the DMG, an updater bundle `Calqo.app.tar.gz` and a minisign signature
   `Calqo.app.tar.gz.sig`.
2. The release workflow uploads both plus a `latest.json` manifest to the
   GitHub release.
3. The installed app reads
   `https://github.com/kilianvivien/calqo/releases/latest/download/latest.json`,
   compares versions, verifies the signature against the **public key baked into
   `src-tauri/tauri.conf.json`**, then downloads and swaps the app bundle.
4. `tauri-plugin-process` relaunches into the new version.

Two consequences worth remembering:

- **A draft release is invisible to the updater.** GitHub does not serve a
  draft's assets from `releases/latest/download/…`. Publishing the draft is what
  makes an update go live.
- **The private key is the whole security model.** Anyone holding it can push an
  update to every Calqo install. It never enters the repository.

---

## One-time setup

These are the steps that need a human. Everything else is automated.

### 1. Generate the signing keypair

```bash
mkdir -p ~/.tauri
pnpm tauri signer generate -w ~/.tauri/calqo.key
```

Set a password when prompted. (A password is optional, but GitHub does not
accept empty secret values, so an unprotected key means leaving the second
secret below unset.) This writes two single-line base64 files:

- `~/.tauri/calqo.key` — the **private** key. Back it up somewhere safe
  (password manager). Losing it means no existing install can ever be updated
  again; leaking it means anyone can update them.
- `~/.tauri/calqo.key.pub` — the public key.

### 2. Paste the public key into the app config

```bash
cat ~/.tauri/calqo.key.pub
```

Copy the whole content and put it in `src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/kilianvivien/calqo/releases/latest/download/latest.json"
    ],
    "pubkey": "PASTE_THE_CONTENT_OF_calqo.key.pub_HERE"
  }
}
```

`calqo.key.pub` is a single line of base64 — paste it verbatim, with no quotes
around it beyond the JSON string. Commit the result: the public key is meant to
ship inside the app.

Until this field is filled in, `pnpm tauri:build:release` and the Release
workflow both fail outright — the bundler validates the key before it will sign
anything ("failed to decode pubkey: Missing comment in public key"). A plain
`pnpm tauri:build` is unaffected, and an app built that way simply reports that
it was packaged without update signing.

### 3. Add the two GitHub secrets

Repository ▸ Settings ▸ Secrets and variables ▸ Actions ▸ *New repository
secret*:

| Secret name | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | the **entire contents** of `~/.tauri/calqo.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password from step 1 (skip this secret entirely if the key has none) |

```bash
# copy the private key without opening an editor
pbcopy < ~/.tauri/calqo.key
```

No other secrets are needed: `GITHUB_TOKEN` is provided automatically.

That is the entire manual setup. Steps 1–3 happen once, ever.

---

## Cutting a release

1. Bump the version in **three** places — `package.json`,
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.

2. Update the README "Download" line and its release-notes section.

3. Run the checks locally — **this is the gate**, not CI:

   ```bash
   pnpm release:check   # version:check + typecheck + lint + test
   ```

4. Commit, then tag and push:

   ```bash
   git tag v0.6.4
   git push origin main --tags
   ```

5. The **Release** workflow runs on a `macos-14` (arm64) runner and does only
   what a laptop cannot: build with `--features video-toolbox`, sign, and
   create a **draft** release with the DMG, `.app.tar.gz`, `.sig`, and
   `latest.json`.

6. The workflow hard-gates on four things and fails the run if any is wrong:
   - the tag matches all three version files;
   - `plugins.updater.pubkey` is not empty;
   - the binary actually links **AVFoundation** and contains VideoToolbox
     symbols (a build without the native encoder is otherwise
     indistinguishable from a good one);
   - `Calqo.app.tar.gz` **and** its `.sig` exist.

7. Open the draft release, check the notes, and **Publish**. Existing installs
   pick the update up on their next check.

To rebuild a tag that already exists, use the workflow's *Run workflow* button
and pass the tag name.

### Why the test suite is not in CI

macOS runners bill at 10x the Linux rate, and typecheck/lint/test take seconds
on the machine you are already sitting at. The workflow keeps only the checks
that need the built artifact (encoder linkage, signature) or that guard release
metadata, which cost a second or two each. Run `pnpm release:check` before
tagging.

TypeScript is still checked in CI, but as part of the build rather than as an
extra step: `beforeBuildCommand` is `pnpm build`, which is `tsc --noEmit &&
vite build`. A type error therefore still fails the release; ESLint and the
unit suite do not run there at all.

### Building locally

```bash
pnpm tauri:build          # normal local build — no signing key needed
pnpm tauri:build:release  # also emits the signed updater artifacts
```

`tauri:build:release` requires the signing key in the environment:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/calqo.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='…'
pnpm tauri:build:release
```

Releases should normally come from CI so the encoder and signature gates always
run.

---

## Testing the update path

The check compares the running version against the manifest, so you need one
build older than the published release:

1. Publish a release (say `v0.6.4`).
2. Check out the previous tag, build locally with `pnpm tauri:build`, and run
   that app from `/Applications`.
3. Calqo ▸ **Check for Updates…** should offer 0.6.4, download it with a
   progress readout, and offer a restart.

Notes:

- The app must be writable to replace itself. Run the copy from
  `/Applications` or `~/Applications`, not from inside the DMG.
- Because these builds are ad-hoc signed rather than Developer ID signed,
  macOS may re-prompt Gatekeeper after an update on some systems.
- `Skip this version` is remembered in app settings; clear it by choosing
  **Check for Updates…** again, which always reports the newest release.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "packaged without update signing" in Settings ▸ Updates | `pubkey` is still empty in `tauri.conf.json`, or `endpoints` is unreachable |
| Workflow fails at the signature check | `TAURI_SIGNING_PRIVATE_KEY` secret missing or malformed (must be the full file contents) |
| Workflow fails on AVFoundation | the build did not include `--features video-toolbox`, or a stale artifact was picked up |
| App never sees the update | the release is still a draft, or the tag/version metadata disagree |
| Signature verification fails on the client | the public key in the shipped app does not match the private key used by CI — rotating the key only affects builds made *after* the rotation |
