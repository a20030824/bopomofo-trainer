# Round auto-advance

Completed rounds remain visible briefly, then advance automatically without changing measurement or curriculum policy.

## Behavior

- the completion summary remains visible for 1200 ms;
- `Enter` advances immediately;
- `Escape` pauses on the completion summary;
- clicking the existing next-round button advances immediately;
- manual advance, reset, DOM replacement, and page unload clear the pending timer;
- practice and held-out evaluation use the same transition behavior.

The adapter triggers the existing next-round button rather than creating a second product transition path. Progress and pilot history are therefore finalized and persisted before the timer is scheduled, and the next interaction session begins only when `startNextProductRound` creates it.

Pilot history remains the durable place to inspect completed-round evidence after the transient completion summary disappears.
