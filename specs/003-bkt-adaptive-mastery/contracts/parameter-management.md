# Contract: BKT Parameter Management

Version 1 has no student- or teacher-facing parameter editor. Approved parameter sets are seeded and later added by migration or a restricted operator workflow.

## Seeded versions

```json
{
  "version": "bkt-v1-mcq-global",
  "questionFormat": "mcq",
  "pL0": 0.30,
  "pT": 0.10,
  "pS": 0.10,
  "pG": 0.25,
  "pF": 0,
  "masteryThreshold": 0.95
}
```

```json
{
  "version": "bkt-v1-saq-global",
  "questionFormat": "saq",
  "pL0": 0.30,
  "pT": 0.10,
  "pS": 0.10,
  "pG": 0.10,
  "pF": 0,
  "masteryThreshold": 0.95
}
```

## Activation rules

- one active set per format
- immutable probability values after creation
- activation retires the previous active row in the same transaction
- admin/operator identity and activation time recorded
- active version-1 parameter set must have `P(F)=0`
- existing current mastery is not automatically rewritten
- each future event records the active parameter ID it used
- an unseen student/KC uses the currently active format `P(L0)`

## Offline fitting workflow (future operational use)

1. Export de-identified KC-tagged response sequences.
2. Fit candidate parameters outside the application with pyBKT or another approved analysis tool.
3. Compare no-forgetting and any time-conditioned model using held-out prediction, calibration, parameter stability, and mastery reachability.
4. Create a new draft parameter row with source/fit notes.
5. Run golden and historical shadow simulations.
6. Activate only after explicit approval.

No per-student manual fitting or automatic live refitting is part of version 1.
