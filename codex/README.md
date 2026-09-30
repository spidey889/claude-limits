# Codex Limits

The independent offline Codex command in the [combined repository](../README.md).

```powershell
codex-limits
```

It prints exactly two lines: saved 5-hour and weekly **percent left** and reset time. Every reading is marked **cached; may be out of date**. A past reset is explicitly flagged; missing fields say `unavailable`. The command never guesses your post-reset allowance. Use Codex normally to record a newer observation, then run it again.

It reads `~/.codex/sessions` and `~/.codex/archived_sessions`, or those folders under `CODEX_HOME`. It makes no network requests, sends no messages, invokes no Codex CLI, reads no authentication files, and writes nothing. Local reset times include their UTC offset. After account changes, a saved observation may belong to the previous account until Codex records a newer one.

## Setup

From the repository root, install only Codex:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Tool Codex
```

Or run this module's installer directly from its folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

Only this module folder is added to user PATH. The previous `%USERPROFILE%\Desktop\codex-limits` PATH entry is removed during migration; its source files remain intact. Unrelated PATH entries and PowerShell profiles are preserved. Reopen PowerShell after installation. To remove the Codex PATH entries, run this module's installer with `-Uninstall`.

Requires Windows PowerShell 5.1, with no Node, administrator rights, dependencies, or CLI installation. `Bypass` affects only the installer process, not the saved execution policy.

## Verify

From this module folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests.ps1
```

Checks cover active/archived observations, account-bucket filtering, incomplete and locked files, missing data, fractional usage, passed resets, command resolution, and repeatable PATH migration. Fixtures are created here and removed afterward. Installer checks modify only their process PATH, never the user registry.

## Original interface decision

The standalone project checked the installed Codex CLI on 2026-09-30 and found the official app-server rate-limit method. It deliberately used local observations to preserve its offline requirement. This merge retains that choice; Codex does not gain Claude's message-probe behavior.

MIT. See the repository [LICENSE](../LICENSE).
