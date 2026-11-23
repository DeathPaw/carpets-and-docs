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
    for /f %%A in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\deploy\lock-age.ps1" "%LOCK%"') do set LOCK_AGE=%%A
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

REM Задача автозапуска при старте Windows. Её регистрирует setup.bat, но на
REM серверах, поставленных до её появления, её нет — досоздаём здесь, чтобы
REM не просить запускать setup.bat заново.
schtasks /Query /TN "CarpetOrdersStart" >nul 2>&1
if errorlevel 1 (
    schtasks /Create /SC ONSTART /DELAY 0002:00 /TN "CarpetOrdersStart" /TR "\"%ROOT%\deploy\start.bat\"" /RL HIGHEST /RU SYSTEM /F >> "%LOG%" 2>&1
    echo Registered CarpetOrdersStart task >> "%LOG%"
)

REM ─── start.bat и stop.bat вызываем БЕЗ перенаправления в update.log.
REM Java, запущенная из-под «>> update.log», наследовала открытый дескриптор лога
REM и держала его, пока работала: все следующие записи в лог падали с «файл занят
REM другим процессом», а команды с таким перенаправлением cmd вообще не выполнял —
REM stop.bat не останавливал приложение, и сборка не могла заменить jar.
set "JAR=%ROOT%\backend\target\carpet-order-management-0.0.1-SNAPSHOT.jar"
set "LASTGOOD=%ROOT%\deploy\last-good.jar"
set "BUILT=%ROOT%\deploy\built.hash"

REM ─── Что собрано сейчас. deploy\built.hash пишется только после УСПЕШНОЙ
REM сборки — поэтому неудавшаяся сборка повторяется на следующем запуске, а не
REM «забывается» до следующего коммита (раньше сравнивали только хэши git:
REM после падения сборки код уже был подтянут, и приложение так и лежало).
set "BUILT_HASH="
if exist "%BUILT%" set /p BUILT_HASH=<"%BUILT%"
REM Первый запуск с этим механизмом: файла ещё нет. Если код не менялся и jar
REM на месте — считаем текущую сборку актуальной, лишний раз не пересобираем.
if not exist "%BUILT%" if "%OLD_HASH%"=="%NEW_HASH%" if exist "%JAR%" (
    (echo %NEW_HASH%)>"%BUILT%"
    set "BUILT_HASH=%NEW_HASH%"
)
if "%BUILT_HASH%"=="%NEW_HASH%" goto :up_to_date
goto :do_update

REM ─── Сторож: обновлений нет, но приложение не запущено (перезагрузка, падение,
REM кто-то остановил) — поднимаем. Комментарии вне блоков if: REM со скобками
REM внутри блока ломает cmd.
:up_to_date
echo No updates. >> "%LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\deploy\app-process.ps1" check
if errorlevel 1 (
    echo App is not running, starting... >> "%LOG%"
    call "%ROOT%\deploy\start.bat" >nul 2>&1
)
goto :finish_ok

:do_update
if "%OLD_HASH%"=="%NEW_HASH%" (
    echo Rebuilding %NEW_HASH%: previous build did not complete >> "%LOG%"
) else (
    echo Updates pulled: %OLD_HASH% -^> %NEW_HASH% >> "%LOG%"
)

REM ─── Maven ищем ДО остановки приложения. Task Scheduler работает от SYSTEM,
REM а Maven обычно прописан только в PATH пользователя — отсюда «"mvn" не
REM является внутренней или внешней командой». find-mvn.ps1 ищет его в PATH
REM всех пользователей и типовых папках. Можно задать путь явно в
REM deploy\local-tools.bat (не в git): set "MVN=C:\...\bin\mvn.cmd".
set "MVN="
if exist "%ROOT%\deploy\local-tools.bat" call "%ROOT%\deploy\local-tools.bat"
if not defined MVN for /f "delims=" %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\deploy\find-mvn.ps1"') do set "MVN=%%i"
if not defined MVN goto :no_maven
echo Maven: %MVN% >> "%LOG%"

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
    goto :keep_running
)
echo Pre-update backup OK: deploy\backups\pre-update.dump >> "%LOG%"

REM ─── Стопим Java РАНЬШЕ, до операций с файлами: java.exe держит jar, и
REM rmdir/move ругались «занят другим процессом».
REM Только свой процесс: `taskkill /IM java.exe` клал и «Верфь» на том же сервере.
echo Stopping Java... >> "%LOG%"
call "%ROOT%\deploy\stop.bat" >nul 2>&1
timeout /t 3 /nobreak >nul

REM Рабочую сборку сохраняем: если новая не соберётся, start.bat поднимет её.
if exist "%JAR%" copy /Y "%JAR%" "%LASTGOOD%" >nul

REM Чистим артефакты сборки. force_rmdir с retry — на случай если Defender ещё держит.
call :force_rmdir "%ROOT%\frontend\dist"
call :force_rmdir "%ROOT%\backend\target"

REM Rebuild frontend
cd /d "%ROOT%\frontend"
call npm install >> "%LOG%" 2>&1
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 (
    echo Frontend build FAILED >> "%LOG%"
    goto :build_failed
)

REM Rebuild backend
cd /d "%ROOT%\backend"
call "%MVN%" clean package -DskipTests -q >> "%LOG%" 2>&1
if errorlevel 1 (
    echo Backend build FAILED >> "%LOG%"
    goto :build_failed
)
if not exist "%JAR%" (
    echo Backend build produced no jar >> "%LOG%"
    goto :build_failed
)

REM Start (остановили выше, перед сборкой)
call "%ROOT%\deploy\start.bat" >nul 2>&1
(echo %NEW_HASH%)>"%BUILT%"
echo Restart complete. >> "%LOG%"
goto :finish_ok

REM ─── Сборка не удалась: приложение уже остановлено — поднимаем прежнюю
REM версию (start.bat возьмёт deploy\last-good.jar). Сборка повторится на
REM следующем запуске, т.к. built.hash не обновлён.
:build_failed
echo Starting previous version from deploy\last-good.jar >> "%LOG%"
call "%ROOT%\deploy\start.bat" >nul 2>&1
del /F /Q "%LOCK%" >nul 2>&1
exit /b 1

:no_maven
echo ERROR: Maven (mvn.cmd) not found. Create deploy\local-tools.bat with: set "MVN=C:\path\to\maven\bin\mvn.cmd" >> "%LOG%"
goto :keep_running

REM ─── Обновиться не получилось ещё до остановки — просто следим, чтобы
REM приложение работало.
:keep_running
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\deploy\app-process.ps1" check
if errorlevel 1 call "%ROOT%\deploy\start.bat" >nul 2>&1
del /F /Q "%LOCK%" >nul 2>&1
exit /b 1

:finish_ok
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
