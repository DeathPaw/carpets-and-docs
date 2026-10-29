# ============================================================================
# Carpet Orders — поиск и остановка СВОЕГО Java-процесса.
#
#   app-process.ps1 check  — exit 0, если боевой процесс «Ковров» запущен, иначе 1
#   app-process.ps1 stop   — остановить только его
#
# Зачем: раньше скрипты делали `taskkill /IM java.exe`, и вместе с «Коврами»
# падали все Java-приложения на сервере (в т.ч. «Верфь»). Окно с заголовком
# CarpetOrders тоже не годится для поиска: задачи Task Scheduler работают от
# SYSTEM в сессии 0, где у окон нет заголовков. Поэтому ищем по командной
# строке: java.exe с нашим jar из этой папки и боевым профилем.
# ============================================================================
param([ValidateSet('check','stop')][string]$Action = 'check')

$Root = Split-Path -Parent $PSScriptRoot
$Jar  = Join-Path $Root 'backend\target\carpet-order-management-0.0.1-SNAPSHOT.jar'

$Own = @(Get-CimInstance Win32_Process -Filter "Name='java.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($Jar.ToLower()) -and $_.CommandLine.Contains('--spring.profiles.active=prod') })

if ($Action -eq 'check') {
    if ($Own.Count -gt 0) { exit 0 } else { exit 1 }
}

foreach ($P in $Own) {
    Stop-Process -Id $P.ProcessId -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $P.ProcessId -Timeout 30 -ErrorAction SilentlyContinue
    Write-Host "Stopped java.exe PID $($P.ProcessId)"
}
exit 0
