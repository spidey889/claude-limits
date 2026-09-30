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

function Format-LimitLine([string]$Label, [int]$Minutes, $Snapshot) {
    $remaining = 'unavailable'
    $reset = 'unavailable'
    $note = 'no local rate-limit data'
    if ($Snapshot) {
        $note = 'cached; may be out of date'
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
                    $reset = $resetAt.ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss zzz', [Globalization.CultureInfo]::InvariantCulture)
                    # A past reset is not evidence of a fresh 100% allowance.
                    if ($resetAt -le [DateTimeOffset]::UtcNow) { $note = 'cached; reset passed; out of date' }
                } catch { }
            }
        }
    }
    return "${Label}: $remaining | resets $reset ($note)"
}

$snapshot = $null
try { $snapshot = Get-SavedLimits } catch { }
Format-LimitLine '5-hour' 300 $snapshot
Format-LimitLine 'Weekly' 10080 $snapshot
