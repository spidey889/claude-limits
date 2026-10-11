$ErrorActionPreference = 'Stop'
function Stop-ClaudeInstallForNode {
    [Console]::Error.WriteLine('claudeli needs Node.js 22.13 or newer.')
    [Console]::Error.WriteLine('Install Node.js, reopen PowerShell, then run this installer again.')
    exit 1
}
$claudeNodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue
if (-not $claudeNodeCommand) { Stop-ClaudeInstallForNode }
$claudeNode = $claudeNodeCommand.Source
# Check before writing anything. Keep the probe compatible with old Node syntax,
# and exit immediately to avoid printing SQLite warnings or a module stack trace.
& $claudeNode -e "var v = process.versions.node.split('.'); if (+v[0] < 22 || (+v[0] === 22 && +v[1] < 13)) process.exit(1); try { require('node:sqlite'); process.exit(0); } catch (error) { process.exit(1); }"
if ($LASTEXITCODE -ne 0) { Stop-ClaudeInstallForNode }
$claudeBin = Join-Path $env:USERPROFILE '.local\bin'
$claudeLauncher = Join-Path $claudeBin 'claudeli.cmd'
$claudeSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\cli.cjs'))
New-Item -ItemType Directory -Path $claudeBin -Force | Out-Null
if (Test-Path -LiteralPath $claudeLauncher) {
    if ((Get-Content -LiteralPath $claudeLauncher -Raw) -notmatch 'cli\.cjs') {
        throw 'An unrelated claudeli command already exists.'
    }
}
$claudeCommand = "@echo off`r`n`"$claudeNode`" --disable-warning=ExperimentalWarning `"$claudeSource`" %*`r`n"
Set-Content -LiteralPath $claudeLauncher -Value $claudeCommand -Encoding ascii
$claudeUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($claudeUserPath -split ';') -notcontains $claudeBin) {
    [Environment]::SetEnvironmentVariable('Path', ($claudeUserPath.TrimEnd(';') + ';' + $claudeBin), 'User')
}
if (($env:Path -split ';') -notcontains $claudeBin) { $env:Path += ';' + $claudeBin }
Write-Output 'Installed claudeli. Sign in to Claude Desktop, then run claudeli; it connects automatically.'
