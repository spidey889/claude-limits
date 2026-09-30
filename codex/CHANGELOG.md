# Changes

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
