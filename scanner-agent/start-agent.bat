@echo off
REM ============================================
REM  VScan Scanner Agent — launcher Windows
REM  Double-click file ini untuk menjalankan agent.
REM  Konfigurasi dibaca otomatis dari agent.env.
REM ============================================
cd /d "%~dp0"

REM Cek Python tersedia
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python tidak ditemukan.
    echo Install dulu dari https://python.org/downloads
    echo ^(centang "Add python.exe to PATH" saat install^)
    pause
    exit /b 1
)

REM Cek dependensi sekali (aman diulang, cepat jika sudah ada)
python -c "import pyautogui" >nul 2>nul
if errorlevel 1 (
    echo Menginstall dependensi pyautogui ...
    python -m pip install -r requirements.txt
)

REM Jalankan agent (jendela tetap terbuka)
echo Memulai VScan Scanner Agent ...
python agent.py
pause
