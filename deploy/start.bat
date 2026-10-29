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

REM Если уже запущен — выходим. Ищем свой java.exe по командной строке
REM (app-process.ps1): заголовок окна CarpetOrders не виден, когда скрипт
REM запускает Task Scheduler от SYSTEM, и раньше проверка давала ложное «не запущен».
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\deploy\app-process.ps1" check
if not errorlevel 1 (
    echo Already running.
    exit /b 0
)

REM Запускаем в отдельном окне с заголовком CarpetOrders, лог в файл
start "CarpetOrders" /MIN cmd /c "java -jar ""%JAR%"" --spring.profiles.active=prod > ""%ROOT%\deploy\app.log"" 2>&1"
echo Started. Logs: %ROOT%\deploy\app.log
