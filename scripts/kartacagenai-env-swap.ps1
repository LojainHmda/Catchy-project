# Temporarily swaps ONLY the six VITE_FIREBASE_* values, sets
# VITE_FIRESTORE_DATABASE_ID=catchy (appended if absent), and blanks GEMINI_API_KEY if
# present, in BOTH .env and .env.local, so the next `npm run build` / Cloud Build upload
# produces a client bundle targeting kartacagenai's own Firebase project and its named
# `catchy` Firestore database instead of catchy-496207's `(default)`.
#
# Why both files: Vite loads .env.local with higher priority than .env, so swapping
# only .env has no effect on a local build. Cloud Build only receives .env
# (.gcloudignore excludes .env.local), so .env must be swapped too.
#
# Safety:
#   - Originals are backed up byte-for-byte OUTSIDE the repo (so the backup can never be
#     included in a Cloud Build source upload) under %LOCALAPPDATA%\CatchyEnvSwap, with
#     a manifest of SHA-256 hashes.
#   - Every other byte of each file (comments, other keys, line endings, BOM) is kept.
#   - If anything fails part-way, the originals are restored and hash-verified before
#     the script exits with an error.
#   - Refuses to run if a previous swap has not been restored yet.
#
# Pair with kartacagenai-env-restore.ps1. This script does NOT deploy anything.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/kartacagenai-env-swap.ps1

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackupDir = Join-Path $env:LOCALAPPDATA 'CatchyEnvSwap'
$ManifestPath = Join-Path $BackupDir 'manifest.json'
$TargetNames = @('.env', '.env.local')

$KartacagenaiOverrides = [ordered]@{
  "VITE_FIREBASE_API_KEY"             = "AIzaSyCpjeFRRKbiwRf1VnrVcKPHoD74F4jKMtg"
  "VITE_FIREBASE_AUTH_DOMAIN"         = "kartacagenai.firebaseapp.com"
  "VITE_FIREBASE_PROJECT_ID"          = "kartacagenai"
  "VITE_FIREBASE_STORAGE_BUCKET"      = "kartacagenai-catchy-media"
  "VITE_FIREBASE_MESSAGING_SENDER_ID" = "530422771583"
  "VITE_FIREBASE_APP_ID"              = "1:530422771583:web:ec915fdef33e7cd69b344a"
  # kartacagenai's Catchy data lives in the named database `catchy`, not `(default)`.
  # Client build-time only; the Cloud Run service has its own FIRESTORE_DATABASE_ID=catchy.
  "VITE_FIRESTORE_DATABASE_ID"        = "catchy"
}
# Keys that may be absent from the originals; they are appended (restore removes them).
$InsertIfMissing = @('VITE_FIRESTORE_DATABASE_ID')

