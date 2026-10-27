# Starts the Catchy dev server in LOCAL EMULATOR MODE (development/testing only).
#
# Fail-closed sequence - any failure stops here, nothing falls back to a real project:
#   1. pins this process to the local emulators and clears any credential path;
#   2. runs the offline config preflight, then POSITIVELY verifies that the
#      emulators on Catchy's dedicated ports are Catchy's own demo-catchy suite
#      (scripts/emulator/verify-identity.mjs) - an open port is not enough;
#   3. starts Vite with `--mode emulator`, which loads .env.emulator; vite.config.ts
#      then re-checks the configuration AND the emulator identity itself
#      (server/lib/emulatorGuard.js, scripts/emulator/identity.mjs), and the browser
#      app re-checks its configuration again (src/lib/emulatorConfig.ts).
#
# Usage:  npm run dev:emulator      (dev server on https://127.0.0.1:3000, this machine only)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot

$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199'
$env:GCLOUD_PROJECT = 'demo-catchy'
$env:GOOGLE_CLOUD_PROJECT = 'demo-catchy'
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
Remove-Item Env:CATCHY_EMULATOR_MODE -ErrorAction SilentlyContinue   # set by vite.config.ts after its checks

& node scripts/emulator/preflight.mjs
if ($LASTEXITCODE -ne 0) { throw 'Emulator preflight failed - not starting the app.' }

& node scripts/emulator/verify-identity.mjs
if ($LASTEXITCODE -ne 0) { throw "Could not positively verify Catchy's demo-catchy emulators - not starting the app." }

& (Join-Path $RepoRoot 'node_modules\.bin\vite.cmd') --port=3000 --mode emulator
exit $LASTEXITCODE
