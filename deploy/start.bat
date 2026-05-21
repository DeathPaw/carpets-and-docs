@echo off
REM ============================================================================
REM Carpet Orders — запуск бэкенда (фронт уже внутри jar).
REM Java-процесс получает имя «CarpetOrders» для stop.bat.
REM Лог: deploy\app.log
REM ============================================================================

setlocal
cd /d "%~dp0\.."
set ROOT=%CD%
set JAR=%ROOT%\backend\target\carpet-order-management-0.0.1-SNAPSHOT.jar

if not exist "%JAR%" (
    echo ERROR: jar not built. Run setup.bat or update.bat first.
    exit /b 1
)

REM Если уже запущен — выходим
tasklist /FI "WINDOWTITLE eq CarpetOrders" 2>nul | findstr /I "cmd.exe" >nul
if not errorlevel 1 (
    echo Already running.
    exit /b 0
)

REM Запускаем в отдельном окне с заголовком CarpetOrders, лог в файл
start "CarpetOrders" /MIN cmd /c "java -jar ""%JAR%"" --spring.profiles.active=prod > ""%ROOT%\deploy\app.log"" 2>&1"
echo Started. Logs: %ROOT%\deploy\app.log
