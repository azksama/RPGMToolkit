@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-RPGMToolkit.ps1" %*
echo.
pause
