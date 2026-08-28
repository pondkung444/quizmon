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

Run this only in a trusted worker or local environment that already supplies both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`:

```bash
npm run verify:question-factory-storage
```

The verifier uploads a unique SVG through service authority, confirms the unsigned public endpoint is blocked, fetches the exact object through a 60-second signed URL, confirms `image/png` is rejected, and removes the temporary object in a `finally` block. It then verifies that cleanup completed.

Do not place `SUPABASE_SERVICE_ROLE_KEY` in a browser-visible variable, committed file, chat message, model prompt, or CI log.

## Remaining gate

Before the Factory worker is declared production-ready, run the service smoke test from the actual trusted runtime and retain its successful output as deployment evidence. The bucket configuration and untrusted-client boundary are complete; only the trusted-runtime execution remains.

