# Changelog

## 2026-10-11

- Added a copy-paste Claude-only download/install/connect block. It requires Claude Desktop open and signed in, stops cleanly after failed download/install, quits only matching Claude processes in the current Windows session, connects through the installed launcher without waiting for a PATH refresh, and reopens Desktop even if connection fails. Retained manual reconnect instructions for later restarts.
- Validation: parsed and executed the documented block with isolated Windows PowerShell mocks. Five checks covered successful setup, failed install, missing Desktop, failed connection, and failed quit; only the selected current-session executable was eligible for quitting/reopening. No real app, install, or account requests were used.
- Replaced Claude installer's raw missing-Node error with a two-line instruction to install Node.js 22.13+, reopen PowerShell, and retry. Older Node versions and builds without SQLite support receive the same message before launcher/PATH changes. The root installer preserves the failure exit code.
- Validation: nine isolated Windows PowerShell installer checks passed. Covered missing Node through direct/Claude/combined entry points, simulated older versions and unavailable SQLite, the minimum/current version gate, and Codex-only selection. Write guards prevented launcher/PATH changes during checks.
- Rebuilt the Claude probe around preparing one empty temporary chat after a successful reading, removing chat creation from the next command's wait. Preparation sends no message and captures no quota; every reserved chat is used once, then deleted. Unused reservations expire after 30 minutes without polling, and stopping the helper cleans up pending preparation.
- Removed ten-second completed-reading reuse after the user explicitly required fresh numbers on every independent invocation. Overlapping commands still share an active request. Preserved read-only endpoint preference, five-minute empty-endpoint hints, early stream return, cleanup, and single-attempt completions.
- Before this change, a measured fresh check took 3.77 seconds; an immediate repeat took 0.40 seconds by reusing the same observation. That repeat is not a fresh-check benchmark.
- Validation: 32 Claude tests passed, including independent fresh reads, prepared-chat use, setup failure, expiry, and stop races. Reconnected the installed helper and reopened Claude Desktop. A cold fresh check took 4.11 seconds and a subsequent prepared fresh check took 2.94 seconds, with distinct observation timestamps. These are individual live samples, not a latency guarantee.
- Kept Claude's original purple accent constant at every usage level, as requested after it switched to yellow at 50% used. Removed automatic amber/red quota styling, including the passed-reset override on percentages and filled cells. Reset warnings remain explicit in amber text; the layout, plain output, and usage-checking behavior stay intact.
- Validation: 27 Claude tests passed, covering the former color thresholds, over-limit values, passed resets, and color/plain equivalence. Offline terminal previews at 50%, 60%, and 90% used stayed purple without requesting account usage.
- Applied the user's selected ruby red (`#FF4F55`) from the color preview to Codex percentages and filled bars. Because the normal accent is red, allowance below 20% gets an explicit amber `LOW` label that remains visible in plain output. Preserved percent-left alignment, the two-line layout, cached observations, and stale-reset behavior.
- Validation: 42 Codex checks passed, including the selected RGB color, distinct low-allowance warning, and its plain-output equivalent. The installed command was verified from another folder.
- Replaced Codex's yellow accent with custom coral orange (`#FF9966`) after feedback that yellow blended with PowerShell command text. True-color styling affects only normal remaining values and filled cells; red low-allowance warnings, stale-reset warnings, and plain output remain intact.
- Changed Codex's normal accent from green to yellow at the user's request, retaining red below 20% left. Updated current documentation and the existing color check.
- Matched Codex's display to Claude's spaced square bars while keeping percent left as its main value. Solid cells show remaining allowance, with green for healthy allowance and amber/red as it runs low. Compact local reset times, a weekly date, and a quieter `cached` label replace the long timestamp and repeated cache warning. Passed resets still require refresh, and redirected or color-disabled output stays plain.
- Validation: 41 Codex checks passed, including fractional remaining allowance, half-cell rounding, color/plain equivalence, stale resets, missing data, and existing command/installer behavior.
- Renamed the offline Codex command from `codex-limits` to `codexli`. Replaced the tracked launcher and updated installer messages, checks, and current documentation. Installation removes recognized old launchers in the module and original Desktop folder, preserving other files. Cached-reading behavior and the two-line output stay intact.
- Validation: 36 Codex checks and 27 Claude tests passed. Installed `codexli` resolved from another folder and read local cached limits in 0.97 seconds; the old command no longer resolved and both recognized old launchers were absent.
- Changed normal Claude usage highlights to purple at the user's request; amber/red warnings, bright unused cells, and plain output stay consistent.

