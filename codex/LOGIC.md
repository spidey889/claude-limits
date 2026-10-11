# Current behavior

- `codexli.cmd` provides the `codexli` command, starts Windows PowerShell 5.1 with no profile, and runs
  `limits.ps1` using its own absolute folder. This works independently of the caller's
  folder and avoids installing PowerShell profile functions. The implementation has a
  different filename so PowerShell cannot select a policy-blocked `codexli.ps1`
  instead of the launcher.
- Installation updates the user's PATH and removes recognized old `codex-limits.cmd`
  launchers from the current and previous folders. Only normalized content matches
  qualify for deletion; remaining source files and unrelated launchers are preserved.
  `install.ps1` is repeatable and supports `-Uninstall`; it preserves unrelated entries
  and migrates the previous standalone Desktop PATH entry. `-PathScope Process`
  enables installer checks without changing the user registry. The root repository
  installer can select this module or install it alongside the separate Claude tool.
- The old `codex-limits` command is retired; no compatibility alias is installed.
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
  say unavailable and unknown percentages have no bar. Reset seconds become compact
  local weekday/time text; weekly resets include the date.
- Output leads with percent left, followed by ten spaced solid/hollow squares for
  remaining/used allowance. Fill rounds to the nearest cell, with half-cells rounded
  up. This matches Claude's layout while keeping Codex's remaining-allowance meaning.
- On a non-redirected console supporting virtual-terminal styling (including Windows
  Terminal), allowance is bold green from 50% left, amber below 50%, and red below
  20%. Passed resets use amber. Hollow cells are bright neutral text; future resets
  and cache labels are quieter gray. `NO_COLOR`, `NODE_DISABLE_COLORS`, dumb terminals,
  and redirected output disable styling. Square glyphs use character codes so the
  source remains compatible with Windows PowerShell 5.1 without an encoding change.
- Exactly two lines are printed, including on absent/unreadable data. Cached limits
  always carry a short `cached` label; expired resets say `reset passed; refresh required`.
  Percentages are historical observations, never predictions of an allowance after reset.
- There are no network operations or CLI invocations in the finished command. There
  is no account identity validation: after switching accounts, a cached snapshot may
  remain from the previous account until a new one is recorded.
