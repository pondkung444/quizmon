# Raid mobile answering and reward acknowledgement

The short card battle now opens its question when a card is tapped and submits when an answer is tapped. The explanation still has a Continue button. Legacy version 2 battles retain card preview and confirmation.

While answering, the battle scene and secondary panels are hidden. On portrait phones the question scrolls above the answer area; normal choices remain visible at 360×640 and 390×844, including illustrated and long questions. Very long answer choices and short landscape screens can scroll rather than clip text. Native safe areas remain respected.

Claiming a reward no longer revalidates the current raid layout: that invalidation could unmount the battle after its run was marked completed, losing the unread reward screen. A separate authenticated acknowledgement action invalidates inventory/run pages after the user presses the confirmation button. Acknowledgement does not claim again. Escape does not dismiss the reward dialog.

The reward screen displays gear, awarded eggs even if their image metadata is missing, and the actual returned Epic pity meter for ridge_storm. The existing database rules are unchanged: a full meter guarantees an egg on the next eligible win. First-clear rewards and resets remain server-controlled.

Validation:
- ESLint and TypeScript passed for the updated flow.
- Existing raid suite: 21 tests passed, including database ownership and idempotent rewards.
- Added action-boundary regression: claiming does not invalidate; explicit acknowledgement invalidates without another claim; unauthenticated acknowledgement rejects.
- Browser fixture uses real RaidCardBattle, CardBattleArena, RaidLearningPanel and image components with mocked server actions. Verified visible answer buttons, one submission per tap, reward persistence until acknowledgement, and pity 10/no egg versus pity 0/egg. No browser runtime errors.
- Authenticated production interactions and physical iOS/Android devices were not tested in this pass.
