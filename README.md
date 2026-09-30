# Claude Limits

A private Windows command for the usage values Claude actually exposes, including free accounts.

```powershell
claudeli
claudeli --watch
```

The command shows the 5-hour and weekly percentages and reset times. Watch refreshes every five minutes; press Ctrl+C to stop.

**Free-plan readings use allowance.** Claude's read-only usage endpoint returns empty data on the tested free account. Claude does provide exact percentages in reply events. When the endpoint has no numbers, this tool sends `Reply with a single dot.` in a temporary conversation, reads the quota event, and attempts to delete that conversation. It never estimates usage. A watch left running performs up to 12 tiny probes per hour.

## Setup

Requires Windows and Node.js 22.13+ with `node:sqlite`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

Quit Claude Desktop from its tray menu once, then run `claudeli --connect`. You can reopen Desktop afterward. This connection lasts until its background helper stops or Windows restarts. Repeat the connection step after changing Claude accounts or signing in again.

`claudeli --stop` stops the helper and forgets its in-memory login session. `claudeli --help` lists commands.

Cookies are read only from your local Claude Desktop profile, unlocked through Windows DPAPI, and kept in memory. Authenticated requests go only to `https://claude.ai`; redirects are blocked. The helper uses an authenticated local Windows named pipe. It saves only the last usage percentages/reset times and a random local pipe token, never cookies, prompts, reply text, or account identifiers. Runtime files are ignored by Git.

The command works from any PowerShell folder through `%USERPROFILE%\.local\bin\claudeli.cmd`. Private Claude endpoints may change; missing data and failed requests are reported instead of fabricated readings.

```powershell
npm test
```
