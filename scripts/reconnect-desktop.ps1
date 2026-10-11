$ErrorActionPreference = 'Stop'
$claudeRestorePath = $null
$claudeRecoveryFailed = $false
try {
    $claudeSessionId = (Get-Process -Id $PID).SessionId
    $claudeProcesses = @(Get-Process -Name Claude -ErrorAction SilentlyContinue |
        Where-Object { $_.SessionId -eq $claudeSessionId -and $_.Path })
    $claudePaths = @($claudeProcesses | Select-Object -ExpandProperty Path -Unique)
    if ($claudePaths.Count -ne 1) { throw 'Desktop process selection failed.' }
    $claudeAppPath = $claudePaths[0]
    # Only the signed Desktop app in this Windows session may be restarted.
    $claudeSignature = Get-AuthenticodeSignature -LiteralPath $claudeAppPath
    if ($claudeSignature.Status -ne 'Valid' -or
        $claudeSignature.SignerCertificate.Subject -notmatch '(?:^|,\s*)O="?Anthropic, PBC"?(?:,|$)') {
        throw 'Desktop signature verification failed.'
    }
    $claudeRestorePath = $claudeAppPath
    $claudeProcesses | Stop-Process -ErrorAction Stop
    $claudeProcesses | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
    [Console]::Out.WriteLine('{"ready":true}')
    # Keep the app closed while Node reads its session. If the CLI exits or
    # crashes, stdin closes and finally still reopens the app. No credentials
    # or account data ever pass through this child process.
    $null = [Console]::ReadLine()
} catch {
    $claudeRecoveryFailed = $true
    [Console]::Out.WriteLine('{"ready":false}')
} finally {
    try {
        if ($claudeRestorePath) { Start-Process -FilePath $claudeRestorePath }
        [Console]::Out.WriteLine('{"restored":true}')
    } catch {
        $claudeRecoveryFailed = $true
        [Console]::Out.WriteLine('{"restored":false}')
    }
}
if ($claudeRecoveryFailed) { exit 1 }
