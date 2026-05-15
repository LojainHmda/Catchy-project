# Map emulator localhost -> host Vite port (run after Android emulator is booted).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/reverse-android-dev.ps1 [-Port 3000]
param([int]$Port = 3000)

$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
  Write-Error "adb not found at $adb — install Android SDK platform-tools or set ANDROID_HOME."
}

& $adb reverse "tcp:$Port" "tcp:$Port"
if ($LASTEXITCODE -ne 0) {
  Write-Warning "adb reverse failed. Start an emulator (or connect a device), then run again."
  exit $LASTEXITCODE
}

Write-Host "OK: emulator http://127.0.0.1:$Port/ now forwards to this PC's port $Port"
Write-Host "Open Chrome in the emulator to: http://127.0.0.1:$Port/"
