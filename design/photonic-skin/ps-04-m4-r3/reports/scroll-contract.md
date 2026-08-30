# M4.R3 scroll → actor request

Canonical actor input is `ScrollCompositionController.committedActorNodeId()`, not raw `scrollY` and not every discrete `activeNodeId` while a programmatic/restore/magnetic pending target exists.

- One committed semantic contract (`geometry|mask|slot|fit`) → at most one transaction
- Programmatic header/graph/restore jumps request only the destination
- Horizontal document scroll mapping is unchanged from R2
- No scroll trap; magnetic cancel unchanged
