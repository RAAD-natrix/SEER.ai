# Roadmap

## Done
- Ask SEER: threaded per-case chat (pages, stream route, saved history, delete with confirmation, chat sends count toward the AI limit).
- QA sweep (Oct 2026): search reports failed areas, pages through all versions, owner/date filters server-side; every save checks for failure; brief text locked in the database.

## Open
- Delete feature: delete sources/files, cases, and brief versions (user request). Brief versions are immutable by trigger — needs a deliberate design.
- Live checks pending: Ask SEER stop/retry and 429 path, uploads per file format, second-analyst isolation, PDF button click, long-brief exports.
- Lint: repository-wide formatting (prettier) errors pre-date this sweep; `bun run check` does not include lint.
