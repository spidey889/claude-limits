# Claude & Codex Limits

Two separate Windows commands in one repository:

| Command | Shows | Source |
| --- | --- | --- |
| `claudeli` | Claude 5-hour and weekly **percent used**, plus reset times | A fresh usage request, or a tiny message probe |
| `codex-limits` | Codex 5-hour and weekly **percent left**, plus reset times | Saved local observations, always marked cached |

The commands keep their own implementations, account data, and behavior. Codex does not use Claude's session helper or message probes.

## Install

Clone or download this repository, open PowerShell in its folder, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

This installs both commands. To install only one:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Tool Claude
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Tool Codex
```

Claude requires Node.js 22.13+ with `node:sqlite`. Codex requires only Windows PowerShell 5.1; it has no Node or CLI dependency. Reopen PowerShell after installation to receive the updated user PATH. The Codex installer replaces the old `%USERPROFILE%\Desktop\codex-limits` PATH entry with this repository's `codex` folder, preserving unrelated entries and leaving the original source folder intact.

## Claude

Quit Claude Desktop from its tray menu once and run `claudeli --connect`, then reopen Desktop. The helper keeps your login session in memory until it stops or Windows restarts. Reconnect after signing in again or switching accounts.

```powershell
claudeli
claudeli --watch
claudeli --stop
```

`claudeli` fetches real usage. Watch refreshes every five minutes; Ctrl+C stops watching. `--stop` forgets the helper's in-memory session.

**Free-plan refreshes use allowance.** On the tested free account, Claude's read-only usage endpoint exposes no numbers. The fallback sends `Reply with a single dot.` in a new temporary conversation, reads its exact quota event, and attempts to delete that conversation. Earlier probe messages never accumulate as context. A running watch may send up to 12 tiny probes per hour. Missing data is reported rather than estimated.

Cookies are unlocked locally through Windows DPAPI and remain in memory. Authenticated requests go only to `https://claude.ai`; redirects are blocked. The helper uses a token-authenticated local Windows named pipe. Only usage measurements and a random local pipe token are saved; both are ignored by Git. No chats, cookies, or account identifiers are stored in this repo.

## Codex

```powershell
codex-limits
```

Codex prints exactly two lines from the newest saved account rate-limit observation. Every reading says **cached; may be out of date**. Passed reset times are explicitly flagged; the command never assumes your allowance is back to 100%. Use Codex normally to record a newer observation, then run it again.

It reads only `~/.codex/sessions` and `~/.codex/archived_sessions`, or those folders under `CODEX_HOME`. It makes no network requests, sends no messages, reads no authentication files, and saves no data. Reset times use the computer's local timezone with its UTC offset. Switching Codex accounts can leave a snapshot from the previous account until a newer observation is recorded.

See [Codex documentation](codex/README.md) for standalone installation and removal.

## Verify

```powershell
npm test
npm run test:claude
npm run test:codex
```

The combined tests run both suites without fetching account limits or sending messages. Codex tests use synthetic files inside its module and remove only those fixtures; installer checks modify only the test process's PATH.

## License

MIT. See [LICENSE](LICENSE).
