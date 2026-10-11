param(
    [switch]$Uninstall,
    [ValidateSet('User', 'Process')][string]$PathScope = 'User',
    [string]$PreviousFolder = (Join-Path $env:USERPROFILE 'Desktop\codex-limits')
)

$ErrorActionPreference = 'Stop'
$folder = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$previous = [IO.Path]::GetFullPath($PreviousFolder).TrimEnd('\')

if (-not $Uninstall) {
    # Overlay upgrades and the standalone install may leave the old launcher.
    # Only copies matching our launcher are eligible for cleanup.
    $launcher = [IO.File]::ReadAllText((Join-Path $folder 'codexli.cmd')).Replace("`r`n", "`n").Trim()
    foreach ($legacyFolder in @($folder, $previous)) {
        $legacyLauncher = Join-Path $legacyFolder 'codex-limits.cmd'
        if (Test-Path -LiteralPath $legacyLauncher -PathType Leaf) {
            $legacy = [IO.File]::ReadAllText($legacyLauncher).Replace("`r`n", "`n").Trim()
            if ($legacy -eq $launcher) { Remove-Item -LiteralPath $legacyLauncher }
        }
    }
}

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
else { 'Installed codexli from this repository. Open a new PowerShell window.' }
