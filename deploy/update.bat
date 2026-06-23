@echo off
REM ============================================================================
REM Carpet Orders — автообновление.
REM Запускается из Task Scheduler каждые 5 минут (см. setup.bat).
REM Если в git есть новые коммиты — пересобирает фронт+бэк, перезапускает.
REM Если ничего не изменилось — тихо выходит (0 нагрузки).
REM Лог пишется в deploy\update.log.
REM ============================================================================

setlocal enabledelayedexpansion
cd /d "%~dp0\.."
set ROOT=%CD%
set LOG=%ROOT%\deploy\update.log
set LOCK=%ROOT%\deploy\update.lock

REM ─── Lock: не запускаемся, если предыдущий update.bat ещё не закончил.
REM Task Scheduler может пнуть нас второй раз раньше, чем рестарт завершится,
REM из-за чего вылезали ошибки «Процесс не может получить доступ к файлу».
if exist "%LOCK%" (
    REM Stale lock guard: если lock-файлу >30 минут — считаем что предыдущий упал,
    REM перезаписываем. Иначе тихо выходим.
    for /f %%A in ('powershell -NoProfile -Command "[int]((Get-Date) - (Get-Item '%LOCK%').LastWriteTime).TotalMinutes"') do set LOCK_AGE=%%A
    if !LOCK_AGE! LSS 30 (
        echo === %DATE% %TIME% === LOCKED (previous run still going, age !LOCK_AGE!m) >> "%LOG%"
        exit /b 0
    )
    echo === %DATE% %TIME% === stale lock (age !LOCK_AGE!m), overriding >> "%LOG%"
)
echo %DATE% %TIME% > "%LOCK%"

REM ─── Лог-ротация: если файл > 1 МБ, переименуем
for %%I in ("%LOG%") do if %%~zI GTR 1048576 move /Y "%LOG%" "%LOG%.old" >nul

echo. >> "%LOG%"
echo === %DATE% %TIME% === >> "%LOG%"

REM Task Scheduler крутится от SYSTEM, а репозиторий клонировал юзер CARPET\local.
REM Git с 2.35+ блокирует операции на «чужих» репах (dubious ownership), безусловно
REM прописываем доверие к рабочей папке.
git config --system --get-all safe.directory | findstr /C:"%ROOT:\=/%" >nul
if errorlevel 1 (
    git config --system --add safe.directory "%ROOT:\=/%" >> "%LOG%" 2>&1
    git config --system --add safe.directory "*" >> "%LOG%" 2>&1
    echo Added safe.directory for %ROOT% >> "%LOG%"
)

for /f %%i in ('git rev-parse HEAD 2^>nul') do set OLD_HASH=%%i
git fetch --quiet >> "%LOG%" 2>&1
git reset --hard origin/main --quiet >> "%LOG%" 2>&1
for /f %%i in ('git rev-parse HEAD 2^>nul') do set NEW_HASH=%%i

if "%OLD_HASH%"=="%NEW_HASH%" (
    echo No updates. >> "%LOG%"
    del /F /Q "%LOCK%" >nul 2>&1
    exit /b 0
)

echo Updates pulled: %OLD_HASH% -^> %NEW_HASH% >> "%LOG%"

REM ─── Pre-update backup: дамп БД ДО рестарта (чтобы было откуда откатиться,
REM если новая версия что-то сломает). Хранится один, перезаписывается каждый апдейт.
echo Backing up DB before update... >> "%LOG%"
if not exist "%ROOT%\deploy\backups" mkdir "%ROOT%\deploy\backups"
if "%PGUSER%"==""     set PGUSER=postgres
if "%PGPASSWORD%"=="" set PGPASSWORD=postgres
if "%PGHOST%"==""     set PGHOST=localhost
if "%PGDATABASE%"=="" set PGDATABASE=carpet_db
pg_dump -U %PGUSER% -h %PGHOST% -Fc -f "%ROOT%\deploy\backups\pre-update.dump" %PGDATABASE% >> "%LOG%" 2>&1
if errorlevel 1 (
    echo Pre-update backup FAILED — aborting update for safety >> "%LOG%"
    del /F /Q "%LOCK%" >nul 2>&1
    exit /b 1
)
echo Pre-update backup OK: deploy\backups\pre-update.dump >> "%LOG%"

REM ─── Стопим Java РАНЬШЕ, до операций с файлами. На прошлой итерации java.exe
REM держал файлы и rmdir/move ругались «занят другим процессом».
echo Stopping Java... >> "%LOG%"
taskkill /F /IM java.exe /T >> "%LOG%" 2>&1
REM Ждём 3 секунды чтобы дескрипторы освободились.
timeout /t 3 /nobreak >nul

REM Чистим артефакты сборки. force_rmdir с retry — на случай если Defender ещё держит.
call :force_rmdir "%ROOT%\frontend\dist"
call :force_rmdir "%ROOT%\backend\target"

REM Rebuild frontend
cd /d "%ROOT%\frontend"
call npm install >> "%LOG%" 2>&1
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 (
    echo Frontend build FAILED >> "%LOG%"
    del /F /Q "%LOCK%" >nul 2>&1
    exit /b 1
)

REM Rebuild backend
cd /d "%ROOT%\backend"
call mvn clean package -DskipTests -q >> "%LOG%" 2>&1
if errorlevel 1 (
    echo Backend build FAILED >> "%LOG%"
    del /F /Q "%LOCK%" >nul 2>&1
    exit /b 1
)

REM Restart
call "%ROOT%\deploy\stop.bat" >> "%LOG%" 2>&1
timeout /t 2 /nobreak >nul
call "%ROOT%\deploy\start.bat" >> "%LOG%" 2>&1

echo Restart complete. >> "%LOG%"
del /F /Q "%LOCK%" >nul 2>&1
endlocal
exit /b 0

REM ─── Хелпер: rmdir с 5 ретраями (Windows Defender иногда держит файлы 1-2 сек).
:force_rmdir
if not exist %1 exit /b 0
for /L %%i in (1,1,5) do (
    rmdir /S /Q %1 >nul 2>&1
    if not exist %1 exit /b 0
    timeout /t 2 /nobreak >nul
)
echo WARN: could not remove %1 after 5 attempts >> "%LOG%"
exit /b 0
