@echo off
REM ============================================================================
REM Carpet Orders — первичная установка на сервере.
REM Запускается ОДИН РАЗ после `git clone`. Дальше — update.bat / start.bat.
REM
REM Что делает:
REM   1. Проверяет наличие java/mvn/node/psql
REM   2. Создаёт БД carpet_db (postgres/postgres)
REM   3. Билдит фронт + бэк (jar с фронтом внутри)
REM   4. Регистрирует задачу авто-обновления в Task Scheduler
REM   5. Запускает приложение
REM
REM Запуск: правой кнопкой → «Запуск от имени администратора».
REM ============================================================================

setlocal enabledelayedexpansion
cd /d "%~dp0\.."
set ROOT=%CD%
set PGPASSWORD=postgres
title Carpet Orders - Setup

REM Ранняя очистка: убиваем все java.exe (могут держать файлы), чистим dist/target.
REM Без этого vite падает EPERM при попытке очистить frontend\dist\assets.
taskkill /F /IM java.exe /T >nul 2>&1
timeout /t 3 /nobreak >nul

REM Несколько попыток rmdir с задержкой — Windows Defender может держать файл
REM пару секунд после освобождения процессом.
call :force_rmdir "%ROOT%\frontend\dist"
call :force_rmdir "%ROOT%\backend\target"
goto :after_clean

:force_rmdir
set "DIR=%~1"
if not exist "%DIR%" exit /b 0
for /L %%i in (1,1,5) do (
    rmdir /S /Q "%DIR%" 2>nul
    if not exist "%DIR%" exit /b 0
    timeout /t 2 /nobreak >nul
)
echo.
echo ОШИБКА: не удалось удалить папку %DIR%
echo Закройте Проводник/IDE открытые на этой папке, или добавьте папку C:\carpets
echo в исключения антивируса (Windows Defender / Касперский / прочее).
exit /b 1

:after_clean

REM Сброс к точной копии origin/main — на сервере не должно быть локальных коммитов.
REM Без этого `git pull --ff-only` потом ругается на diverging branches.
git fetch origin >nul 2>&1
git reset --hard origin/main >nul 2>&1

echo.
echo === [1/6] Checking tools ===
where java >nul 2>&1 || (echo X java not found & goto :err)
where mvn  >nul 2>&1 || (echo X mvn not found  & goto :err)
where node >nul 2>&1 || (echo X node not found & goto :err)
where psql >nul 2>&1 || (echo X psql not found & goto :err)
echo OK.

echo.
echo === [2/6] Creating database carpet_db (postgres/postgres) ===
psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='carpet_db'" 2>nul | findstr /B "1" >nul
if errorlevel 1 (
    psql -U postgres -h localhost -c "CREATE DATABASE carpet_db ENCODING 'UTF8';" || goto :err
    echo Database created.
) else (
    echo Database already exists, skipping.
)

echo.
echo === [3/6] Building frontend (npm install + npm run build) ===
cd /d "%ROOT%\frontend"
if not exist node_modules (
    call npm install || goto :err
)
call npm run build || goto :err

echo.
echo === [4/6] Building backend jar (with frontend bundled) ===
cd /d "%ROOT%\backend"
call mvn clean package -DskipTests -q || goto :err

echo.
echo === [5/6] Registering auto-update task (every 5 minutes) ===
REM /RU SYSTEM — задача работает даже когда никто не залогинен и компьютер на батарее.
REM /RL HIGHEST — админ-права (для taskkill чужих процессов).
REM SYSTEM-user не имеет user-profile (нет %USERPROFILE%\.gitconfig), но git pull
REM по HTTPS без auth (публичное репо) работает.
schtasks /Delete /TN "CarpetOrdersAutoUpdate" /F >nul 2>&1
schtasks /Create /SC MINUTE /MO 5 /TN "CarpetOrdersAutoUpdate" /TR "\"%ROOT%\deploy\update.bat\"" /RL HIGHEST /RU SYSTEM /F >nul || goto :err

REM Дополнительно: убрать ограничения по питанию через PowerShell (schtasks /Create не умеет это напрямую)
powershell -NoProfile -Command "$t=Get-ScheduledTask -TaskName 'CarpetOrdersAutoUpdate'; $t.Settings.DisallowStartIfOnBatteries=$false; $t.Settings.StopIfGoingOnBatteries=$false; $t.Settings.ExecutionTimeLimit='PT0S'; Set-ScheduledTask -InputObject $t" >nul 2>&1

echo Task registered (SYSTEM user, no battery limits, no logon required).

echo.
echo === [6/6] Starting application ===
call "%ROOT%\deploy\start.bat"

echo.
echo ============================================================================
echo READY. Open http://localhost:3000  (login: admin / foxy)
echo (port 8080 obychno zanyat EDB Postgres management UI, ispolzuem 3000)
echo Auto-update runs every 5 minutes via Task Scheduler.
echo Logs: %ROOT%\deploy\app.log
echo ============================================================================
goto :eof

:err
echo.
echo === SETUP FAILED. See messages above. ===
pause
exit /b 1
