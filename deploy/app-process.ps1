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
# Свежая сборка или последняя рабочая (её start.bat запускает, если сборка упала).
$Jars = @(
    (Join-Path $Root 'backend\target\carpet-order-management-0.0.1-SNAPSHOT.jar'),
    (Join-Path $Root 'deploy\last-good.jar')
) | ForEach-Object { $_.ToLower() }

$Own = @(Get-CimInstance Win32_Process -Filter "Name='java.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $Cmd = if ($_.CommandLine) { $_.CommandLine.ToLower() } else { '' }
        $Cmd.Contains('--spring.profiles.active=prod') -and ($Jars | Where-Object { $Cmd.Contains($_) })
    })

if ($Action -eq 'check') {
    if ($Own.Count -gt 0) { exit 0 } else { exit 1 }
}

foreach ($P in $Own) {
    Stop-Process -Id $P.ProcessId -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $P.ProcessId -Timeout 30 -ErrorAction SilentlyContinue
    Write-Host "Stopped java.exe PID $($P.ProcessId)"
}
exit 0
