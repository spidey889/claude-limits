param(
    [switch]$Uninstall,
    [ValidateSet('User', 'Process')][string]$PathScope = 'User',
    [string]$PreviousFolder = (Join-Path $env:USERPROFILE 'Desktop\codex-limits')
)

$ErrorActionPreference = 'Stop'
$folder = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$previous = [IO.Path]::GetFullPath($PreviousFolder).TrimEnd('\')

function Update-CodexPath([string]$Value) {
    # Remove only this command's current/previous folders. Keep unrelated PATH
    # entries in their original order, including their original spelling.
    $entries = @($Value -split ';' | Where-Object {
        $key = [Environment]::ExpandEnvironmentVariables($_.Trim().Trim('"')).TrimEnd('\')
        $key -ne $folder -and $key -ne $previous
    })
    if (-not $Uninstall) { $entries = @($folder) + $entries }
    return $entries -join ';'
}

if ($PathScope -eq 'User') {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $newPath = Update-CodexPath $userPath
    if ($newPath -ne $userPath) {
        # Never copy the machine PATH into the user registry or use setx.
        [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    }
}
$env:Path = Update-CodexPath $env:Path
if ($Uninstall) { 'Removed Codex Limits from your PATH.' }
else { 'Installed codex-limits from this repository. Open a new PowerShell window.' }
