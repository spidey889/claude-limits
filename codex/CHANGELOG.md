# Changes

## 2026-10-11

- Applied the selected ruby red (`#FF4F55`) to remaining percentages and filled cells. Below 20% left, an amber `LOW` label distinguishes the warning from normal red styling and remains present without color. The two quota rows, alignment, and cached-reading semantics remain intact.
- Passed 42 module checks and verified the installed command from another folder, including the selected color and explicit low-allowance warning.
- Changed normal Codex highlights to custom coral orange (`#FF9966`) so they stand apart from PowerShell's yellow command text. Low-allowance and stale-reset warnings retain their colors; plain output stays identical.
- Changed the normal Codex accent to yellow instead of green; low remaining allowance stays red. Updated current documentation and the color check.
- Replaced the crowded quota lines with Claude's aligned ten-cell square bars, leading with percent left. Filled cells show remaining allowance, highlighted green, amber, or red as allowance runs low. Reset text is compact, weekly dates stay visible, and cache labels are secondary. Missing values, stale-reset warnings, and plain redirected output remain explicit. Passed 41 checks, including remaining-bar rounding and color/plain equivalence.
- Renamed the command to `codexli` and retired `codex-limits`. Installation removes recognized old launchers from the merged module and original standalone folder while preserving other files. Updated command-resolution and migration checks, including unrelated-launcher preservation. Offline cached readings keep the same two-line output.
- Passed 36 module checks and 27 Claude tests through the combined suite. The installed `codexli` worked from another folder in 0.97 seconds, and both old launchers were removed.

## 2026-09-30

- Added an offline two-line PowerShell command for saved Codex 5-hour and weekly limits.
- Checked the installed Codex 0.159.1/0.159.2 help and verified the official app-server
  rate-limit method exists. Chose local JSONL observations because the live method
  requires a network request.
- Added read-sharing for active Windows session files, event timestamp selection,
  account-bucket filtering, local reset times, and explicit cached/expired notices.
- Added repeatable user-PATH installation with all command files kept in this folder.
- Passed 26 synthetic checks and read the real local cache in about one second.
  Registered the command on the owner's user PATH through the authorized installer.
- Windows sandbox processes use a separate `CodexSandboxOffline` registry hive;
  checking their HKCU PATH does not verify the owner's installed PATH setting.
- This folder has no Git repository or remote; no data or code was uploaded.

### Repository integration

- Imported the complete tool and its original checks into the shared repository's
  `codex/` module, retaining the offline two-line command and cached-data notices.
- Migrated installation from the standalone Desktop PATH entry to this module.
  Added process-only checks for migration, repeatability, and removal.
- Setup, verification, license, and repository documentation are shared with Claude;
  runtime logic, commands, and account data remain separate.
