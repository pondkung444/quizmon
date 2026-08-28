# Phase 4.5b — Private Staging Storage

Status: **Bucket provisioned; public/anonymous boundary verified; service smoke test ready**  
Production project: `monschool` (`wmndxiuqzrnqbhrznmfg`)  
Verified: 2026-08-28

## Production state

The private staging bucket is present with the approved v1 limits:

| Setting | Value |
|---|---|
| Bucket | `question-factory-assets` |
| Public | `false` |
| File size limit | 5 MiB (`5242880`) |
| Allowed MIME types | `image/svg+xml`, `image/webp` |
| Bucket-specific object policies | none |

The existing public product bucket `question-images` remains separate and unchanged by this step.

## Trust-boundary evidence

- An upload attempted with the public publishable key was rejected by Storage/RLS and created no object.
- The public-object endpoint does not resolve the private bucket (`400`, inner Storage result `404 NoSuchBucket`).
- In the authenticated Supabase Dashboard, `Upload files` is disabled for this bucket because there is no object `INSERT` policy. This is expected for the service-only design; signing into the Dashboard does not create a client upload path.
- No temporary smoke-test object was uploaded through the Dashboard, so no production cleanup was required.
- No service-role credential was copied from the Dashboard, browser state, logs, or prompts.

## Service-runtime smoke test

Run this only in a trusted worker or local environment that already supplies `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`:

```bash
npm run verify:question-factory-storage
```

The repository also provides a manually dispatched GitHub Actions workflow at `.github/workflows/question-factory-storage-smoke.yml`. It is bound to the `production-smoke-test` environment, uses read-only repository permissions, prevents concurrent production smoke runs, times out after 10 minutes, and retains only the structured evidence output for 30 days.

The verifier refuses to run against an unexpected project ref, uploads a unique SVG through service authority, confirms the unsigned public endpoint is blocked, and fetches the exact object through a 60-second signed URL with a SHA-256 comparison. It also verifies anonymous upload/overwrite/download/sign/delete denial, rejects `image/png`, rejects an upload one byte above the 5 MiB bucket limit, removes every run-specific path in a `finally` block, and emits one structured JSON evidence record.

If a controlled non-production learner token is supplied as `QUESTION_FACTORY_TEST_USER_ACCESS_TOKEN`, the same write/read/sign/delete denial matrix is run for an ordinary authenticated user. Without that optional token, the evidence explicitly marks this one check as skipped. Never use a real learner account or retain the token in logs.

Do not place `SUPABASE_SERVICE_ROLE_KEY` in a browser-visible variable, committed file, chat message, model prompt, or CI log.

## Remaining gate

Before the Factory worker is declared production-ready, run the service smoke test from the actual trusted runtime and retain its successful output as deployment evidence. The bucket configuration and untrusted-client boundary are complete; only the trusted-runtime execution remains.

