# Changelog

## 2026-09-30

- Confirmed on a real free Claude Desktop account that the authenticated usage endpoint returns null windows, while a reply includes both exact 5-hour and weekly usage and reset times.
- Built `claudeli` with fresh readings and a five-minute watch. The user explicitly chose tiny message probes when read-only usage is unavailable, accepting that probes consume allowance.
- Added an in-memory Desktop session helper to support commands while the app is open without saving credentials or modifying Claude.
- Covered missing values, REST/SSE units, stream chunking, host restrictions, and single-attempt probe cleanup with tests.
- Verified 16 automated tests, the installed command from an unrelated PowerShell folder, and fresh one-shot/watch readings while Desktop is open. A provider timeout was reported as a failed refresh; no saved snapshot was presented as current.
- Renamed the private GitHub repository to spidey889/claude-limit and updated the local origin remote to match.
- Kept the final repository name claude-limits to match the local folder. Renamed the same private repository in place; no duplicate repository was created.
- Made the existing GitHub repository public at the user's request after checking its history for credential and runtime files.
