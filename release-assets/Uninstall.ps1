# Removes Strava Screensaver for the current user. Your Strava data folder is left in place.
$dest = Join-Path $env:LOCALAPPDATA 'StravaScreensaver'
Get-Process | Where-Object { $_.Path -and $_.Path -like "$dest*" } | Stop-Process -Force -ErrorAction SilentlyContinue
$key = 'HKCU:\Control Panel\Desktop'
$cur = (Get-ItemProperty $key).'SCRNSAVE.EXE'
if ($cur -and $cur -like "$dest*") {
  Remove-ItemProperty $key 'SCRNSAVE.EXE' -ErrorAction SilentlyContinue
  Set-ItemProperty $key 'ScreenSaveActive' '0'
  rundll32.exe user32.dll,UpdatePerUserSystemParameters
}
foreach ($n in 'StravaWallpaperServer.lnk', 'StravaWallpaperRefresh.lnk') { Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) $n) -ErrorAction SilentlyContinue }
Start-Sleep 1
Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Uninstalled. To also delete saved Strava credentials and runs, remove %APPDATA%\strava-screensaver'
