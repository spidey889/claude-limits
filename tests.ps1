$ErrorActionPreference = 'Stop'
$limitsNode = (Get-Command node.exe -ErrorAction Stop).Source
$claudeTests = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'test') -Filter '*.test.cjs' | ForEach-Object FullName)
& $limitsNode --test $claudeTests
if ($LASTEXITCODE -ne 0) { throw 'Claude tests failed.' }

& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'codex\tests.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Codex tests failed.' }
Write-Output 'Claude and Codex checks passed.'
