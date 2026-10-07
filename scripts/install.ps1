# Sets the built .scr as the current user's screensaver (HKCU only, no admin needed).
param(
  [string]$Scr = (Join-Path $PSScriptRoot '..\dist\StravaScreensaver-win32-x64\StravaScreensaver.scr'),
  [int]$TimeoutMinutes = 5
)
$Scr = (Resolve-Path $Scr).Path
$key = 'HKCU:\Control Panel\Desktop'
Set-ItemProperty -Path $key -Name 'SCRNSAVE.EXE' -Value $Scr
Set-ItemProperty -Path $key -Name 'ScreenSaveActive' -Value '1'
Set-ItemProperty -Path $key -Name 'ScreenSaveTimeOut' -Value ([string]($TimeoutMinutes * 60))
rundll32.exe user32.dll,UpdatePerUserSystemParameters
Write-Host "Screensaver set to $Scr (starts after $TimeoutMinutes min idle)."
Write-Host "Configure it any time by running: `"$Scr`" /c"
