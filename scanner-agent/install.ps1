# ============================================================================
#  VScan Scanner Agent — installer otomatis (Windows)
# ----------------------------------------------------------------------------
#  Satu perintah (Command Prompt / PowerShell):
#    curl -sSL https://raw.githubusercontent.com/syamsulsariphidayat7/vscan/main/scanner-agent/install.ps1 -o %TEMP%\vscan-install.ps1 ^
#      && powershell -ExecutionPolicy Bypass -File %TEMP%\vscan-install.ps1
#
#  Yang dilakukan:
#    1. Cek Python → auto-install via winget bila belum ada
#    2. Download file agent ke %USERPROFILE%\vscan-agent
#    3. Buat virtualenv + install pyautogui
#    4. Minta kode pairing → tulis agent.env
#    5. (opsional) Pasang auto-start saat login
#    6. Jalankan agent
# ============================================================================
$ErrorActionPreference = "Stop"

$RepoRaw = "https://raw.githubusercontent.com/syamsulsariphidayat7/vscan/main/scanner-agent"
$AgentDir = Join-Path $env:USERPROFILE "vscan-agent"
$Code = $env:VSCAN_CODE

Write-Host "═══════════════════════════════════════════════════"
Write-Host "  VScan Scanner Agent — installer otomatis (Windows)"
Write-Host "═══════════════════════════════════════════════════"
Write-Host "  Target folder : $AgentDir"

# -----------------------------------------------------------
# 1. Python
# -----------------------------------------------------------
Write-Host "[1/5] Memastikan Python 3 tersedia ..."
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
    Write-Host "  -> Python belum ada, menginstall via winget ..."
    try {
        winget install --id Python.Python.3.12 -e --source winget `
            --accept-package-agreements --accept-source-agreements --silent | Out-Null
        # Muat ulang PATH agar python terdeteksi
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                    [System.Environment]::GetEnvironmentVariable("Path", "User")
        Start-Sleep -Seconds 3
        $py = Get-Command python -ErrorAction SilentlyContinue
    } catch {
        Write-Host "  [WARN] Gagal auto-install Python. Install manual dari https://python.org (centang 'Add to PATH'), lalu jalankan ulang."
        $py = $null
    }
}
if (-not $py) { exit 1 }
Write-Host "  OK Python: $(& $py.Source --version)"

# -----------------------------------------------------------
# 2. Download file agent
# -----------------------------------------------------------
Write-Host "[2/5] Mengunduh file agent ke $AgentDir ..."
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
foreach ($f in @("agent.py", "requirements.txt", "start-agent.bat", "install-autostart-windows.bat", "agent.env.example")) {
    try {
        Invoke-WebRequest -Uri "$RepoRaw/$f" -OutFile (Join-Path $AgentDir $f) -UseBasicParsing
    } catch {
        Write-Host "  [ERROR] Gagal mengunduh $f — cek koneksi internet." -ForegroundColor Red
        exit 1
    }
}

# -----------------------------------------------------------
# 3. Virtualenv + pyautogui
# -----------------------------------------------------------
Write-Host "[3/5] Membuat virtualenv + install pyautogui ..."
$venvPy = Join-Path $AgentDir ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    & $py.Source -m venv (Join-Path $AgentDir ".venv")
}
& $venvPy -m pip install --quiet --upgrade pip
& $venvPy -m pip install --quiet -r (Join-Path $AgentDir "requirements.txt")
Write-Host "  OK pyautogui terinstall di virtualenv"

# -----------------------------------------------------------
# 4. agent.env (kode pairing)
# -----------------------------------------------------------
$envFile = Join-Path $AgentDir "agent.env"
$existing = if (Test-Path $envFile) { Get-Content $envFile -Raw } else { "" }
if ($existing -match "VSCAN_CODE=[^\r\n]+") {
    Write-Host "[4/5] agent.env sudah ada dengan kode pairing — tidak diubah."
} else {
    if ([string]::IsNullOrWhiteSpace($Code)) {
        $Code = Read-Host "[4/5] Kode pairing VScan (dari tombol 'Daftarkan Proyek / POS')"
    }
    $Code = $Code.Trim().ToUpper()
    if ([string]::IsNullOrWhiteSpace($Code)) {
        Write-Host "  [WARN] Kode kosong — tulis nanti di $envFile"
        Copy-Item (Join-Path $AgentDir "agent.env.example") $envFile -Force
    } else {
        @"
# VScan Scanner Agent - konfigurasi (dibuat otomatis oleh installer)
VSCAN_CODE=$Code
VSCAN_URL=https://vscan.boundless.my.id
VSCAN_INTERVAL=1
"@ | Set-Content -Path $envFile -Encoding UTF8
        Write-Host "  OK Kode pairing $Code tersimpan di agent.env"
    }
}

# -----------------------------------------------------------
# 5. Auto-start (opsional) + jalankan
# -----------------------------------------------------------
Write-Host "[5/5] Selesai! Agent terpasang di $AgentDir"
if ((Test-Path $envFile) -and (Get-Content $envFile -Raw) -match "VSCAN_CODE=[^\r\n]+") {
    $ans = Read-Host "Pasang auto-start saat login? [y/N]"
    if ($ans -match "^(y|Y)$") {
        Push-Location $AgentDir
        & ".\install-autostart-windows.bat"
        Pop-Location
    }
    Write-Host "Menjalankan agent ... (tutup jendela untuk berhenti)"
    Push-Location $AgentDir
    & ".\start-agent.bat"
    Pop-Location
} else {
    Write-Host "Isi dulu VSCAN_CODE di $envFile, lalu double-click start-agent.bat"
}
