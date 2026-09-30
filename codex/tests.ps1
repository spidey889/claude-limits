$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath($PSScriptRoot)
$testRoot = Join-Path $project ('.test-' + [Guid]::NewGuid().ToString('N'))
$originalPath = $env:Path
$originalCodexHome = $env:CODEX_HOME
$heldFile = $null
$checks = 0

function Assert([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:checks++
}

function New-Event($Time, $Used = 12.5, $WeeklyUsed = 40, $Reset = $future, $Bucket = 'codex') {
    return [ordered]@{
        timestamp = $Time.ToString('o')
        type = 'event_msg'
        payload = @{
            type = 'token_count'
            rate_limits = @{
                limit_id = $Bucket
                primary = @{ used_percent = $Used; window_minutes = 300; resets_at = $Reset }
                secondary = @{ used_percent = $WeeklyUsed; window_minutes = 10080; resets_at = $future + 604800 }
            }
        }
    }
}

function Save-Events([string]$Name, $Events) {
    $lines = @($Events | ForEach-Object { ConvertTo-Json -InputObject $_ -Depth 10 -Compress })
    [IO.File]::WriteAllText((Join-Path $testRoot $Name), ($lines -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
}

function Run-Limits {
    $output = @(& (Join-Path $project 'codex-limits.cmd') -CodexHome $testRoot 2>&1)
    Assert ($output.Count -eq 2) 'The command must emit exactly two lines, including errors.'
    Assert ($output[0] -is [string] -and $output[1] -is [string]) 'Unexpected error output.'
    return $output
}

try {
    $null = New-Item -ItemType Directory -Path (Join-Path $testRoot 'sessions'), (Join-Path $testRoot 'archived_sessions')
    $now = [DateTimeOffset]::UtcNow
    $future = $now.AddDays(1).ToUnixTimeSeconds()
    $newer = New-Event $now.AddMinutes(-1)
    $older = New-Event $now.AddMinutes(-2) 95 80
    Save-Events 'sessions\newer.jsonl' @($newer)
    # Write the older observation last: modification order must not pick its value.
    Save-Events 'sessions\older.jsonl' @($older)
    $output = Run-Limits
    $localReset = [DateTimeOffset]::FromUnixTimeSeconds($future).ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss zzz')
    Assert ($output[0] -eq "5-hour: 87.5% left | resets $localReset (cached; may be out of date)") ("Wrong percentage, local reset, or newest observation. Actual: " + $output[0])
    Assert ($output[1] -like 'Weekly: 60% left | resets * (cached; may be out of date)') 'Wrong weekly allowance.'

    $wrongBucket = New-Event $now.AddSeconds(-10) 99 99 $future 'codex_other'
    $quoted = @{ timestamp = $now.ToString('o'); type = 'response_item'; payload = $wrongBucket.payload }
    $nullLimits = @{ timestamp = $now.ToString('o'); type = 'event_msg'; payload = @{ type = 'token_count'; rate_limits = $null } }
    Save-Events 'sessions\newer.jsonl' @($newer, $wrongBucket, $quoted, $nullLimits)
    [IO.File]::AppendAllText((Join-Path $testRoot 'sessions\newer.jsonl'), '{"timestamp":"incomplete')
    $heldFile = [IO.File]::Open((Join-Path $testRoot 'sessions\newer.jsonl'), [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
    $output = Run-Limits
    Assert ($output[0] -like '5-hour: 87.5% left*') 'Locked file, malformed trailing line, null snapshot, or non-account data displaced valid limits.'
    $heldFile.Dispose()
    $heldFile = $null

    $archived = New-Event $now.AddSeconds(-5) 0 10
    Save-Events 'archived_sessions\latest.jsonl' @($archived)
    $output = Run-Limits
    Assert ($output[0] -like '5-hour: 100% left*' -and $output[1] -like 'Weekly: 90% left*') 'Newest archived observation was missed.'

    $expired = New-Event $now.AddSeconds(-4) 100 10 ($now.AddHours(-1).ToUnixTimeSeconds())
    Save-Events 'archived_sessions\latest.jsonl' @($expired)
    $output = Run-Limits
    Assert ($output[0] -like '5-hour: 0% left* (cached; reset passed; out of date)') 'Past reset was not flagged, or fresh allowance was guessed.'

    $invalid = New-Event $now.AddSeconds(-3) $null 130 $null
    Save-Events 'archived_sessions\latest.jsonl' @($invalid)
    $output = Run-Limits
    Assert ($output[0] -eq '5-hour: unavailable | resets unavailable (cached; may be out of date)') 'Missing fields became fabricated percentages or reset times.'
    Assert ($output[1] -like 'Weekly: 0% left*') 'Over-limit usage produced a negative allowance.'

    $swapped = New-Event $now.AddSeconds(-2) 25 50
    $swapped.payload.rate_limits.Remove('limit_id')
    $primary = $swapped.payload.rate_limits.primary
    $swapped.payload.rate_limits.primary = $swapped.payload.rate_limits.secondary
    $swapped.payload.rate_limits.secondary = $primary
    Save-Events 'archived_sessions\latest.jsonl' @($swapped)
    $output = Run-Limits
    Assert ($output[0] -like '5-hour: 75% left*' -and $output[1] -like 'Weekly: 50% left*') 'Legacy bucket IDs or reversed window positions are unsupported.'

    $swapped.payload.rate_limits.primary = $null
    Save-Events 'archived_sessions\latest.jsonl' @($swapped)
    $output = Run-Limits
    Assert ($output[1] -like 'Weekly: unavailable | resets unavailable*') 'Missing latest window was backfilled from an older snapshot.'

    $env:Path = $project + ';' + $env:Path
    $env:CODEX_HOME = $testRoot
    Push-Location $env:USERPROFILE
    try { $output = @(codex-limits 2>&1) } finally { Pop-Location }
    Assert ($output.Count -eq 2 -and $output[0] -like '5-hour: 75% left*') 'Bare command failed from another folder or ignored CODEX_HOME.'

    foreach ($missingRoot in @((Join-Path $testRoot 'absent'), '\\127.0.0.1\never-contact-this-share')) {
        $output = @(& (Join-Path $project 'codex-limits.cmd') -CodexHome $missingRoot 2>&1)
        Assert ($output.Count -eq 2 -and $output[0] -eq '5-hour: unavailable | resets unavailable (no local rate-limit data)' -and
            $output[1] -eq 'Weekly: unavailable | resets unavailable (no local rate-limit data)') 'Missing or non-local data emitted extra output.'
    }
    # Exercise migration without writing the owner's registry PATH.
    $previousFolder = Join-Path $testRoot 'old-codex-limits'
    $unrelatedFolder = Join-Path $testRoot 'unrelated-tool'
    $env:Path = $previousFolder + ';' + $unrelatedFolder + ';' + $project + ';' + $originalPath
    $null = & (Join-Path $project 'install.ps1') -PathScope Process -PreviousFolder $previousFolder
    Assert (($env:Path -split ';') -notcontains $previousFolder) 'The old standalone PATH entry survived migration.'
    Assert ((@($env:Path -split ';' | Where-Object { $_ -eq $project })).Count -eq 1) 'The merged command folder is missing or duplicated.'
    Assert (($env:Path -split ';') -contains $unrelatedFolder) 'Installation removed an unrelated PATH entry.'
    Assert ((Get-Command codex-limits).Source -eq (Join-Path $project 'codex-limits.cmd')) 'The global command still resolves to the old folder.'
    $installedPath = $env:Path
    $null = & (Join-Path $project 'install.ps1') -PathScope Process -PreviousFolder $previousFolder
    Assert ($env:Path -eq $installedPath) 'Repeating installation changed or duplicated PATH entries.'
    $null = & (Join-Path $project 'install.ps1') -Uninstall -PathScope Process -PreviousFolder $previousFolder
    Assert (($env:Path -split ';') -notcontains $project) 'Uninstall left the merged command folder in PATH.'
    Assert (($env:Path -split ';') -contains $unrelatedFolder) 'Uninstall removed an unrelated PATH entry.'
    "Passed $checks checks."
} finally {
    if ($heldFile) { $heldFile.Dispose() }
    $env:Path = $originalPath
    $env:CODEX_HOME = $originalCodexHome
    # Delete only this run's synthetic fixtures, after verifying their absolute root.
    $resolved = [IO.Path]::GetFullPath($testRoot)
    if ($resolved.StartsWith($project + '\', [StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($resolved) -match '^\.test-[0-9a-f]{32}$' -and (Test-Path -LiteralPath $resolved)) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
