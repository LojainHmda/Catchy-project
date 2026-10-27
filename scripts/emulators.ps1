# Starts ONLY the local Firebase Auth + Firestore emulators (and the local
# Emulator UI) for the offline demo project "demo-catchy". Does not start the app.
#
# Safety:
#   - `--project demo-catchy`: a demo-* project never reaches real Firebase
#     services. .firebaserc (catchy-496207) is never used by this script.
#   - Uses the emulator binaries ALREADY CACHED on this machine and refuses to
#     start if they are missing, so nothing is downloaded.
#     NOTE: this CLI (firebase-tools 13.35.1) was built against Firestore
#     emulator 1.19.8 / UI 1.14.0; the cache holds 1.22.0 / 1.15.0. The override
#     below uses the cached ones - confirm they work in the first approved session.
#   - Catchy's DEDICATED ports, all on 127.0.0.1 (firebase.json -> "emulators"):
#     Firestore 8180 (WebSocket 9160), Auth 9199, UI 4100, hub 4410, logging 4510 -
#     never Firebase's defaults, which another project's suite may be using.
#   - Refuses to start if any dedicated port is already taken (checked from the OS
#     port table - nothing is contacted), after the offline config preflight.
#   - No credentials: GOOGLE_APPLICATION_CREDENTIALS is cleared for this process.
#
# Usage:  npm run emulators      (stop with Ctrl+C; all emulator data is discarded)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot

$cache = Join-Path $env:USERPROFILE '.cache\firebase\emulators'
$firestoreJar = Join-Path $cache 'cloud-firestore-emulator-v1.22.0.jar'
$uiServer = Join-Path $cache 'ui-v1.15.0\server\server.mjs'
$firebaseCli = Join-Path $RepoRoot 'node_modules\.bin\firebase.cmd'

foreach ($required in @($firestoreJar, $uiServer, $firebaseCli)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required local file not found: $required. Refusing to start (it would otherwise be downloaded)."
  }
}

& node scripts/emulator/preflight.mjs
if ($LASTEXITCODE -ne 0) { throw 'Emulator configuration preflight failed - not starting.' }

$dedicated = @(8180, 9160, 9199, 4100, 4410, 4510)
$busy = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $dedicated -contains $_.LocalPort } | Select-Object -ExpandProperty LocalPort -Unique
if ($busy) { throw "Catchy's dedicated emulator port(s) already in use: $($busy -join ', '). Refusing to start." }

# Use the cached binaries (marked local-only by the CLI: no download).
$env:FIRESTORE_EMULATOR_BINARY_PATH = $firestoreJar
$env:UI_EMULATOR_BINARY_PATH = $uiServer
$env:NO_UPDATE_NOTIFIER = '1'
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue

Write-Host "Starting LOCAL emulators only: project demo-catchy, Firestore 127.0.0.1:8180, Auth 127.0.0.1:9199, UI 127.0.0.1:4100, hub 4410, logging 4510"
& $firebaseCli emulators:start --only auth,firestore --project demo-catchy
exit $LASTEXITCODE
