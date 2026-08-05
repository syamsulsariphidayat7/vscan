@echo off
REM ============================================
REM  VScan Scanner Agent — auto-start Windows
REM  Jalankan SEKALI (double-click) agar agent
REM  otomatis berjalan setiap kali komputer
REM  dinyalakan / user login.
REM ============================================
setlocal
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\VScan Agent.lnk"

REM Buat shortcut via PowerShell (tersedia di semua Windows modern)
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%');" ^
  "$s.TargetPath='%~dp0start-agent.bat';" ^
  "$s.WorkingDirectory='%~dp0';" ^
  "$s.WindowStyle=7; $s.Save()"

if exist "%LNK%" (
    echo [OK] Auto-start terpasang.
    echo      VScan Agent akan berjalan otomatis setiap login.
    echo      Lokasi shortcut: %LNK%
) else (
    echo [ERROR] Gagal membuat shortcut auto-start.
)
echo.
echo Tes sekarang? Jalankan start-agent.bat (double-click).
pause
