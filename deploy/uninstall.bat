@echo off
REM ============================================================================
REM Carpet Orders — деинсталляция (на случай если что-то надо отменить).
REM Удаляет задачу Task Scheduler и останавливает приложение.
REM БД и git-репо НЕ трогает.
REM ============================================================================

call "%~dp0stop.bat"
schtasks /Delete /TN "CarpetOrdersAutoUpdate" /F 2>nul
echo Task scheduler entry removed.
echo To remove database manually:  psql -U postgres -c "DROP DATABASE carpet_db;"
