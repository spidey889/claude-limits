# Changelog

## 2026-10-11

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
