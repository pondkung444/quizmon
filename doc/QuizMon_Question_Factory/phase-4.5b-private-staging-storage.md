# Phase 4.5b — Private Staging Storage

Status: **Production verified — private staging Storage gate complete**

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

### Production service smoke evidence

The trusted GitHub Actions run [33133142437](https://github.com/pondkung444/quizmon/actions/runs/33133142437) executed against `main` commit `b45b169` on 2026-08-28 and completed with `status=passed`:

| Check | Result |
|---|---|
| Service upload | passed |
| Stored size and MIME metadata | passed |
| Unsigned public read | blocked (`400`) |
| Signed preview exact bytes | passed (SHA-256) |
| Anonymous upload / overwrite | blocked (`403`) |
| Anonymous private download / signed URL | blocked (`404`) |
| Anonymous delete | blocked by effect; object remained unchanged |
| Disallowed `image/png` | blocked (`415`) |
| One byte above 5 MiB | blocked (`413`) |
| Run-specific object cleanup | passed |

No signed URL, token or service credential appears in the retained evidence.

## Service-runtime smoke test

Run this only in a trusted worker or local environment that already supplies `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`:

```bash
npm run verify:question-factory-storage
```

The repository also provides a manually dispatched GitHub Actions workflow at `.github/workflows/question-factory-storage-smoke.yml`. It is bound to the `production-smoke-test` environment, requires approval from `pondkung444`, uses read-only repository permissions, prevents concurrent production smoke runs, times out after 10 minutes, and retains only the structured evidence output for 30 days.

The verifier refuses to run against an unexpected project ref, uploads a unique SVG through service authority, confirms the unsigned public endpoint is blocked, and fetches the exact object through a 60-second signed URL with a SHA-256 comparison. It also verifies anonymous upload/overwrite/download/sign/delete denial, rejects `image/png`, rejects an upload one byte above the 5 MiB bucket limit, removes every run-specific path in a `finally` block, and emits one structured JSON evidence record.

Denial is verified by effect, not HTTP shape alone. In particular, a Storage delete can report no client error when RLS affected zero rows; the verifier downloads the protected object with service authority afterward and requires its SHA-256 to remain unchanged.

If a controlled non-production learner token is supplied as `QUESTION_FACTORY_TEST_USER_ACCESS_TOKEN`, the same write/read/sign/delete denial matrix is run for an ordinary authenticated user. Without that optional token, the evidence explicitly marks this one check as skipped. Never use a real learner account or retain the token in logs.

Do not place `SUPABASE_SERVICE_ROLE_KEY` in a browser-visible variable, committed file, chat message, model prompt, or CI log.

## Deferred authenticated-user coverage

The optional ordinary-authenticated-user denial matrix was not run because no controlled short-lived test-user token was provided. It remains a future defense-in-depth check when the reviewer authentication harness exists. This is not a blocker for the current service-only architecture: the production service path, unsigned public path, anonymous path, bucket restrictions and cleanup all passed.

The private staging Storage gate is complete. Re-run the workflow after any bucket configuration, Storage policy, credential-boundary or Factory worker upload change.

