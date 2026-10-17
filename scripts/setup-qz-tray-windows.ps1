# Configures this Windows computer as a valid target for Catchy's "Print to Xprinter"
# feature - installs QZ Tray (the local print bridge) if needed and trusts Catchy's
# signing certificate, so the label printer connected to *this* machine can be printed
# to directly from the Catchy admin dashboard in any browser.
#
# Run this on whichever Windows computer the Xprinter (or any future receipt/label
# printer) is physically connected to - it is not tied to any specific machine.
#
# This script is fully self-contained (the certificate is embedded below) - it does
# NOT need the rest of the Catchy project present. Copy just this file (and its
# setup-qz-tray-windows.bat launcher, if using that) to any Windows computer and run it.
#
# Usage:  powershell -ExecutionPolicy Bypass -File setup-qz-tray-windows.ps1
#     or: double-click setup-qz-tray-windows.bat
#
# Safe to re-run - every step is idempotent (skips work that's already done).

$ErrorActionPreference = 'Stop'

# Catchy's public signing certificate (not secret - this is what gets installed on
# print-bridge machines so QZ Tray trusts requests signed by Catchy's server; the
# matching private key never leaves the server). Embedded directly so this script
# has zero dependency on the rest of the project being present on this computer.
$CertContent = @'
-----BEGIN CERTIFICATE-----
MIIC9DCCAdygAwIBAgIBATANBgkqhkiG9w0BAQsFADAuMRswGQYDVQQDExJDYXRj
aHkgUE9TIFFaIFRyYXkxDzANBgNVBAoTBkNhdGNoeTAeFw0yNjA5MDUxMDUzNDVa
Fw00MTA5MDUxMDUzNDVaMC4xGzAZBgNVBAMTEkNhdGNoeSBQT1MgUVogVHJheTEP
MA0GA1UEChMGQ2F0Y2h5MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA
i7GF349iKGF32HHHxhqRSZqQBjECVP3771ffDjvga/+UsMzLBLBWtWwCqJMVnD8x
U6K8sxMFagdyhvcAkZOoNUc+2eZuXaeHRp+wHuN7xAL4UZywFlDeijmZLuSO/q8F
y25d5Iw7VlJDvk3ppR/1OCCdo5bplTcErJuD512nKBa1NR2pUqQLGwJnstacDNDB
uWqmSK3X5iplB+7bxITFr+iJlygpBShDnGqVzFa97dwbHMwuU/Mu9p9b3qioFVzh
K1WAtMu/r10Z7ihI6/JQc1osTWtyQpQ8+D261nFo/0ZdNracSi+NTLrM31kGQWe0
e06zB2WuFtPw2zDeRfoSOQIDAQABox0wGzAMBgNVHRMEBTADAQH/MAsGA1UdDwQE
AwIBhjANBgkqhkiG9w0BAQsFAAOCAQEAM94xnNMy9LWkNEgoV5wQQ57Br0Dqf+2Z
ADKbpx4KtkuNF9H1/2QwK37wKI8PELH7RM0y0Ypw4mzIpHXAHN516BYNHlmXvS3V
76a+1h+Q02rhwQiWJk62TidqdVQtrgSYAIRStigbzJ0hvd1wDXcdnJKW7nFrniBx
0OLsZ52k2EIouYNdbXLhpT4Rdl+71rXx8BUNsEXSszyBN/3PqC0Lvw9VmvcvgUmw
kXFnIPGEMIQHK1PuH0SBMqELhbO9ekME+RXdPOQykKjLzEptkC31oERJuVVwEG4Q
PG0p1mG2UTalSNRm1ubuuEHeF+q7WbKD1I7NQuEWXjnYF4Ju+d7Wjg==
-----END CERTIFICATE-----
'@

