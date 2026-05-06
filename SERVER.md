# Развёртывание на сервере (Windows 11)

Эта инструкция — для того, кто разворачивает систему на физическом сервере. Один раз настраиваем сервер и автодеплой, дальше каждое обновление прилетает само из git-репозитория.

> Документ для сисадмина. Оператору и обычному администратору сюда заходить не нужно — у них своя инструкция в `README.md`.

---

## Что в итоге будет работать

- **Бэкенд** — `java -jar app.jar`, запущен как Windows-сервис через NSSM, слушает `localhost:8080`.
- **Фронтенд** — статика, раздаётся через nginx (или прямо из Spring Boot, если не хочется отдельный nginx).
- **PostgreSQL** — локально, как сервис Windows.
- **Авто-деплой** — при пуше в `main` GitHub запускает на этом же сервере PowerShell-скрипт, который подтягивает код, пересобирает и перезапускает сервис.
- **Внешний доступ** — через проброс порта на роутере (это вы делаете сами).

---

## Часть А. Разовая установка (~30–60 минут)

### А.1. Установить зависимости

Открой PowerShell от имени администратора и выполни:

```powershell
# winget идёт с Windows 11 из коробки
winget install --id EclipseAdoptium.Temurin.21.JDK -e
winget install --id Apache.Maven -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id PostgreSQL.PostgreSQL.16 -e
winget install --id Git.Git -e
winget install --id Nginx.Nginx -e         # если будете отдавать фронт через nginx
```

**Проверь, что всё в `PATH`** (открой НОВЫЙ PowerShell и выполни):
```powershell
java -version       # должно быть 21.x
mvn -version        # 3.8+
node -v             # 18+
git --version
psql --version      # 16.x
```

Если что-то не нашлось — добавь руками в системный `PATH` (через «Изменение переменных среды»).

### А.2. Создать базу данных

```powershell
# При установке PostgreSQL ты задал пароль для пользователя postgres. Запомни.
$env:PGPASSWORD = "ТВОЙ_ПАРОЛЬ_POSTGRES"

psql -U postgres -c "CREATE USER carpet WITH PASSWORD 'CARPET_DB_PASSWORD';"
psql -U postgres -c "CREATE DATABASE carpet_db OWNER carpet;"
```

Пароль `CARPET_DB_PASSWORD` придумай свой. Запомни, он нужен на следующем шаге.

### А.3. Клонировать репозиторий

Заведи структуру папок один раз:

```powershell
New-Item -ItemType Directory -Path C:\carpet\src, C:\carpet\app, C:\carpet\web -Force
cd C:\carpet\src

# Замени URL на ваш
git clone git@github.com:USER/carpet-and-docs.git .
```

Если у вас приватный репо и ssh-ключи ещё не настроены — проще через `https`:
```powershell
git clone https://github.com/USER/carpet-and-docs.git .
# и Personal Access Token в Settings → Developer → PATs (classic, scope=repo)
```

### А.4. Настроить бэкенд

Открой `C:\carpet\src\backend\src\main\resources\application.yml` и замени блок `datasource`:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/carpet_db
    username: carpet
    password: CARPET_DB_PASSWORD
```

Логин/пароль для входа в само приложение — в `backend/src/main/java/ru/carpet/config/SecurityConfig.java`, метод `userDetailsService`. Меняй и пересобирай. По умолчанию `admin / foxyisgood` — сразу смени на что-то своё перед боевым запуском.

### А.5. Настроить фронтенд

Создай `C:\carpet\src\frontend\.env`:

```
# Адрес бэкенда. Если nginx проксирует /api на 8080 — оставь localhost.
# Если фронт билдится для боевого домена и nginx разделяет фронт/бэк — поставь полный URL.
VITE_API_BASE_URL=http://localhost:8080

# (опционально) Ключ DaData для подсказок адреса
VITE_DADATA_TOKEN=ваш_ключ_из_dadata.ru
```

### А.6. Первая ручная сборка

```powershell
# Бэкенд
cd C:\carpet\src\backend
mvn -B -DskipTests package
# в target/carpet-order-management-0.0.1-SNAPSHOT.jar — готовый jar
Copy-Item target\carpet-order-management-0.0.1-SNAPSHOT.jar C:\carpet\app\app.jar -Force

