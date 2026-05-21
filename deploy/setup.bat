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
schtasks /Query /TN "CarpetOrdersAutoUpdate" >nul 2>&1
if errorlevel 1 (
    schtasks /Create /SC MINUTE /MO 5 /TN "CarpetOrdersAutoUpdate" /TR "\"%ROOT%\deploy\update.bat\"" /F >nul || goto :err
    echo Task registered.
) else (
    echo Task already exists.
)

echo.
echo === [6/6] Starting application ===
call "%ROOT%\deploy\start.bat"

echo.
echo ============================================================================
echo READY. Open http://localhost:9090  (login: admin / foxy)
echo (port 8080 obychno zanyat EDB Postgres management UI, ispolzuem 9090)
echo Auto-update runs every 5 minutes via Task Scheduler.
echo Logs: %ROOT%\deploy\app.log
echo ============================================================================
goto :eof

:err
echo.
echo === SETUP FAILED. See messages above. ===
pause
exit /b 1
