# School learning and blueprint discovery — 5 October 2026
Scope: item 1 of the agreed next-work list. Placed school level 1 opens the blueprint library and an untimed three-step sample lesson with an owned stage 2–4 Qmon. Passing discovers the rest-garden blueprint; replay retains the first discovery and partner credit.

The garden and the three sample questions are initial content, to be curated by Pond. Construction purchase, prices, currency, helpers, school level 2 and friend visits are not part of this change. Learning is a short activity, not a long-running assignment; it does not lock pets, change adventure/Raid/PvP behavior, grant EXP or alter Daily Quest/food.

Security: session-derived owner on each action; server validates every answer and prerequisites; service-only invoker RPC rechecks school and pet ownership under row share locks. Table SELECT is owner-only, client mutations/RPC denied. Anonymous signed-in guests intentionally retain the existing game access model, with owner-only RLS; signed-out anon has no privileges.

Verification: 16 farm/lesson tests pass; SQL fixture test rolls back school/pets/discoveries and covers unplaced school, eggs, other owner's pet, unknown blueprint, service role, replay uniqueness and RLS/client denial. Positive UI is checked in a component-only mock preview; live verification reads the real gated pages without creating a school or discovery for the player.

Production build and changed-file ESLint pass. Component preview verified wrong-answer hints, all three steps, first discovery and replay status; lesson controls fit 320x568, 375x667 and 667x375 viewports. Pet selection uses natural-height cards in a bounded list.
