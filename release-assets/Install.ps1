# Installs Strava Screensaver for the current user. No admin rights needed.
#   Install.cmd                          live wallpaper folder for Lively (no background process)
#   Install.ps1 -WithWallpaperServer     also run the optional live wallpaper server at login
#   Install.ps1 -WithScreensaver         also set it as your Windows screensaver
param(
  [switch]$WithScreensaver,
  [switch]$WithWallpaperServer,
  [int]$TimeoutMinutes = 5
)
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'app'
if (-not (Test-Path (Join-Path $src 'StravaScreensaver.exe'))) { throw "Run this from the extracted folder (the 'app' folder must sit next to it)." }

$dest = Join-Path $env:LOCALAPPDATA 'StravaScreensaver'
$exe = Join-Path $dest 'StravaScreensaver.exe'
$scr = Join-Path $dest 'StravaScreensaver.scr'

Get-Process | Where-Object { $_.Path -and $_.Path -like "$dest*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1
New-Item -ItemType Directory -Force $dest | Out-Null
robocopy $src $dest /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
# Chromium's sandboxed processes need read access via ALL APPLICATION PACKAGES.
icacls $dest /grant "*S-1-15-2-1:(OI)(CI)(RX)" /T /C | Out-Null
Copy-Item $exe $scr -Force   # a screensaver is an .exe with the .scr extension

if ($WithScreensaver) {
  $key = 'HKCU:\Control Panel\Desktop'
  Set-ItemProperty $key 'SCRNSAVE.EXE' $scr
  Set-ItemProperty $key 'ScreenSaveActive' '1'
  Set-ItemProperty $key 'ScreenSaveTimeOut' ([string]($TimeoutMinutes * 60))
  rundll32.exe user32.dll,UpdatePerUserSystemParameters
  Write-Host "Screensaver set (starts after $TimeoutMinutes minutes idle)."
}

if ($WithWallpaperServer) {
  $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'StravaWallpaperServer.lnk'
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
  $s.TargetPath = $exe
  $s.Arguments = '/w'
  $s.WorkingDirectory = $dest
  $s.WindowStyle = 7
  $s.Save()
  Start-Process $exe -ArgumentList '/w'
  Write-Host 'Wallpaper server started and set to run at login: http://localhost:8765/wallpaper.html'
}

# Quick refresh at login (syncs new runs, rewrites the wallpaper folder, exits after a few seconds).
$rl = Join-Path ([Environment]::GetFolderPath('Startup')) 'StravaWallpaperRefresh.lnk'
$rs = (New-Object -ComObject WScript.Shell).CreateShortcut($rl)
$rs.TargetPath = $exe
$rs.Arguments = '/e'
$rs.WorkingDirectory = $dest
$rs.WindowStyle = 7
$rs.Save()

# Create the static wallpaper folder so it stays up to date after each sync.
Start-Process $exe -ArgumentList '/e' -Wait
Write-Host "Static wallpaper folder: $env:APPDATA\strava-screensaver\wallpaper\index.html"
Start-Process $exe -ArgumentList '/c'
Write-Host 'Opening settings so you can connect Strava.'
