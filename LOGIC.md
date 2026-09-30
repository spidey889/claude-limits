# Current behavior

`claudeli` connects to a hidden Node helper over a token-authenticated Windows named pipe. On first connection the helper receives the Desktop session over its stdin, while Desktop is quit because Chromium locks its Cookies database. The session is unlocked with current-user Windows DPAPI and AES-GCM. No login credentials are persisted or printed. Desktop can reopen while the helper holds the session in memory.

Each reading first requests Claude's organization usage endpoint. If any overall account window is exposed, REST values are displayed directly. If both windows are missing, one temporary dot-message probe obtains the real `message_limit` SSE event. REST utilization is a percentage; SSE utilization is a fraction. Missing weekly data remains unavailable. Unknown values never become zero, and a passed reset time never silently clears usage.

Probe completions are never automatically retried. Each probe uses a new temporary conversation, confirms temporary mode before sending, and attempts cleanup of that invocation's conversation. Cleanup failure does not invalidate a measured quota. Stream text is discarded. Concurrent reads share a probe; a reply observed within ten seconds is reused to prevent duplicate probes.

Watch reads every five minutes. It makes requests only while a watch command is running; the background helper does not poll independently. Quitting watch stops recurring requests. The helper remains available for later commands until `--stop` or process/session termination.

Only usage measurements are saved in `.usage-snapshot.json`; the local pipe token is in `.runtime-key`. Both are excluded from Git. Saved snapshots are diagnostic only: normal commands require a successful live request and never pass off saved readings as current.

Reconnect after account changes because the helper is bound to the Desktop account active when it connected. HTTP redirects are rejected, and there is no arbitrary URL setting. No Claude installation files or security settings are modified.
