# Current behavior

- `codex-limits.cmd` starts Windows PowerShell 5.1 with no profile and runs
  `limits.ps1` using its own absolute folder. This works independently of the caller's
  folder and avoids installing PowerShell profile functions. The implementation has a
  different filename so PowerShell cannot select a policy-blocked `codex-limits.ps1`
  instead of the launcher.
- The only installation change outside this folder is the user's PATH setting.
  `install.ps1` is repeatable and supports `-Uninstall`; it preserves unrelated entries
  and migrates the previous standalone Desktop PATH entry. `-PathScope Process`
  enables installer checks without changing the user registry. The root repository
  installer can select this module or install it alongside the separate Claude tool.
- `limits.ps1` reads JSONL files under `CODEX_HOME/sessions` and `archived_sessions`,
  defaulting to the user's `.codex`. UNC roots are refused to avoid file-server traffic.
- Only actual `event_msg` / `token_count` events with non-null `rate_limits` for
  `limit_id=codex` (or legacy absent IDs) are considered. The newest event timestamp
  wins across sessions. Model-specific limit buckets and embedded conversation text
  cannot replace the account bucket.
- Files are checked newest-modified first. With normal append-only Codex logs, once
  a file's modification precedes the best observation, older files can be skipped.
  Artificially backdating log modification times can invalidate this optimization.
- Readers share open files with writers and ignore incomplete/malformed lines. No
  session contents, paths, credentials, credits, or plan details are printed or stored.
- Windows are identified by duration: 300 minutes and 10080 minutes. Percent left is
  `max(0, 100 - used_percent)`, formatted to one decimal at most. Invalid/missing fields
  say unavailable. Reset seconds are converted to local time with a UTC offset.
- Exactly two lines are printed, including on absent/unreadable data. Cached limits
  always carry a staleness note; expired resets carry an explicit out-of-date note.
  Percentages are historical observations, never predictions of an allowance after reset.
- There are no network operations or CLI invocations in the finished command. There
  is no account identity validation: after switching accounts, a cached snapshot may
  remain from the previous account until a new one is recorded.
