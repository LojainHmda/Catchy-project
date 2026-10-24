# Restores .env and .env.local byte-for-byte from the backup created by
# kartacagenai-env-swap.ps1 (stored outside the repo under %LOCALAPPDATA%\CatchyEnvSwap).
# Run this after the kartacagenai build / Cloud Build upload, to put catchy-496207's own
# values back for normal local dev / catchy-496207 deploys.
#
# Every restored file is SHA-256-verified against the hash recorded before the swap.
# The backup is deleted only if ALL files verify; otherwise it is kept and the script
# exits with an error.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/kartacagenai-env-restore.ps1

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$BackupDir = Join-Path $env:LOCALAPPDATA 'CatchyEnvSwap'
$ManifestPath = Join-Path $BackupDir 'manifest.json'

if (-not (Test-Path -LiteralPath $ManifestPath)) {
  throw "No swap manifest found at $ManifestPath -- nothing to restore."
}
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json

# Check every backup is intact before touching any target.
foreach ($f in $manifest.files) {
  if (-not (Test-Path -LiteralPath $f.backup)) { throw "Backup for $($f.name) is missing at $($f.backup). Nothing was restored." }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $f.backup).Hash -ne $f.sha256) {
    throw "Backup for $($f.name) does not match its recorded hash. Nothing was restored."
  }
}

$failed = @()
foreach ($f in $manifest.files) {
  try {
    if ((Test-Path -LiteralPath $f.target) -and (Get-FileHash -Algorithm SHA256 -LiteralPath $f.target).Hash -eq $f.sha256) {
      Write-Host "$($f.name) already matches the original (SHA-256 verified)."
      continue
    }
    Copy-Item -LiteralPath $f.backup -Destination $f.target -Force
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $f.target).Hash -ne $f.sha256) { $failed += $f.name }
    else { Write-Host "Restored $($f.name) (SHA-256 verified)." }
  }
  catch { $failed += $f.name }
}

if ($failed.Count -gt 0) {
  throw "Restore verification failed for: $($failed -join ', '). Backup kept at $BackupDir."
}

Remove-Item -LiteralPath $BackupDir -Recurse -Force
Write-Host "All files restored exactly; backup folder removed."
