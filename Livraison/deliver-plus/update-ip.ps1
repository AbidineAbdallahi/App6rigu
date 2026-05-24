# update-ip.ps1 — Détecte l'IP Wi-Fi et met à jour API_URL / SOCKET_URL
# Double-clic ou : clic droit -> "Exécuter avec PowerShell"

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { ($_.InterfaceAlias -eq 'Wi-Fi' -or
                       $_.InterfaceAlias -match 'WiFi|WLAN|Wireless') -and
                      $_.IPAddress -notmatch '^169\.' -and
                      $_.IPAddress -ne '127.0.0.1' } |
       Select-Object -First 1).IPAddress

if (-not $ip) {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
           Where-Object { $_.IPAddress -notmatch '^(169\.|172\.|127\.)' } |
           Select-Object -First 1).IPAddress
}

if (-not $ip) {
    Write-Host "Aucune IP trouvee. Verifiez votre connexion Wi-Fi." -ForegroundColor Red
    pause; exit 1
}

Write-Host "IP detectee : $ip" -ForegroundColor Cyan

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @(
    "$root\mobile\src\constants.js",
    "$root\mobile-client\src\constants.js"
)

foreach ($file in $files) {
    if (-not (Test-Path $file)) { Write-Host "Introuvable : $file" -ForegroundColor Yellow; continue }

    # Lire en UTF-8 sans modifier l'encodage
    $lines = [System.IO.File]::ReadAllLines($file, [System.Text.Encoding]::UTF8)
    $changed = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "API_URL\s*=\s*'http://") {
            $lines[$i] = "export const API_URL    = 'http://${ip}:5000/api';"
            $changed = $true
        }
        if ($lines[$i] -match "SOCKET_URL\s*=\s*'http://") {
            $lines[$i] = "export const SOCKET_URL = 'http://${ip}:5000';"
            $changed = $true
        }
    }
    if ($changed) {
        [System.IO.File]::WriteAllLines($file, $lines, (New-Object System.Text.UTF8Encoding $false))
        Write-Host "Mis a jour : $file" -ForegroundColor Green
    } else {
        Write-Host "Aucune ligne API_URL/SOCKET_URL dans : $file" -ForegroundColor Yellow
    }
}

# ADB reverse si téléphone connecté
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (Test-Path $adb) {
    $dev = & $adb devices 2>&1 | Select-String "device$"
    if ($dev) {
        & $adb reverse tcp:5000 tcp:5000 | Out-Null
        & $adb reverse tcp:8081 tcp:8081 | Out-Null
        Write-Host "ADB reverse actif (5000 + 8081)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Fait ! Redemarrez Metro pour appliquer la nouvelle IP." -ForegroundColor Green
pause
