# Starts the local web server that serves the wallpaper (http://localhost:8765/wallpaper.html).
Set-Location (Join-Path $PSScriptRoot '..')
node server.js
