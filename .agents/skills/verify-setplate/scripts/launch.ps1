[CmdletBinding()]
param(
    [ValidateSet('auto', 'managed', 'attached')]
    [string]$Mode = 'auto'
)

$ErrorActionPreference = 'Stop'

$SkillDir = Split-Path -Parent $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $SkillDir '..\..\..')).Path
$RunDir = Join-Path $SkillDir '.run'
$BackendUrl = 'http://127.0.0.1:8000'
$FrontendUrl = 'http://localhost:5173'

New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

function Test-Backend {
    try {
        $response = Invoke-RestMethod -Uri "$BackendUrl/api/v1/health" -TimeoutSec 3
        return $response.status -eq 'ok'
    }
    catch {
        return $false
    }
}

function Test-Frontend {
    try {
        $response = Invoke-WebRequest -Uri $FrontendUrl -TimeoutSec 3 -UseBasicParsing
        return $response.StatusCode -eq 200 -and $response.Content -match 'id="root"'
    }
    catch {
        return $false
    }
}

function Get-PortOwner([int]$Port) {
    $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $connection) {
        return $null
    }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
    return [pscustomobject]@{
        pid = $connection.OwningProcess
        command = if ($process) { $process.CommandLine } else { 'unknown' }
    }
}

function Save-ProcessRecord([string]$Kind, [System.Diagnostics.Process]$Process) {
    [pscustomobject]@{
        pid = $Process.Id
        kind = $Kind
        started_at = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json -Compress | Set-Content -Path (Join-Path $RunDir "$Kind.pid") -Encoding ASCII
}

$backendUp = Test-Backend
$frontendUp = Test-Frontend

if ($Mode -eq 'attached' -or ($Mode -eq 'auto' -and $backendUp -and $frontendUp)) {
    if (-not ($backendUp -and $frontendUp)) {
        throw "Attach requested, but backend=$backendUp and frontend=$frontendUp. Start the missing service or choose -Mode managed."
    }
    Set-Content -Path (Join-Path $RunDir 'mode') -Value 'attached' -Encoding ASCII
    [pscustomobject]@{
        mode = 'attached'
        backend = $BackendUrl
        frontend = $FrontendUrl
        backend_pid = $null
        frontend_pid = $null
    } | ConvertTo-Json -Compress
    exit 0
}

if ($Mode -eq 'auto' -and $backendUp -ne $frontendUp) {
    throw "Partial stack detected: backend=$backendUp frontend=$frontendUp. Refusing to start a duplicate. Fix the missing service first."
}

foreach ($port in 8000, 5173) {
    $owner = Get-PortOwner $port
    if ($owner) {
        throw "Port $port is held by PID $($owner.pid): $($owner.command). Refusing to start a second instance. Use -Mode attached if this is the app."
    }
}

$python = Join-Path $RepoRoot 'backend\venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw "Missing backend virtualenv at $python. Create it and install backend/requirements.txt first."
}

$vite = Join-Path $RepoRoot 'frontend\node_modules\vite\bin\vite.js'
if (-not (Test-Path $vite)) {
    throw "Missing frontend dependencies at $vite. Run npm install in frontend/ first."
}

Set-Content -Path (Join-Path $RunDir 'mode') -Value 'managed' -Encoding ASCII

$backend = Start-Process -FilePath $python `
    -ArgumentList @('-m', 'uvicorn', 'main:app', '--port', '8000') `
    -WorkingDirectory (Join-Path $RepoRoot 'backend') `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $RunDir 'backend.out.log') `
    -RedirectStandardError (Join-Path $RunDir 'backend.err.log')
Save-ProcessRecord 'backend' $backend

$frontend = Start-Process -FilePath 'node' `
    -ArgumentList @($vite, '--port', '5173', '--strictPort') `
    -WorkingDirectory (Join-Path $RepoRoot 'frontend') `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $RunDir 'frontend.out.log') `
    -RedirectStandardError (Join-Path $RunDir 'frontend.err.log')
Save-ProcessRecord 'frontend' $frontend

$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    if ((Test-Backend) -and (Test-Frontend)) {
        break
    }
    Start-Sleep -Milliseconds 500
}

if (-not ((Test-Backend) -and (Test-Frontend))) {
    & (Join-Path $PSScriptRoot 'cleanup.ps1') | Out-Null
    throw "Servers did not become ready within 60 seconds. Check the logs in $RunDir."
}

[pscustomobject]@{
    mode = 'managed'
    backend = $BackendUrl
    frontend = $FrontendUrl
    backend_pid = $backend.Id
    frontend_pid = $frontend.Id
} | ConvertTo-Json -Compress
