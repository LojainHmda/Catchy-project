# Deploy static Catchy build to Cloud Run (GCP), then publish Firestore rules + indexes to the same project.
# Requires: `.env` at repo root (gitignored) with Firebase + optional Gemini keys — it is uploaded
#   with the source tarball so Cloud Build can run Vite (see `.gcloudignore`).
#
# Firestore step uses Firebase CLI (npx firebase-tools). Use one of:
#   - Same Google account as `gcloud`: run `firebase login` once, OR
#   - CI / non-interactive: set env FIREBASE_TOKEN (create with `firebase login:ci`) and grant that
#     identity Firebase Admin or Firebase Rules Admin on the GCP project.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/deploy-cloud-run.ps1
#         powershell -ExecutionPolicy Bypass -File scripts/deploy-cloud-run.ps1 -SkipFirestore

param(
  [switch]$SkipFirestore
)

$ErrorActionPreference = 'Stop'
$ProjectId = 'catchy-496207'
$Region = 'us-central1'
$Service = 'catchy-web'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$EnvPath = Join-Path $RepoRoot '.env'

if (-not (Test-Path $EnvPath)) {
  Write-Error "Missing .env at $EnvPath"
}

function Get-DotEnvPairs {
  param([string]$Path)
  $allowed = @(
    'GEMINI_API_KEY',
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_ADMIN_EMAIL',
    'VITE_ADMIN_PASSWORD',
    'VITE_OWNER_EMAILS'
  )
  $map = @{}
  $raw = [System.IO.File]::ReadAllText($Path)
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 0xFEFF) { $raw = $raw.Substring(1) }
  foreach ($line in $raw -split "`r?`n") {
    $line = $line.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { continue }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { continue }
    $key = $line.Substring(0, $eq).Trim()
    if ($allowed -notcontains $key) { continue }
    $val = $line.Substring($eq + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    $map[$key] = $val
  }
  return $map
}

$m = Get-DotEnvPairs -Path $EnvPath
$required = @(
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET'
)
foreach ($r in $required) {
  if (-not $m[$r] -or $m[$r] -eq '') { Write-Error "Missing required $r in .env" }
}

Write-Host "Enabling APIs (idempotent)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com `
  firestore.googleapis.com firebaserules.googleapis.com `
  --project $ProjectId | Out-Null

Set-Location $RepoRoot
Write-Host "Building on Cloud Build and deploying $Service to $Region (project $ProjectId)..."
gcloud run deploy $Service `
  --project $ProjectId `
  --region $Region `
  --source . `
  --allow-unauthenticated `
  --quiet

Write-Host "Cloud Run deploy finished."

if (-not $SkipFirestore) {
  Write-Host "Publishing Firestore rules + indexes to project $ProjectId..."
  Set-Location $RepoRoot
  $fbExe = "npx"
  $fbArgs = @(
    "--yes", "firebase-tools@13", "deploy", "--only", "firestore",
    "--project", $ProjectId
  )
  if ($env:FIREBASE_TOKEN -and $env:FIREBASE_TOKEN.Trim().Length -gt 0) {
    $fbArgs += @("--token", $env:FIREBASE_TOKEN.Trim())
  }
  & $fbExe @fbArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Firestore deploy failed (exit $LASTEXITCODE). The Cloud Run app is already live."
    Write-Warning "Fix: run 'firebase login' with a user that has access to $ProjectId, or set FIREBASE_TOKEN from 'firebase login:ci'."
    Write-Warning "GCP IAM: grant Firebase Admin or roles/firebaserules.admin on the project for the account you use."
  }
  else {
    Write-Host "Firestore rules and indexes are published to $ProjectId."
  }
}
else {
  Write-Host "Skipped Firestore deploy (-SkipFirestore)."
}

Write-Host "Done. Add your Cloud Run URL under Firebase Auth → Authorized domains if you use Google sign-in."
