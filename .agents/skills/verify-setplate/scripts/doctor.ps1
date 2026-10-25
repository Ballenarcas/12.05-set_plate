[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$SkillDir = Split-Path -Parent $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $SkillDir '..\..\..')).Path
$BackendUrl = 'http://127.0.0.1:8000'
$FrontendUrl = 'http://localhost:5173'
$checks = @()

function Add-Check([string]$Name, [bool]$Ok, [string]$Detail) {
    $script:checks += [pscustomobject]@{ name = $Name; ok = $Ok; detail = $Detail }
}

function Read-DotEnv([string]$Path) {
    $values = @{}
    if (-not (Test-Path $Path)) {
        return $values
    }
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }
        $parts = $trimmed -split '=', 2
        if ($parts.Count -eq 2) {
            $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
        }
    }
    return $values
}

$nodeVersion = ''
try {
    $nodeVersion = (& node --version) | Select-Object -First 1
    $nodeMajor = [int](($nodeVersion -replace '^v', '') -split '\.')[0]
    Add-Check 'node' ($nodeMajor -ge 22) "$nodeVersion (22 or newer is required for the built-in WebSocket)"
}
catch {
    Add-Check 'node' $false 'node was not found on PATH'
}

$allChromeCandidates = @(
    $env:CHROME_PATH,
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$chromeCandidates = @($allChromeCandidates | Where-Object { $_ -and (Test-Path $_) })
if ($chromeCandidates.Count -gt 0) {
    Add-Check 'browser' $true ($chromeCandidates | Select-Object -First 1)
}
else {
    Add-Check 'browser' $false 'Chrome or Edge was not found. Set CHROME_PATH.'
}

$backendOk = $false
try {
    $health = Invoke-RestMethod -Uri "$BackendUrl/api/v1/health" -TimeoutSec 5
    $backendOk = $health.status -eq 'ok'
    Add-Check 'backend' $backendOk "$BackendUrl/api/v1/health"
}
catch {
    Add-Check 'backend' $false "No healthy backend on $BackendUrl. Run launch.ps1."
}

$frontendOk = $false
try {
    $frontend = Invoke-WebRequest -Uri $FrontendUrl -TimeoutSec 5 -UseBasicParsing
    $frontendOk = $frontend.StatusCode -eq 200 -and $frontend.Content -match 'id="root"'
    Add-Check 'frontend' $frontendOk "$FrontendUrl (Vite root found: $frontendOk)"
}
catch {
    Add-Check 'frontend' $false "No Vite app on $FrontendUrl. Run launch.ps1."
}

$fileEnv = Read-DotEnv (Join-Path $RepoRoot '.env.verify')
$email = if ($env:SETPLATE_VERIFY_EMAIL) { $env:SETPLATE_VERIFY_EMAIL } else { $fileEnv['SETPLATE_VERIFY_EMAIL'] }
$password = if ($env:SETPLATE_VERIFY_PASSWORD) { $env:SETPLATE_VERIFY_PASSWORD } else { $fileEnv['SETPLATE_VERIFY_PASSWORD'] }
$hasCredentials = [bool]$email -and [bool]$password
Add-Check 'credentials' $hasCredentials 'SETPLATE_VERIFY_EMAIL and SETPLATE_VERIFY_PASSWORD from env or .env.verify'

$loginOk = $false
$userId = $null
if ($hasCredentials -and $backendOk) {
    try {
        $body = @{ email = $email; password = $password } | ConvertTo-Json -Compress
        $login = Invoke-RestMethod -Uri "$BackendUrl/api/v1/users/login" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 30
        $userId = [string]$login.id
        $loginOk = [bool]$userId
        $prefix = if ($userId.Length -gt 8) { $userId.Substring(0, 8) } else { $userId }
        Add-Check 'login' $loginOk "user_id_prefix=$prefix"
    }
    catch {
        Add-Check 'login' $false "POST /api/v1/users/login failed: $($_.Exception.Message)"
    }
}
else {
    Add-Check 'login' $false 'skipped because credentials or the backend are missing'
}

$hasPlan = $null
$completedToday = $null
if ($loginOk) {
    try {
        $summary = Invoke-RestMethod -Uri "$BackendUrl/api/v1/dashboard/summary?user_id=$userId" -TimeoutSec 30
        $hasPlan = [bool]$summary.plan
        $completedToday = [bool]$summary.completed_workout_today
        $homeSafe = $hasPlan -or $completedToday
        Add-Check 'home_plan' $true "has_plan_today=$hasPlan completed_workout_today=$completedToday home_safe=$homeSafe"
    }
    catch {
        Add-Check 'home_plan' $true "could not read the dashboard summary: $($_.Exception.Message)"
    }
}

$required = $checks | Where-Object { $_.name -ne 'home_plan' }
$ok = -not ($required | Where-Object { -not $_.ok })

$prefixForOutput = if ($userId -and $userId.Length -gt 8) { $userId.Substring(0, 8) } else { $userId }

[pscustomobject]@{
    ok = $ok
    checks = $checks
    user_id_prefix = $prefixForOutput
    has_plan_today = $hasPlan
    completed_workout_today = $completedToday
    home_safe = if ($loginOk) { [bool]$hasPlan -or [bool]$completedToday } else { $null }
} | ConvertTo-Json -Depth 6

if (-not $ok) {
    exit 1
}
