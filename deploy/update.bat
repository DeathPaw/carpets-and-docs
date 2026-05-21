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

REM Лог-ротация: если файл > 1 МБ, переименуем
for %%I in ("%LOG%") do if %%~zI GTR 1048576 move /Y "%LOG%" "%LOG%.old" >nul

echo. >> "%LOG%"
echo === %DATE% %TIME% === >> "%LOG%"

for /f %%i in ('git rev-parse HEAD 2^>nul') do set OLD_HASH=%%i
git fetch --quiet >> "%LOG%" 2>&1
git pull --ff-only --quiet >> "%LOG%" 2>&1
for /f %%i in ('git rev-parse HEAD 2^>nul') do set NEW_HASH=%%i

if "%OLD_HASH%"=="%NEW_HASH%" (
    echo No updates. >> "%LOG%"
    exit /b 0
)

echo Updates pulled: %OLD_HASH% -^> %NEW_HASH% >> "%LOG%"

REM Rebuild frontend
cd /d "%ROOT%\frontend"
call npm install >> "%LOG%" 2>&1
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 (echo Frontend build FAILED >> "%LOG%" & exit /b 1)

REM Rebuild backend
cd /d "%ROOT%\backend"
call mvn clean package -DskipTests -q >> "%LOG%" 2>&1
if errorlevel 1 (echo Backend build FAILED >> "%LOG%" & exit /b 1)

REM Restart
call "%ROOT%\deploy\stop.bat" >> "%LOG%" 2>&1
timeout /t 2 /nobreak >nul
call "%ROOT%\deploy\start.bat" >> "%LOG%" 2>&1

echo Restart complete. >> "%LOG%"
