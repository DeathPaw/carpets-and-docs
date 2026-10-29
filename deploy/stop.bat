@echo off
REM ============================================================================
REM Carpet Orders — остановка.
REM Останавливает только свой java.exe (наш jar + профиль prod), другие
REM Java-приложения на сервере («Верфь» и т.п.) не трогает.
REM ============================================================================

setlocal
cd /d "%~dp0\.."
set ROOT=%CD%

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\deploy\app-process.ps1" stop

REM Подстраховка: если на нашем порту 3000 всё ещё кто-то слушает — это
REM осиротевший процесс «Ковров» (например, запущенный вручную без профиля).
for /f "tokens=5" %%i in ('netstat -ano ^| findstr /R /C:":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%i >nul 2>&1
)

echo Stopped.
