@echo off
REM ============================================
REM  VScan Scanner Agent — launcher Windows
REM  Double-click file ini untuk menjalankan agent.
REM  Konfigurasi dibaca otomatis dari agent.env.
REM  Memakai virtualenv (.venv) bila ada.
REM ============================================
cd /d "%~dp0"

REM Pilih interpreter: .venv dulu (dibuat installer), fallback python
if exist ".venv\Scripts\python.exe" (
    set "PY=.venv\Scripts\python.exe"
) else (
    set "PY=python"
)

REM Cek Python tersedia
%PY% --version >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python tidak ditemukan.
    echo Install otomatis: jalankan install.ps1 (lihat README),
    echo atau manual dari https://python.org/downloads
    echo ^(centang "Add python.exe to PATH" saat install^)
    pause
    exit /b 1
)

REM Cek dependensi sekali (aman diulang, cepat jika sudah ada)
%PY% -c "import pyautogui" >nul 2>nul
if errorlevel 1 (
    echo Menginstall dependensi pyautogui ...
    %PY% -m pip install -r requirements.txt
)

REM Jalankan agent (jendela tetap terbuka)
echo Memulai VScan Scanner Agent ...
%PY% agent.py
pause