function Get-Sha256([string]$Path) {
  (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

# Decodes UTF-8 (optionally BOM-prefixed) and proves the round trip is lossless, so
# re-encoding after the edit cannot alter any byte we did not mean to change.
function Read-EnvText([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
  $offset = 0
  if ($hasBom) { $offset = 3 }
  $utf8 = New-Object Text.UTF8Encoding($false, $true)
  $text = $utf8.GetString($bytes, $offset, $bytes.Length - $offset)
  $roundTrip = $utf8.GetBytes($text)
  if ($roundTrip.Length -ne ($bytes.Length - $offset)) { throw "$Path is not losslessly round-trippable as UTF-8." }
  for ($i = 0; $i -lt $roundTrip.Length; $i++) {
    if ($roundTrip[$i] -ne $bytes[$i + $offset]) { throw "$Path is not losslessly round-trippable as UTF-8." }
  }
  return @{ Text = $text; HasBom = $hasBom }
}

function Write-EnvText([string]$Path, [string]$Text, [bool]$HasBom) {
  $utf8 = New-Object Text.UTF8Encoding($false, $true)
  $body = $utf8.GetBytes($Text)
  if ($HasBom) { $body = [byte[]](0xEF, 0xBB, 0xBF) + $body }
  [IO.File]::WriteAllBytes($Path, $body)
}

function Restore-FromBackup($Entries) {
  $failed = @()
  foreach ($e in $Entries) {
    try {
      # Leave untouched files alone (e.g. the write that failed never changed them).
      if ((Test-Path -LiteralPath $e.Target) -and (Get-Sha256 $e.Target) -eq $e.Sha256) { continue }
      Copy-Item -LiteralPath $e.Backup -Destination $e.Target -Force
      if ((Get-Sha256 $e.Target) -ne $e.Sha256) { $failed += $e.Target }
    }
    catch { $failed += $e.Target }
  }
  return $failed
}

# ---- Preconditions (nothing is modified until all of these pass) -------------------

if (Test-Path -LiteralPath $ManifestPath) {
  throw "A previous swap is still active (manifest at $ManifestPath). Run kartacagenai-env-restore.ps1 first."
}
if ((Test-Path -LiteralPath $BackupDir) -and (Get-ChildItem -LiteralPath $BackupDir -Force | Select-Object -First 1)) {
  throw "Backup folder $BackupDir is not empty but has no manifest. Inspect it manually before swapping."
}

# Vite mode files outrank .env/.env.local for `vite build`; if they set Firebase keys
# the swap would silently have no effect.
foreach ($modeFile in @('.env.production', '.env.production.local')) {
  $p = Join-Path $RepoRoot $modeFile
  if ((Test-Path -LiteralPath $p) -and (Select-String -LiteralPath $p -Pattern '^\s*VITE_FIREBASE_' -Quiet)) {
    throw "$modeFile defines VITE_FIREBASE_* keys and would override the swap. Aborting."
  }
}

$plans = @()
foreach ($name in $TargetNames) {
  $path = Join-Path $RepoRoot $name
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing $name at $path" }

  $decoded = Read-EnvText $path
  $text = $decoded.Text
  foreach ($key in $KartacagenaiOverrides.Keys) {
    $pattern = '(?m)^' + [regex]::Escape($key) + '=[^\r\n]*'
    $count = [regex]::Matches($text, $pattern).Count
    $replacement = "$key=" + $KartacagenaiOverrides[$key]
    if ($count -eq 1) {
      $text = [regex]::Replace($text, $pattern, { param($m) $replacement })
    }
    elseif ($count -eq 0 -and $InsertIfMissing -contains $key) {
      $nl = "`n"
      if ($text.Contains("`r`n")) { $nl = "`r`n" }
      if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += $nl }
      $text += $replacement + $nl
    }
    else { throw "$name must contain exactly one $key= line (found $count)." }
  }
  $text = [regex]::Replace($text, '(?m)^GEMINI_API_KEY=[^\r\n]*', 'GEMINI_API_KEY=')

  $plans += @{
    Name    = $name
    Target  = $path
    Backup  = Join-Path $BackupDir ($name.TrimStart('.') + '.orig')
    Sha256  = Get-Sha256 $path
    NewText = $text
    HasBom  = $decoded.HasBom
  }
}

foreach ($v in @($KartacagenaiOverrides.Keys) + 'GEMINI_API_KEY') {
  if (Test-Path -LiteralPath "Env:$v") {
    Write-Warning "Process environment variable $v is set; Vite will prefer it over the .env files."
  }
}

# ---- Back up originals (outside the repo) and verify the copies --------------------

try {
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  foreach ($p in $plans) {
    Copy-Item -LiteralPath $p.Target -Destination $p.Backup -Force
    if ((Get-Sha256 $p.Backup) -ne $p.Sha256) { throw "Backup of $($p.Name) failed hash verification." }
  }
  $manifest = [ordered]@{
    createdUtc = (Get-Date).ToUniversalTime().ToString('o')
    repoRoot   = $RepoRoot
    files      = @($plans | ForEach-Object { [ordered]@{ name = $_.Name; target = $_.Target; backup = $_.Backup; sha256 = $_.Sha256 } })
  }
  [IO.File]::WriteAllText($ManifestPath, ($manifest | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
}
catch {
  # Nothing in the repo has been modified yet; discard the partial backup.
  if (Test-Path -LiteralPath $BackupDir) { Remove-Item -LiteralPath $BackupDir -Recurse -Force }
  throw "Could not create a verified backup; no files were modified. Cause: $_"
}

# ---- Apply the swap; on any failure restore originals exactly ----------------------

try {
  foreach ($p in $plans) {
    Write-EnvText $p.Target $p.NewText $p.HasBom
    $written = Read-EnvText $p.Target
    if ($written.Text -ne $p.NewText) { throw "Verification of swapped $($p.Name) failed." }
    if ($written.Text -notmatch '(?m)^VITE_FIREBASE_PROJECT_ID=kartacagenai\r?$') { throw "Swapped $($p.Name) does not target kartacagenai." }
    if ($written.Text -notmatch '(?m)^VITE_FIRESTORE_DATABASE_ID=catchy\r?$') { throw "Swapped $($p.Name) does not select the 'catchy' database." }
  }
}
catch {
  $err = $_
  Write-Warning "Swap failed: $err -- restoring originals."
  $failed = @(Restore-FromBackup $plans)
  if ($failed.Count -eq 0) {
    Remove-Item -LiteralPath $BackupDir -Recurse -Force
    throw "Swap aborted; originals restored and hash-verified. Cause: $err"
  }
  throw "Swap aborted AND restore failed for: $($failed -join ', '). Originals remain in $BackupDir -- copy them back manually. Cause: $err"
}

Write-Host "Done. .env and .env.local now hold kartacagenai client Firebase config."
Write-Host "Originals saved (hash-verified) in $BackupDir -- run kartacagenai-env-restore.ps1 when finished."
