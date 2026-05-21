@echo off
REM ============================================================================
REM Carpet Orders — остановка.
REM Убивает Java-процесс, запущенный через start.bat (по WINDOWTITLE).
REM ============================================================================

setlocal

REM Находим PID окна CarpetOrders → останавливаем все Java под ним
for /f "tokens=2" %%i in ('tasklist /V /FI "WINDOWTITLE eq CarpetOrders" /FO LIST ^| findstr "PID:"') do (
    taskkill /F /PID %%i >nul 2>&1
)

REM Подстраховка: убить любой java.exe слушающий 8080
for /f "tokens=5" %%i in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%i >nul 2>&1
)

echo Stopped.
