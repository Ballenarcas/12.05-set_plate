[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$SkillDir = Split-Path -Parent $PSScriptRoot
$RunDir = Join-Path $SkillDir '.run'
$modeFile = Join-Path $RunDir 'mode'
$mode = if (Test-Path $modeFile) { (Get-Content $modeFile -Raw).Trim() } else { 'none' }
$stopped = @()

if ($mode -eq 'managed') {
    foreach ($kind in 'backend', 'frontend') {
        $pidFile = Join-Path $RunDir "$kind.pid"
        if (-not (Test-Path $pidFile)) {
            continue
        }
        $record = Get-Content $pidFile -Raw | ConvertFrom-Json
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)" -ErrorAction SilentlyContinue
        if ($process) {
            $expected = if ($kind -eq 'backend') { 'uvicorn' } else { 'vite' }
            if ($process.CommandLine -and $process.CommandLine.Contains($expected)) {
                Stop-Process -Id $record.pid -Force -ErrorAction SilentlyContinue
                $stopped += $record.pid
            }
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
}

Get-ChildItem $RunDir -Directory -Filter 'chrome-profile-*' -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

if ($mode -eq 'managed') {
    Remove-Item $modeFile -Force -ErrorAction SilentlyContinue
}

[pscustomobject]@{
    mode = $mode
    stopped = $stopped
    evidence = (Join-Path $SkillDir 'evidence')
} | ConvertTo-Json -Compress