# Фронтенд
cd C:\carpet\src\frontend
npm ci
npm run build
# dist/ → копируем в папку, откуда раздаст nginx
Copy-Item dist\* C:\carpet\web\ -Recurse -Force
```

Проверь, что бэк руками запускается:
```powershell
cd C:\carpet\app
java -jar app.jar
# должен подняться, в логах увидишь "Started ... in X seconds"
# проверь http://localhost:8080/v3/api-docs — должен открыться JSON со схемой API
```

Закрой `Ctrl+C` — мы сейчас сделаем нормальный сервис.

### А.7. Завернуть бэкенд в Windows-сервис (NSSM)

NSSM — самый удобный способ повесить любую программу на автозапуск Windows.

```powershell
# Скачать
Invoke-WebRequest https://nssm.cc/release/nssm-2.24.zip -OutFile $env:TEMP\nssm.zip
Expand-Archive $env:TEMP\nssm.zip -DestinationPath C:\nssm -Force
# Внутри C:\nssm\nssm-2.24\win64\nssm.exe

# Регистрируем сервис
$nssm = "C:\nssm\nssm-2.24\win64\nssm.exe"
$java = "C:\Program Files\Eclipse Adoptium\jdk-21.0.5.11-hotspot\bin\java.exe"  # подставь свой путь к java

& $nssm install CarpetBackend $java "-jar C:\carpet\app\app.jar"
& $nssm set CarpetBackend AppDirectory C:\carpet\app
& $nssm set CarpetBackend Start SERVICE_AUTO_START
& $nssm set CarpetBackend AppStdout C:\carpet\app\stdout.log
& $nssm set CarpetBackend AppStderr C:\carpet\app\stderr.log
& $nssm start CarpetBackend
```

Проверь:
```powershell
Get-Service CarpetBackend     # Status: Running
```

Если упал — смотри `C:\carpet\app\stderr.log`.

### А.8. Раздача фронтенда через nginx

Создай `C:\nginx\conf\carpet.conf` (или измени `nginx.conf`):

```nginx
server {
    listen 80;
    server_name _;

    # Раздача статики (фронт)
    root C:/carpet/web;
    index index.html;

    # Любой путь, который не /api/ — отдаём как SPA (главное правило для React Router)
    location / {
        try_files $uri /index.html;
    }

    # Все /api/* — на бэк
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Swagger UI (если хочешь оставить доступным)
    location /swagger-ui {
        proxy_pass http://localhost:8080;
    }
    location /v3/api-docs {
        proxy_pass http://localhost:8080;
    }

    # Большие фото — увеличиваем лимит
    client_max_body_size 20m;
}
```

Подключи в основном `nginx.conf` (внутри блока `http { ... }`):
```nginx
include carpet.conf;
```

Запусти nginx как сервис тем же NSSM:
```powershell
$nssm = "C:\nssm\nssm-2.24\win64\nssm.exe"
& $nssm install CarpetNginx "C:\nginx\nginx.exe"
& $nssm set CarpetNginx AppDirectory "C:\nginx"
& $nssm set CarpetNginx Start SERVICE_AUTO_START
& $nssm start CarpetNginx
```

Открой `http://localhost` — должен показаться экран логина приложения.

### А.9. Проброс портов на роутере

Этот шаг ты делаешь сам в админке роутера. Минимум:
- Снаружи `80` (или `443` если планируешь HTTPS) → внутри `80` на IP сервера.

