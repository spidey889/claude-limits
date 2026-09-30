# Current behavior

This repository contains two independent providers. Root Node modules and `test/` belong to Claude; `codex/` contains the complete offline PowerShell tool and its checks. Credentials, quota values, and fallback behavior are never shared between providers.

## Installation and verification

Root `install.ps1` installs both providers by default, or selects one with `-Tool Claude` / `-Tool Codex`. `scripts/install-claude.ps1` owns the existing `%USERPROFILE%\.local\bin\claudeli.cmd` launcher. Its target remains root `cli.cjs`, so existing Claude helpers and connections continue working.

`codex/install.ps1` installs its module folder on user PATH, removing only its previous standalone Desktop folder and duplicate current-module entries. It preserves unrelated entries in order. `-Uninstall` removes those Codex entries; `-PathScope Process` enables registry-free installer checks. The old source folder is preserved while installed commands resolve to this repo.

Root `tests.ps1` and `npm test` run both suites. Provider-specific npm scripts allow isolated checks. Test fixtures and Claude runtime files are excluded from Git.

## Claude

`claudeli` connects to a hidden Node helper through a token-authenticated Windows named pipe. First connection reads Desktop's cookie database while Desktop is quit because Chromium locks it. Current-user DPAPI and AES-GCM unlock the session; the helper keeps credentials in memory so Desktop can reopen. Installed Claude files and security settings are unchanged.

Each reading first requests the authenticated organization usage endpoint. If any overall account window is exposed, its REST values are shown directly. If both are missing, one temporary dot-message probe supplies a real `message_limit` event. REST utilization is a percentage; SSE utilization is a fraction. Missing windows remain unavailable, and a passed reset never silently clears usage.

Each probe confirms temporary mode before sending. Completions are never automatically retried. Cleanup targets only that invocation's conversation; cleanup failure does not discard measured usage. Stream text is discarded. Concurrent reads share one probe; replies observed within ten seconds are reused to prevent duplicates.

Watch reads every five minutes only while its command is running. The helper does not poll independently. `.usage-snapshot.json` stores only measured usage and timestamps; `.runtime-key` stores a random local pipe token. Saved readings are diagnostic, never substituted for failed live requests. Reconnect after account changes because the helper is bound to the Desktop account active at connection time. Authenticated HTTP redirects are blocked.

## Codex

`codex/codex-limits.cmd` invokes Windows PowerShell 5.1 without a profile, targeting `limits.ps1` by its own absolute folder. Its implementation filename avoids PowerShell selecting a policy-blocked `codex-limits.ps1`.

The command reads JSONL files under `CODEX_HOME/sessions` and `archived_sessions`, defaulting to the user's `.codex`. UNC roots are refused. It accepts only actual `event_msg` / `token_count` events with non-null account `rate_limits` for `limit_id=codex` or legacy absent IDs. Embedded conversation text and model-specific buckets cannot replace account observations. The newest event timestamp wins across active and archived sessions.

Readers share active files with writers and ignore incomplete/malformed lines. Files are checked newest-modified first; with append-only logs, scanning stops when file modification predates the best observation. Artificially backdated modification times can invalidate that optimization.

Window durations identify 300-minute and 10080-minute limits. Remaining percentage is `max(0, 100 - used_percent)`, formatted to one decimal at most. Missing/invalid fields remain unavailable. Reset seconds become local times with UTC offsets. Exactly two lines are printed, including absent data. All observations are labeled cached; passed resets are labeled out of date, and no post-reset allowance is predicted.

Codex makes no network requests or CLI calls, reads no auth files, and prints or stores no transcripts, paths, credentials, credits, or plan details. It does not validate account identity, so a cached observation may belong to the previous account after switching until Codex records a newer one.
