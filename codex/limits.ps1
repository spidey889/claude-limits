param([string]$CodexHome = $env:CODEX_HOME)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($CodexHome)) {
    $CodexHome = Join-Path $env:USERPROFILE '.codex'
}

function Get-SavedLimits {
    # Refuse UNC paths: checking saved limits must not contact a file server.
    $root = [IO.Path]::GetFullPath($CodexHome)
    if ($root.StartsWith('\\')) { return $null }

    $files = foreach ($folder in @('sessions', 'archived_sessions')) {
        Get-ChildItem -LiteralPath (Join-Path $root $folder) -Filter '*.jsonl' -File -Recurse -ErrorAction SilentlyContinue
    }
    $latest = $null
    foreach ($file in ($files | Sort-Object LastWriteTimeUtc -Descending)) {
        # Normal Codex logs are append-only: an older modification cannot contain
        # a newer observation. This avoids rescanning gigabytes of old sessions.
        if ($latest -and $file.LastWriteTimeUtc -lt $latest.Time.UtcDateTime) { break }
        $reader = $null
        try {
            # Active sessions stay open for writing. Ordinary ReadLines can fail
            # on Windows; explicitly share the file with the writer instead.
            $stream = [IO.File]::Open($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read,
                ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
            $reader = [IO.StreamReader]::new($stream)
            while ($null -ne ($line = $reader.ReadLine())) {
                if ($line -notmatch '"rate_limits"\s*:' -or $line -notmatch '"type"\s*:\s*"token_count"') { continue }
                try {
                    $entry = ConvertFrom-Json -InputObject $line
                    # Never interpret quoted conversation/tool text as a limit.
                    if ($entry.type -ne 'event_msg' -or $entry.payload.type -ne 'token_count') { continue }
                    $limits = $entry.payload.rate_limits
                    if (-not $limits -or ($limits.limit_id -and $limits.limit_id -ne 'codex')) { continue }
                    $time = [DateTimeOffset]::MinValue
                    if (-not [DateTimeOffset]::TryParse($entry.timestamp, [Globalization.CultureInfo]::InvariantCulture,
                            [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$time)) { continue }
                    if (-not $latest -or $time -gt $latest.Time) {
                        $latest = [pscustomobject]@{ Time = $time; Limits = $limits }
                    }
                } catch { } # A concurrently appended final line may be incomplete.
            }
        } catch { } # Missing/unreadable sessions must not leak paths or transcript text.
        finally { if ($reader) { $reader.Dispose() } }
    }
    return $latest
}

function Paint-LimitText([string]$Text, [string]$Code, [bool]$Color) {
    if ($Color) { return [string][char]27 + "[${Code}m" + $Text + [char]27 + '[0m' }
    return $Text
}

function Format-LimitLine([string]$Label, [int]$Minutes, $Snapshot, [bool]$Color = $false) {
    $remaining = 'unavailable'
    $left = $null
    $reset = 'reset unavailable'
    $resetPassed = $false
    $note = 'no local data'
    if ($Snapshot) {
        $note = 'cached'
        # Match window duration, rather than assuming primary/secondary positions.
        $window = @($Snapshot.Limits.primary, $Snapshot.Limits.secondary) |
            Where-Object { $_ -and $_.window_minutes -eq $Minutes } | Select-Object -First 1
        if ($window) {
            $used = 0.0
            if ([double]::TryParse([string]$window.used_percent, [Globalization.NumberStyles]::Float,
                    [Globalization.CultureInfo]::InvariantCulture, [ref]$used) -and
                    -not [double]::IsNaN($used) -and -not [double]::IsInfinity($used) -and $used -ge 0) {
                # Explicit doubles avoid PowerShell selecting an integer Math.Max
                # overload and rounding fractional usage before formatting it.
                $left = [Math]::Max([double]0, ([double]100 - $used))
                $remaining = $left.ToString('0.#', [Globalization.CultureInfo]::InvariantCulture) + '% left'
            }
            $seconds = 0L
            if ([long]::TryParse([string]$window.resets_at, [ref]$seconds) -and $seconds -gt 0) {
                try {
                    $resetAt = [DateTimeOffset]::FromUnixTimeSeconds($seconds)
                    $resetFormat = if ($Minutes -eq 10080) { 'ddd d MMM h:mm tt' } else { 'ddd h:mm tt' }
                    $reset = 'resets ' + $resetAt.ToLocalTime().ToString($resetFormat, [Globalization.CultureInfo]::CurrentCulture)
                    # A past reset is not evidence of a fresh 100% allowance.
                    if ($resetAt -le [DateTimeOffset]::UtcNow) {
                        $resetPassed = $true
                        $reset = 'reset passed; refresh required'
                    }
                } catch { }
            }
        }
    }
    $heading = $Label.PadRight(6) + '  '
    $resetCode = if ($resetPassed) { '93' } else { '90' }
    $suffix = '   ' + (Paint-LimitText $reset $resetCode $Color) + '   ' + (Paint-LimitText $note '90' $Color)
    if ($null -eq $left) { return $heading + $remaining + $suffix }

    # Codex fills remaining allowance; Claude fills used allowance. The label
    # keeps this distinction explicit. Round half-cells up, matching Claude.
    # A custom coral accent stays distinct from PowerShell's yellow command text.
    $code = if ($resetPassed) { '93' } elseif ($left -lt 20) { '91' } else { '38;2;255;153;102' }
    $filled = [int][Math]::Round($left / 10, [MidpointRounding]::AwayFromZero)
    $cells = for ($index = 0; $index -lt 10; $index++) {
        # Character codes keep the script ASCII-safe in Windows PowerShell 5.1.
        if ($index -lt $filled) { Paint-LimitText ([string][char]0x25A0) $code $Color }
        else { Paint-LimitText ([string][char]0x25A1) '37' $Color }
    }
    return $heading + (Paint-LimitText $remaining.PadLeft(10) ('1;' + $code) $Color) + '   ' + ($cells -join ' ') + $suffix
}

$snapshot = $null
try { $snapshot = Get-SavedLimits } catch { }
$color = -not [Console]::IsOutputRedirected -and ($Host.UI.SupportsVirtualTerminal -or $env:WT_SESSION) -and
    $env:TERM -ne 'dumb' -and -not (Test-Path Env:NO_COLOR) -and -not (Test-Path Env:NODE_DISABLE_COLORS)
Format-LimitLine '5h' 300 $snapshot $color
Format-LimitLine 'Weekly' 10080 $snapshot $color
