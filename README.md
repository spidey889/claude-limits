# Claude & Codex Limits

Two separate Windows commands in one repository:

| Command | Shows | Source |
| --- | --- | --- |
| `claudeli` | Claude 5-hour and weekly **percent used**, plus reset times | A fresh usage request, or a tiny message probe |
| `codexli` | Codex 5-hour and weekly **percent left**, plus reset times | Saved local observations, always marked cached |

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

For a new Claude-only install with automatic connection, **open Claude Desktop and sign in first**, then paste this block into PowerShell. It downloads the project, installs `claudeli`, quits Claude briefly, connects, and reopens Claude even if connection fails:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    git clone https://github.com/spidey889/claude-limits.git
    if ($LASTEXITCODE -ne 0) { return }
    Set-Location .\claude-limits
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Tool Claude
    if ($LASTEXITCODE -ne 0) { return }
    $claudeSessionId = (Get-Process -Id $PID).SessionId
    $claudeProcesses = @(Get-Process -Name Claude -ErrorAction SilentlyContinue |
        Where-Object { $_.SessionId -eq $claudeSessionId -and $_.Path })
    if (-not $claudeProcesses.Count) {
        Write-Host 'Open Claude Desktop and sign in, then rerun the connection steps.'
        return
    }
    $claudeAppPath = $claudeProcesses[0].Path
    try {
        $claudeProcesses | Where-Object { $_.Path -eq $claudeAppPath } | Stop-Process -ErrorAction Stop
        Start-Sleep -Milliseconds 700
        & "$env:USERPROFILE\.local\bin\claudeli.cmd" --connect
    } finally {
        Start-Process -FilePath $claudeAppPath
    }
}
```

To reconnect after a restart, quit Desktop from its tray menu, run `claudeli --connect`, then reopen Desktop. Reopen PowerShell after setup, then run `claudeli`. Your signed-in Desktop session must already exist; setup cannot sign you in.

Claude requires Node.js 22.13+ with `node:sqlite`. If Node is missing, too old, or lacks SQLite support, the installer explains what to install and asks you to reopen PowerShell and run it again; it stops before changing the launcher or PATH. Codex requires only Windows PowerShell 5.1; it has no Node or CLI dependency. Reopen PowerShell after installation to receive the updated user PATH. The Codex installer replaces the old `%USERPROFILE%\Desktop\codex-limits` PATH entry with this repository's `codex` folder and removes recognized old `codex-limits.cmd` launchers. Unrelated PATH entries and the remaining original source files are preserved.

## Claude

Quit Claude Desktop from its tray menu once and run `claudeli --connect`, then reopen Desktop. The helper keeps your login session in memory until it stops or Windows restarts. Reconnect after signing in again or switching accounts.

```powershell
claudeli
claudeli --watch
claudeli --stop
```

`claudeli` fetches real usage. Watch refreshes every five minutes; Ctrl+C stops watching. `--stop` forgets the helper's in-memory session.

The used percentage comes first so you can see what you have spent at a glance. Solid squares show used allowance; bright hollow squares make the unused portion easy to see. Reset times and the checked time stay secondary:

```text
5h        26% used   ■ ■ ■ □ □ □ □ □ □ □   resets Sun 5:10 PM
Weekly     1% used   □ □ □ □ □ □ □ □ □ □   resets Sun 11:30 AM
Checked 1:07:20 PM
```

Each bar has ten spaced cells, rounded to the nearest cell. A supported terminal always uses purple for used percentages and filled cells, including high usage and passed resets. Reset times stay quieter, with amber text for a passed-reset warning. `NO_COLOR` disables color; redirected output stays plain. Unknown percentages have no bar. Over-limit percentages stay exact while their bars are capped at full. Passed resets remain flagged and never imply replenished allowance.

When Claude rejects a probe with a confirmed usage-limit response, `claudeli` reads the fresh quota included in that response and adds **LIMIT REACHED** to the affected window. The percentage stays exactly as Claude reports it: a blocked window can report 99% rather than 100%. If a generic HTTP 429 includes no confirmed quota, the command reports that exact usage is unavailable; it never turns every 429 into 100% or substitutes an old reading.

Every independent command requests a new observation; only overlapping commands share an in-flight request. Saved readings never replace failed live checks. To keep fresh checks fast, the helper skips an empty read-only endpoint for five minutes after confirming it exposes neither window, returns as soon as both quota windows arrive, and deletes the temporary conversation in the background.

After a successful message probe, the helper prepares at most one **empty temporary chat** for the next command. Preparing it sends no message and measures no quota. The next command sends its single dot request in that unused chat, removing chat setup from its wait while still measuring fresh numbers. Each chat is used for only one message. Unused preparation expires after 30 minutes, and `--stop` attempts to delete it. No background message polling is added. The first check, expired preparation, and failed preparation still need normal setup; Claude's network and reply time remain part of fresh checks. Reconnect the helper after updating its runtime code.

**Free-plan refreshes use allowance.** On the tested free account, Claude's read-only usage endpoint exposes no numbers. The fallback sends `Reply with a single dot.` in a new temporary conversation, reads its exact quota event, and attempts to delete that conversation. Earlier probe messages never accumulate as context. A running watch may send up to 12 tiny probes per hour. Missing data is reported rather than estimated.

Cookies are unlocked locally through Windows DPAPI and remain in memory. Authenticated requests go only to `https://claude.ai`; redirects are blocked. The helper uses a token-authenticated local Windows named pipe. Only usage measurements and a random local pipe token are saved; both are ignored by Git. No chats, cookies, or account identifiers are stored in this repo.

## Codex

```powershell
codexli
```

Codex prints exactly two lines from the newest saved account rate-limit observation, with **percent left** first. Its ten spaced cells match Claude's layout, but solid cells show allowance remaining and hollow cells show allowance used:

```text
5h         5% left   ■ □ □ □ □ □ □ □ □ □   LOW   resets Sun 5:11 PM   cached
Weekly    85% left   ■ ■ ■ ■ ■ ■ ■ ■ ■ □   resets Sun 18 Oct 12:11 PM   cached
```

A supported terminal uses ruby red (`#FF4F55`) for remaining allowance. Below 20% left, a bold amber `LOW` label after the bar makes the warning distinct; the label also appears without color. Reset times and the short **cached** label stay secondary. `NO_COLOR` disables color; redirected output stays plain. Cached observations may be out of date. Passed resets say `reset passed; refresh required`; the command never assumes your allowance is back to 100%. Use Codex normally to record a newer observation, then run it again.

It reads only `~/.codex/sessions` and `~/.codex/archived_sessions`, or those folders under `CODEX_HOME`. It makes no network requests, sends no messages, reads no authentication files, and saves no data. Reset times use the computer's local timezone; weekly resets also show the date. Switching Codex accounts can leave a snapshot from the previous account until a newer observation is recorded.

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
