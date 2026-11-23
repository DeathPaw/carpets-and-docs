# Возраст lock-файла update.bat в минутах (целое). Нет файла — 0.
# Отдельным скриптом: внутри for /f в update.bat кавычки и скобки PowerShell
# разбирались неправильно, и возраст всегда выходил пустым («age m»).
param([string]$Path)
if (-not (Test-Path -LiteralPath $Path)) { '0'; exit 0 }
[int]((Get-Date) - (Get-Item -LiteralPath $Path).LastWriteTime).TotalMinutes
