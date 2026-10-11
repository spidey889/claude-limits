# Current behavior

This repository contains two independent providers. Root Node modules and `test/` belong to Claude; `codex/` contains the complete offline PowerShell tool and its checks. Credentials, quota values, and fallback behavior are never shared between providers.

## Installation and verification

Root `install.ps1` installs both providers by default, or selects one with `-Tool Claude` / `-Tool Codex`. `scripts/install-claude.ps1` owns the existing `%USERPROFILE%\.local\bin\claudeli.cmd` launcher. Its target remains root `cli.cjs`, so existing Claude helpers and connections continue working.

`codex/install.ps1` installs its module folder on user PATH, removing only its previous standalone Desktop folder and duplicate current-module entries. It preserves unrelated entries in order. Installation removes old `codex-limits.cmd` files from the current and previous folders only when their normalized contents match the new launcher. Remaining old source files and unrelated launchers are preserved. `-Uninstall` removes the Codex PATH entries; `-PathScope Process` enables registry-free installer checks. Installed commands resolve to this repo.

Root `tests.ps1` and `npm test` run both suites. Provider-specific npm scripts allow isolated checks. Test fixtures and Claude runtime files are excluded from Git.

## Claude

`claudeli` connects to a hidden Node helper through a token-authenticated Windows named pipe. First connection reads Desktop's cookie database while Desktop is quit because Chromium locks it. Current-user DPAPI and AES-GCM unlock the session; the helper keeps credentials in memory so Desktop can reopen. Installed Claude files and security settings are unchanged.

Each fresh reading requests the authenticated organization usage endpoint unless this helper has confirmed both overall account windows are missing within the last five minutes. This short-lived availability hint stays in memory; after five minutes the endpoint is checked again. If any overall account window is exposed, its REST values are shown directly. Otherwise, one temporary dot-message probe supplies a real `message_limit` event. REST utilization is a percentage; SSE utilization is a fraction. Missing windows remain unavailable, and a passed reset never silently clears usage. Endpoint failures propagate without triggering a probe or showing saved readings.

Each probe confirms temporary mode before sending. Completions are never automatically retried. The stream returns as soon as a quota event exposes both account windows; exiting its async iterator cancels the remaining HTTP stream. Partial quota events continue until both windows arrive or the stream ends. Cleanup targets only that invocation's conversation, including malformed creation responses, and runs in the background inside the long-lived helper. Cleanup failure does not discard measured usage. Stream text is discarded. Concurrent reads share one probe; readings observed within ten seconds are reused to prevent duplicates only while their reset timestamps have not passed. A backwards clock change invalidates reuse.

Watch reads every five minutes only while its command is running. The helper does not poll independently. `.usage-snapshot.json` stores only measured usage and timestamps; `.runtime-key` stores a random local pipe token. Saved readings are diagnostic, never substituted for failed live requests. Reconnect after account changes because the helper is bound to the Desktop account active at connection time. Authenticated HTTP redirects are blocked.

Claude output keeps two quota rows plus the checked timestamp. Output leads with the measured percent used, formatted to one decimal at most. Ten spaced solid/hollow squares show used/unused portions, rounded to the nearest cell. Unknown percentages have no bar. Only bar fill is capped at 100%; over-limit percentages remain exact. Passed resets remain flagged rather than implying replenished allowance. The same formatter serves one-shot and watch output, without extra requests or dependencies.

On a TTY with Node's detected color support, used allowance is bold purple below 50%, amber from 50%, and red from 80%. Passed resets use amber for the reading and warning. Hollow unused cells use bright neutral text for visibility; future reset times and the checked timestamp use quieter gray. Text and shapes carry the same meaning without color. Color detection honors `NO_COLOR` and `NODE_DISABLE_COLORS`; redirected output has no ANSI styling.

## Codex

`codex/codexli.cmd` provides the `codexli` command and invokes Windows PowerShell 5.1 without a profile, targeting `limits.ps1` by its own absolute folder. Its implementation filename avoids PowerShell selecting a policy-blocked `codexli.ps1`. The old `codex-limits` command is retired.

The command reads JSONL files under `CODEX_HOME/sessions` and `archived_sessions`, defaulting to the user's `.codex`. UNC roots are refused. It accepts only actual `event_msg` / `token_count` events with non-null account `rate_limits` for `limit_id=codex` or legacy absent IDs. Embedded conversation text and model-specific buckets cannot replace account observations. The newest event timestamp wins across active and archived sessions.

Readers share active files with writers and ignore incomplete/malformed lines. Files are checked newest-modified first; with append-only logs, scanning stops when file modification predates the best observation. Artificially backdated modification times can invalidate that optimization.

Window durations identify 300-minute and 10080-minute limits. Remaining percentage is `max(0, 100 - used_percent)`, formatted to one decimal at most. Exactly two lines lead with percent left, then ten spaced solid/hollow cells for remaining/used allowance. Fill rounds to the nearest cell with half-cells rounded up, matching Claude. Missing/invalid percentages remain unavailable and have no bar. Reset seconds become compact local weekday/time text; weekly resets include the date. All observations carry a short `cached` label; passed resets say `reset passed; refresh required`, and no post-reset allowance is predicted.

On a non-redirected console supporting virtual-terminal styling (including Windows Terminal), Codex highlights remaining allowance in bold yellow and switches to red below 20% left. Passed resets use yellow for the reading and warning. Hollow used cells are bright neutral text; future resets and cache labels are quieter gray. `NO_COLOR`, `NODE_DISABLE_COLORS`, dumb terminals, and redirected output disable styling. Character codes preserve square glyphs without requiring non-ASCII PowerShell source or an encoding change.

Codex makes no network requests or CLI calls, reads no auth files, and prints or stores no transcripts, paths, credentials, credits, or plan details. It does not validate account identity, so a cached observation may belong to the previous account after switching until Codex records a newer one.
