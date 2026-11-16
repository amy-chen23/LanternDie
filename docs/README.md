# LanternDie documentation

Current implementation: Roboflow lanternfly detection and social up/downvotes.
The alive/dead classifier, approval tags and life-status review UI are retired.
Historical points remain separate from social scores; new allocation is paused.

- [Current workflow and verified database rollout](IDENTIFICATION_SOCIAL_ONLY.md)
- [Detector jobs, retries and scheduler](REPORT_PROCESSING_PIPELINE.md)
- [Database, storage and permissions](REPORT_OVERHAUL_DATABASE.md)
- [Social voting and author reactions](AUTHOR_VOTING_ROLLOUT.md)
- [QA handoff and release checks](QA_RELEASE_HANDOFF.md)
- [Frontend handoff](FRONTEND_HANDOFF.md)

As verified November 16, 2026, migration 19 is applied to the shared Supabase project.
The updated frontend remains local and has not been committed/pushed for release.
See the rollout document for the distinction between hosted database verification
and local browser/native-export checks. Earlier classifier milestones, prototype
benchmarks and superseded review rollout instructions have been removed from docs.
