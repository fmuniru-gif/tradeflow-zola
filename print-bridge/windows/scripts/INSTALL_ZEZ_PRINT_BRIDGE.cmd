@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-ZEZPrintBridge.ps1" -SourceDirectory "%~dp0app"
if errorlevel 1 (
  echo.
  echo ZEZ Print Bridge installation did not complete.
  pause
  exit /b 1
)
echo.
echo ZEZ Print Bridge installation completed.
pause
