param([ValidateSet('All', 'Claude', 'Codex')][string]$Tool = 'All')

$ErrorActionPreference = 'Stop'
if ($Tool -in @('All', 'Claude')) {
    & (Join-Path $PSScriptRoot 'scripts\install-claude.ps1')
}
if ($Tool -in @('All', 'Codex')) {
    & (Join-Path $PSScriptRoot 'codex\install.ps1')
}