Если хочешь HTTPS бесплатно — поставь `win-acme` (Let's Encrypt для Windows), привяжи домен, nginx начнёт принимать `https://`.

---

## Часть Б. Авто-обновление через GitHub Actions

Идея простая: на сервере крутится агент GitHub (self-hosted runner). Когда в репозиторий приходит push в `main`, GitHub просит этот агент выполнить PowerShell-скрипт. Скрипт делает `git pull`, пересобирает, перезапускает сервис.

**Полностью бесплатно** (даже для приватного репо), агент не требует входящих портов — он сам поллит GitHub.

### Б.1. Зарегистрировать self-hosted runner

1. На GitHub в репо: **Settings → Actions → Runners → New self-hosted runner**.
2. Выбери **Windows**, **x64**.
3. Гитхаб покажет блок PowerShell-команд — выполни их **на сервере** в новом PowerShell. Там что-то вроде:

```powershell
mkdir C:\actions-runner; cd C:\actions-runner
Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.319.1/actions-runner-win-x64-2.319.1.zip -OutFile actions-runner.zip
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD/actions-runner.zip", "$PWD")

# config.cmd — токен одноразовый, ровно тот, что показал GitHub
.\config.cmd --url https://github.com/USER/REPO --token AAA...

# На вопрос о labels можно нажать Enter (хватит дефолтных).
```

4. Установи как сервис, чтобы запускался с системой:
```powershell
.\svc install
.\svc start
```

В **Settings → Actions → Runners** репо появится зелёная строка `Idle`. Значит готов принимать задачи.

### Б.2. Скрипт деплоя на сервере

Сохрани как `C:\carpet\src\deploy.ps1` (или в любое другое место — главное, чтобы агент мог его найти):

```powershell
# C:\carpet\src\deploy.ps1
$ErrorActionPreference = 'Stop'
Write-Host "=== Carpet deploy started: $(Get-Date) ==="

Set-Location C:\carpet\src

# 1. Подтянуть свежий код
git fetch origin
git reset --hard origin/main

# 2. Сборка бэка
Push-Location backend
mvn -B -DskipTests package
Pop-Location

# 3. Сборка фронта
Push-Location frontend
npm ci
npm run build
Pop-Location

# 4. Перезапуск сервиса бэкенда
Stop-Service CarpetBackend -Force
Copy-Item backend\target\carpet-order-management-0.0.1-SNAPSHOT.jar C:\carpet\app\app.jar -Force
Start-Service CarpetBackend

# 5. Обновить статику фронта (nginx раздаёт «на лету», перезапуск не нужен)
$webDir = 'C:\carpet\web'
Get-ChildItem $webDir -Force | Remove-Item -Recurse -Force
Copy-Item frontend\dist\* $webDir -Recurse

Write-Host "=== Carpet deploy finished: $(Get-Date) ==="
```

### Б.3. Workflow в репозитории

В репо создай файл `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    # Запускается на ВАШЕМ сервере, потому что есть лейбл self-hosted
    runs-on: self-hosted
    steps:
      - name: Run deploy script
        shell: pwsh
        run: C:\carpet\src\deploy.ps1
```

Закоммить, запуш в `main`. Через ~10 секунд во вкладке **Actions** появится прогон. Кликни — увидишь логи `mvn package`, `npm run build` и т.д.

### Б.4. Проверка

1. Открой страницу приложения, посмотри какую-нибудь надпись.
2. Поменяй её в коде локально, закоммить, запушь.
3. Через минуту обнови страницу — должно обновиться.

Если что-то отвалилось — смотри:
- Логи прогона в **Actions** на GitHub.
- `C:\carpet\app\stderr.log` — если упал бэкенд.
- `C:\nginx\logs\error.log` — если nginx ругается.

---

## Часть В. Эксплуатация

### В.1. Перезапустить вручную

```powershell
Restart-Service CarpetBackend
Restart-Service CarpetNginx
```

### В.2. Посмотреть логи

```powershell
Get-Content C:\carpet\app\stderr.log -Tail 100 -Wait
```

### В.3. Бэкап БД

Раз в сутки минимум, либо настрой Task Scheduler:

```powershell
# C:\carpet\backup.ps1
$env:PGPASSWORD = "CARPET_DB_PASSWORD"
$date = Get-Date -Format 'yyyy-MM-dd_HH-mm'
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U carpet -d carpet_db -F c `
    -f "D:\backups\carpet_db_$date.dump"

# Чистка старше 30 дней
Get-ChildItem D:\backups -Filter 'carpet_db_*.dump' |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item
```

Регистрация в Task Scheduler:
```powershell
$action  = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument '-NoProfile -File C:\carpet\backup.ps1'
$trigger = New-ScheduledTaskTrigger -Daily -At 03:00
Register-ScheduledTask -TaskName 'CarpetBackup' -Action $action -Trigger $trigger -RunLevel Highest
```

Восстановление из бэкапа:
```powershell
& "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -U carpet -d carpet_db -c `
    "D:\backups\carpet_db_2026-05-06_03-00.dump"
```

### В.4. Если runner отвалился

```powershell
cd C:\actions-runner
.\svc status   # должен быть Running
.\svc restart  # перезапустить
# В крайнем случае — переподключить с новым токеном:
.\config.cmd remove --token СТАРЫЙ_ТОКЕН
.\config.cmd --url https://github.com/USER/REPO --token НОВЫЙ_ТОКЕН
.\svc install
.\svc start
```

### В.5. Безопасность приватного репо при self-hosted runner

GitHub официально предупреждает: не подключай self-hosted runner к **публичному** репо без дополнительных мер — любой может прислать PR и выполнить произвольный код на твоём сервере.

Для **приватного** репо это не актуально, но всё равно сделай в **Settings → Actions → General**:
- ✅ «Require approval for first-time contributors»
- В блоке **Fork pull request workflows** — «Require approval for all outside collaborators»

---

## Что у вас в итоге крутится

| Сервис             | Тип                       | Автозапуск |
|--------------------|---------------------------|------------|
| `postgresql-x64-16`| Windows-сервис (стандартно)| Да         |
| `CarpetBackend`    | Windows-сервис (NSSM)     | Да         |
| `CarpetNginx`      | Windows-сервис (NSSM)     | Да         |
| `actions.runner.*` | Windows-сервис (GitHub)   | Да         |

После перезагрузки сервера всё поднимается само. Для обновления — просто `git push origin main`.
