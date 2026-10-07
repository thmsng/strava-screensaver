# Clears the current user's screensaver setting.
$key = 'HKCU:\Control Panel\Desktop'
Remove-ItemProperty -Path $key -Name 'SCRNSAVE.EXE' -ErrorAction SilentlyContinue
Set-ItemProperty -Path $key -Name 'ScreenSaveActive' -Value '0'
rundll32.exe user32.dll,UpdatePerUserSystemParameters
Write-Host 'Screensaver disabled.'