$QzInstallDir = 'C:\Program Files\QZ Tray'
$QzExe = Join-Path $QzInstallDir 'qz-tray.exe'
$QzProperties = Join-Path $QzInstallDir 'qz-tray.properties'
$QzCertDest = Join-Path $QzInstallDir 'catchy-certificate.crt'
$QzVersion = '2.2.6'
$QzInstallerUrl = "https://github.com/qzind/tray/releases/download/v$QzVersion/qz-tray-$QzVersion-x86_64.exe"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "    NOTE: $msg" -ForegroundColor Yellow }

# ---- Self-elevate if needed (editing qz-tray.properties requires admin) ----
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "This step needs administrator rights. A Windows permission prompt will appear - click Yes." -ForegroundColor Yellow
  $scriptPath = $MyInvocation.MyCommand.Path
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath)
  Start-Process powershell -Verb RunAs -ArgumentList $argList -Wait
  exit
}

# ---- Step 1: Install QZ Tray if not already present ----
Write-Step "Checking for QZ Tray..."
if (Test-Path $QzExe) {
  Write-Ok "QZ Tray is already installed at $QzInstallDir"
}
else {
  Write-Host "    Not found - downloading the official installer (v$QzVersion) from GitHub..."
  $installerPath = Join-Path $env:TEMP "qz-tray-$QzVersion-x86_64.exe"
  Invoke-WebRequest -Uri $QzInstallerUrl -OutFile $installerPath
  Write-Host "    Installing silently..."
  Start-Process -FilePath $installerPath -ArgumentList '/S' -Wait
  Start-Sleep -Seconds 2
  if (-not (Test-Path $QzExe)) {
    Write-Error "QZ Tray install did not complete - $QzExe still not found."
  }
  Write-Ok "QZ Tray installed."
}

# ---- Step 2: Trust Catchy's certificate ----
Write-Step "Configuring the trusted certificate..."
Set-Content -Path $QzCertDest -Value $CertContent -Encoding ascii -NoNewline
Write-Ok "Wrote certificate to $QzCertDest"

if (Test-Path $QzProperties) {
  $existing = Get-Content $QzProperties -Raw
} else {
  $existing = ''
}
# qz-tray.properties escapes paths Java-properties-style: '\' -> '\\', ':' -> '\:'.
$escapedPath = $QzCertDest -replace '\\', '\\' -replace ':', '\:'
$overrideLine = "authcert.override=$escapedPath"
if ($existing -match 'authcert\.override\s*=') {
  # Replace an existing (possibly stale/wrong-path) override line rather than duplicating it.
  $updated = ($existing -split "`r?`n" | ForEach-Object {
    if ($_ -match '^authcert\.override\s*=') { $overrideLine } else { $_ }
  }) -join "`r`n"
  Set-Content -Path $QzProperties -Value $updated -Encoding utf8
  Write-Ok "Updated existing authcert.override entry in qz-tray.properties"
} else {
  Add-Content -Path $QzProperties -Value $overrideLine
  Write-Ok "Added authcert.override entry to qz-tray.properties"
}

# ---- Step 3: Restart QZ Tray so the change takes effect ----
# QZ Tray's launcher (qz-tray.exe) hands off to a bundled "javaw.exe" runtime process
# that keeps running afterward - killing only "qz-tray" misses the actual running
# process entirely, so the old (unconfigured) instance would keep running.
Write-Step "Restarting QZ Tray..."
Get-Process -Name 'qz-tray', 'qz-tray-console' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name 'javaw' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$QzInstallDir*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-Process -FilePath $QzExe
Start-Sleep -Seconds 3
$running = Get-Process -Name 'javaw' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$QzInstallDir*" }
if ($running) {
  Write-Ok "QZ Tray is running (PID $($running.Id))."
} else {
  Write-Warn2 "Could not confirm QZ Tray is running - check the system tray manually."
}

Write-Host "`nDone. This computer can now be used as the Xprinter's print bridge." -ForegroundColor Cyan
Write-Host "Plug the Xprinter into this machine's USB port, open Catchy's admin dashboard in a browser HERE, and 'Print to Xprinter' should work." -ForegroundColor Cyan
