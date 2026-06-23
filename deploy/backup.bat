@echo off
REM ============================================================================
REM Carpet Orders — ежедневный бэкап БД.
REM
REM Запускается Task Scheduler раз в сутки (см. setup.bat → CarpetOrdersBackup).
REM Сохраняет дамп в deploy\backups\daily-YYYYMMDD.dump (custom-формат pg_dump),
REM хранит последние 3 ежедневных бэкапа. Старее — удаляет.
REM
REM Также деплой (update.bat) перед каждой пересборкой делает отдельный
REM pre-update.dump — это +1 бэкап «на состояние перед апдейтом».
REM Итого: 3 ежедневных + 1 pre-update.
REM
REM Восстановление:
REM   pg_restore -U postgres -d carpet_db --clean --if-exists daily-20260623.dump
REM ============================================================================

setlocal enabledelayedexpansion
cd /d "%~dp0\.."
set ROOT=%CD%
set BACKUP_DIR=%ROOT%\deploy\backups
set LOG=%ROOT%\deploy\backup.log

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM YYYYMMDD без локали — стабильно на любой Windows.
for /f "tokens=2 delims==" %%I in ('wmic os get LocalDateTime /value 2^>nul ^| find "="') do set DT=%%I
set TODAY=%DT:~0,8%
set TARGET=%BACKUP_DIR%\daily-%TODAY%.dump

echo. >> "%LOG%"
echo === %DATE% %TIME% - daily backup ^(%TODAY%^) === >> "%LOG%"

REM Логин/пароль на проде задаются через NSSM AppEnvironmentExtra. Здесь fallback на postgres/postgres.
if "%PGUSER%"==""     set PGUSER=postgres
if "%PGPASSWORD%"=="" set PGPASSWORD=postgres
if "%PGHOST%"==""     set PGHOST=localhost
if "%PGDATABASE%"=="" set PGDATABASE=carpet_db

REM Custom-формат: компактнее plain и поддерживает selective pg_restore.
pg_dump -U %PGUSER% -h %PGHOST% -Fc -f "%TARGET%" %PGDATABASE% >> "%LOG%" 2>&1
if errorlevel 1 (
    echo Backup FAILED >> "%LOG%"
    exit /b 1
)

echo Backup saved: %TARGET% >> "%LOG%"

REM Ротация: оставляем 3 последних daily-*.dump, остальные сносим.
REM Используем powershell — в чистом cmd сортировка по дате громоздкая.
powershell -NoProfile -Command "Get-ChildItem '%BACKUP_DIR%\daily-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 3 | Remove-Item -Force" >> "%LOG%" 2>&1

echo Rotation done. >> "%LOG%"
endlocal
