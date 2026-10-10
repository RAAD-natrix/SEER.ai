# Roadmap

## In progress
- Ask SEER: threaded per-case AI chat (threads + messages tables done; chat.server.ts, chat.functions.ts, /api/chat route done). Remaining: thread list page, chat page, link from case page, verify build + live test.

## Open
- Delete feature: delete sources/files, cases, and brief versions (user request). Needs soft-delete for cases (deleted_at exists), hard or soft delete for brief_versions (immutable — check 0004_keep_versions_immutable trigger before deleting), sources already have deleted_at.
