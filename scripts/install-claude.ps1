$ErrorActionPreference = 'Stop'
$claudeNode = (Get-Command node.exe -ErrorAction Stop).Source
$claudeBin = Join-Path $env:USERPROFILE '.local\bin'
$claudeLauncher = Join-Path $claudeBin 'claudeli.cmd'
$claudeSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\cli.cjs'))
& $claudeNode --disable-warning=ExperimentalWarning -e "require('node:sqlite')"
if ($LASTEXITCODE -ne 0) { throw 'Node.js 22.13 or newer is required.' }
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
Write-Output 'Installed claudeli. Quit Claude Desktop once, then run claudeli --connect.'
