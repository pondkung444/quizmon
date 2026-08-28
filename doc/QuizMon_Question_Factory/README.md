# QuizMon Question Factory — Document Index

เอกสารออกแบบและสัญญาระบบ Question Factory v1 สำหรับ QuizMon

## Core design

| Phase | Document |
|---|---|
| Roadmap | [QuizMon_Question_Factory_v1.md](QuizMon_Question_Factory_v1.md) |
| 1 | [question-factory-contract-v1.md](question-factory-contract-v1.md) |
| 2.1 | [question-factory-orchestrator.md](question-factory-orchestrator.md) |
| 2.2 | [question-authoring-skill.md](question-authoring-skill.md) |
| 2.3 | [question-qc-skill.md](question-qc-skill.md) |
| 2.4 | [question-image-builder-skill.md](question-image-builder-skill.md) |
| 2.5 | [question-image-qc-skill.md](question-image-qc-skill.md) |
| Image standard | [quizmon-question-image-standard.md](quizmon-question-image-standard.md) |
| 3 | [question-factory-profile-schema-v1.md](question-factory-profile-schema-v1.md) |
| 4.0 | [question-factory-production-contract-v1.md](question-factory-production-contract-v1.md) |
| 4.1 | [question-factory-data-model-v1.md](question-factory-data-model-v1.md) |
| 4.5a | [question-factory-scope-key-v1.md](question-factory-scope-key-v1.md) |
| Between 4 and 5 | [question-factory-office-visualization-v1.md](question-factory-office-visualization-v1.md) |
| Visual bible | [factory-office-character-bible-v1.md](factory-office-character-bible-v1.md) |

## Production mapping and hardening

| Phase | Document | Status |
|---|---|---|
| 4.2 | [phase-4.2-product-mapping-contract.md](phase-4.2-product-mapping-contract.md) | Production surveyed read-only |
| 4.3 | [phase-4.3-rls-storage-permission-plan.md](phase-4.3-rls-storage-permission-plan.md) | Security contract |
| 4.4/4.5 | [phase-4.4-migration-sql-review.md](phase-4.4-migration-sql-review.md) | 001/002/003 applied and verified |
| 4.4a | [phase-4.4a-client-storage-audit.md](phase-4.4a-client-storage-audit.md) | Compatibility evidence |
| 4.4b | [phase-4.4b-002-003-completion.md](phase-4.4b-002-003-completion.md) | 002/003 applied and verified |
| 4.5b | [phase-4.5b-private-staging-storage.md](phase-4.5b-private-staging-storage.md) | Production service/private-boundary smoke verified |

## Review SQL

- [001_question_factory_core.review.sql](migrations/001_question_factory_core.review.sql)
- [002_questions_active_read_policy.review.sql](migrations/002_questions_active_read_policy.review.sql)
- [003_question_images_remove_anon_writes.review.sql](migrations/003_question_images_remove_anon_writes.review.sql)
- [verify_question_factory_phase_4.review.sql](migrations/verify_question_factory_phase_4.review.sql)

The `.review.sql` files are retained as review artifacts. Executable repository migrations for 001, its composite-FK index hardening, 002, and 003 live under `supabase/migrations/` and match production migration history.