- Replaced the crowded dotted usage bars after visual feedback: Claude leads with percent used and uses ten spaced solid/hollow cells for used/unused allowance. The user preferred used percentages, so the final display keeps that meaning and makes unused cells bright and clearly outlined. Removed bar brackets, colons, and vertical separators; reset times and the checked time are secondary. Terminal color highlights usage and warns when it is high, with plain output for redirection or disabled color. Fresh-reading behavior stays intact.
- Verified the clearer display with 27 Claude checks and live colored/plain terminal output.
- Added compact, aligned 12-cell usage bars to Claude's two quota rows, preserving exact percent-used values, reset times, and the checked timestamp. Unknown usage has no bar; only visual fill is capped for over-limit readings. The display uses the existing formatter in one-shot and watch modes, adding no requests or dependencies.
- Reduced fresh Claude-check latency by remembering an empty usage endpoint for five minutes, returning as soon as both streamed quota windows arrive, and moving temporary-conversation cleanup off the response path. Read-only endpoint support is checked again after the five-minute interval.
- Kept the ten-second duplicate-probe guard, while invalidating reuse when a quota reset passes or the system clock moves backwards. Failed live checks never fall back to saved quota.
- Added regressions for endpoint rechecks, reset boundaries, delayed reply tails, partial quota events, slow or failed cleanup, and malformed creation responses. No completion retries or new dependencies were added.
- Validation: 25 Claude tests and 33 Codex checks passed. After restarting the installed helper, two fresh observations took 2.91 and 3.50 seconds; an immediate repeat took 0.24 seconds. Live times depend on Claude and the network.

## 2026-09-30

- Confirmed on a real free Claude Desktop account that the authenticated usage endpoint returns null windows, while a reply includes both exact 5-hour and weekly usage and reset times.
- Built `claudeli` with fresh readings and a five-minute watch. The user explicitly chose tiny message probes when read-only usage is unavailable, accepting that probes consume allowance.
- Added an in-memory Desktop session helper to support commands while the app is open without saving credentials or modifying Claude.
- Covered missing values, REST/SSE units, stream chunking, host restrictions, and single-attempt probe cleanup with tests.
- Verified 16 automated tests, the installed command from an unrelated PowerShell folder, and fresh one-shot/watch readings while Desktop is open. A provider timeout was reported as a failed refresh; no saved snapshot was presented as current.
- Renamed the private GitHub repository to spidey889/claude-limit and updated the local origin remote to match.
- Kept the final repository name claude-limits to match the local folder. Renamed the same private repository in place; no duplicate repository was created.
- Made the existing GitHub repository public at the user's request after checking its history for credential and runtime files.
- Added the MIT license, package license metadata, and a GitHub description covering Desktop usage, weekly/session limits, and live updates for free accounts.

### Claude and Codex integration

- Merged the complete standalone Desktop `codex-limits` project into `codex/`,
  including its offline implementation, launcher, installer, checks, and history.
  The source had no Git history to merge; its original folder is preserved.
- Added one setup entry point with separate Claude/Codex selection and one test
  command for both suites. Claude's launcher target and active helper remain stable.
- Migrated the installed Codex command to this repository's module, preserving
  unrelated PATH entries and adding isolated migration/reinstall/uninstall checks.
- Updated architecture, usage docs, package metadata, and repository description
  to distinguish fresh Claude percent-used readings from cached Codex percent-left
  readings. Codex retains its offline and no-message behavior.
- Validation: 16 Claude tests and 33 Codex checks passed through the combined npm entry point; both installed commands were verified from another folder, and unrelated user PATH entries were unchanged.
