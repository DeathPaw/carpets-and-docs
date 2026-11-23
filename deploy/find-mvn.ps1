# ============================================================================
# Carpet Orders — поиск Maven (mvn.cmd). Печатает полный путь или ничего.
#
# Зачем: автообновление крутится в Task Scheduler от SYSTEM, а Maven обычно
# прописан только в PATH пользователя, который ставил сервер. SYSTEM этот PATH
# не видит, и сборка падала с «"mvn" не является внутренней или внешней
# командой» — приложение при этом оставалось остановленным.
#
# Порядок поиска: PATH текущего процесса → MAVEN_HOME/M2_HOME → PATH каждого
# пользователя из реестра → типовые папки установки.
# ============================================================================

function Test-Mvn([string]$Dir) {
    if (-not $Dir) { return $null }
    $Candidate = Join-Path $Dir.Trim().Trim('"') 'mvn.cmd'
    if (Test-Path -LiteralPath $Candidate) { return (Resolve-Path -LiteralPath $Candidate).Path }
    return $null
}

# 1. PATH процесса (ручной запуск из консоли пользователя).
$Found = Get-Command mvn.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
if ($Found) { $Found.Source; exit 0 }

# 2. Переменные Maven.
foreach ($Var in @('MAVEN_HOME', 'M2_HOME')) {
    foreach ($Scope in @('Process', 'Machine')) {
        $MvnHome = [Environment]::GetEnvironmentVariable($Var, $Scope)
        if ($MvnHome) { $Hit = Test-Mvn (Join-Path $MvnHome 'bin'); if ($Hit) { $Hit; exit 0 } }
    }
}

# 3. PATH пользователей из реестра (HKEY_USERS\<SID>\Environment). Значение
#    читаем нераскрытым и подставляем профиль именно этого пользователя: у
#    SYSTEM свой %USERPROFILE%.
$Profiles = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList'
foreach ($Hive in Get-ChildItem 'Registry::HKEY_USERS' -ErrorAction SilentlyContinue) {
    $EnvKey = Get-Item "Registry::$($Hive.Name)\Environment" -ErrorAction SilentlyContinue
    if (-not $EnvKey) { continue }
    $Raw = $EnvKey.GetValue('Path', '', 'DoNotExpandEnvironmentNames')
    $UserHome = (Get-ItemProperty "$Profiles\$($Hive.PSChildName)" -ErrorAction SilentlyContinue).ProfileImagePath
    $MavenHome = $EnvKey.GetValue('MAVEN_HOME', '', 'DoNotExpandEnvironmentNames')
    $Dirs = @($Raw -split ';')
    if ($MavenHome) { $Dirs += (Join-Path $MavenHome 'bin') }
    foreach ($Dir in $Dirs) {
        if (-not $Dir) { continue }
        if ($UserHome) { $Dir = $Dir -replace '%USERPROFILE%', $UserHome }
        $Dir = [Environment]::ExpandEnvironmentVariables($Dir)
        $Hit = Test-Mvn $Dir
        if ($Hit) { $Hit; exit 0 }
    }
}

# 4. Типовые места установки.
$Patterns = @(
    'C:\Program Files\Apache\*\bin\mvn.cmd',
    'C:\Program Files\apache-maven*\bin\mvn.cmd',
    'C:\Program Files\Maven\*\bin\mvn.cmd',
    'C:\apache-maven*\bin\mvn.cmd',
    'C:\maven*\bin\mvn.cmd',
    'C:\tools\*maven*\bin\mvn.cmd',
    'C:\ProgramData\chocolatey\lib\maven\apache-maven*\bin\mvn.cmd',
    'C:\Users\*\scoop\apps\maven\current\bin\mvn.cmd',
    'C:\Users\*\apache-maven*\bin\mvn.cmd',
    'C:\Users\*\Downloads\apache-maven*\bin\mvn.cmd'
)
foreach ($Pattern in $Patterns) {
    $Hit = Get-ChildItem $Pattern -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($Hit) { $Hit.FullName; exit 0 }
}
exit 1
