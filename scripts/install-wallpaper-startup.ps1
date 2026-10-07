# Runs the wallpaper server hidden at login (current user, via a Startup-folder shortcut).
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'StravaWallpaperServer.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = (Get-Command node).Source
$s.Arguments = 'server.js'
$s.WorkingDirectory = $root
$s.WindowStyle = 7
$s.Save()
Write-Host "Created $lnk. Remove that file to stop it starting at login."
