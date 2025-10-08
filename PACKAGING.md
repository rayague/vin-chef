# Packaging notes (better-sqlite3 + Electron)

This document lists recommended steps and tips to package the Electron app that uses `better-sqlite3` native bindings.

1) Why special handling is needed

`better-sqlite3` is a native Node module (C++ bindings). When packaging an Electron app you must ensure the binary is built for the target Electron runtime and platform. This usually requires rebuilding the native modules or installing them in an environment matching the target Electron ABI.

2) Recommended packaging workflow

- Use `electron-builder` or similar tool (we have `electron-builder` in `devDependencies`).
- For CI builds, choose a build matrix or use environment-specific runners (Windows/macOS/Linux) because `better-sqlite3` binaries are platform-specific.

Example build steps (Linux/macOS runner):

- Install Node and pnpm/npm
- Install dependencies (prefer reinstalling native modules per-platform):

```bash
pnpm install --frozen-lockfile
# Or: npm ci
```

- Rebuild native modules for Electron before packaging (recommended):

```bash
# Using electron-rebuild
pnpm add -D electron-rebuild
npx electron-rebuild -f -w better-sqlite3 --arch=x64 --version <electron-version>

# Or with electron-builder's `node-gyp` steps automatically handled
```

- Then run `electron-builder`:

```bash
pnpm run electron:build
# or: pnpm run electron:package
```

3) CI tips

- Use separate CI jobs per platform (GitHub Actions `runs-on` matrix) or use cross-platform builders/services.
- If using GitHub Actions, use `actions/setup-node` and `actions/checkout`, install PNPM and run `pnpm install`.
- Rebuilding native modules in CI is necessary. Use `npx electron-rebuild` or set `npm rebuild` steps.

4) Windows notes

- You may need to install the Windows Build Tools (Visual Studio Build Tools) in the runner/container or use hosted runners that already provide them.
- For signing installers and code, setup code signing certs and configure `electron-builder` accordingly.

5) macOS notes

- You must run `electron-builder` on macOS to produce signed/macOS installers. Use macOS runners for production builds.
- Notarize signed apps via Apple notarization if you plan to distribute outside the App Store.

6) Minimizing rebuild pain

- Use `--build-from-source` for `better-sqlite3` when using `npm rebuild`.
- Cache `node_modules` per runner but be careful: cached native modules may be invalid across platforms.

7) Optional: vendor prebuilt binaries

- For advanced setups you can publish platform-specific prebuilt `better-sqlite3` binaries and download them during CI. This is more complex but can speed up builds.

8) Troubleshooting

- Error: "module did not self-register" → means binary ABI mismatch. Rebuild native modules for the target Electron version.
- Error during packaging complaining about missing symbols → ensure node-gyp build tools are available.

If you want, I can add a `docs/packaging-ci.yml` GitHub Actions example to this repo that demonstrates building for one platform and using `electron-rebuild`.
