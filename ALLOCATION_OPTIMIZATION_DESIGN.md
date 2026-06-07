# Exact Bus Allocation Optimization Design

## 1. Purpose

Replace the existing heuristic allocation logic with an exact optimization
system that proves the minimum required bus count before an allocation draft can
be created.

The production optimizer must never label a result as the minimum-cost result
unless the solver status is `OPTIMAL`.

## 2. Confirmed Operating Rules

### Bus configuration

- There is one bus type.
- Every bus has the same capacity and price.
- Every destination has the same per-bus price.
- The available bus count is unlimited.
- Administrators configure:
  - bus capacity,
  - estimated price per bus,
  - recommended minimum passengers, defaulting to 36.
- One bus serves exactly one destination.

Because every bus has the same price:

```text
minimum total cost = minimum total bus count
```

### Initial exact allocation

- Every active passenger must be assigned.
- Every passenger must be assigned to their first or second choice.
- Bus capacity may never be exceeded.
- The optimizer automatically decides destination assignments and the number of
  buses per destination.
- Fewer than the recommended minimum passengers is allowed but produces a
  warning.
- A destination may receive no buses if all affected passengers can be assigned
  to their other preference.
- A removed first-choice destination produces a strong warning.
- If no first-or-second-choice allocation exists, no draft is created.

### Exact lexicographic priority

The optimizer solves the following objectives one at a time. After each phase,
the optimal value is fixed before solving the next phase.

1. Minimize total bus count.
2. Minimize passengers assigned to their second choice.
3. Minimize the number of buses used by each campus.
4. Minimize uneven campus distribution when a campus must be split.
5. Minimize campus groups of one or two passengers on a bus.
6. Minimize odd-sized campus groups on a bus.
7. Minimize the number of buses used by each team.
8. Minimize uneven team distribution when a team must be split.
9. Minimize uneven total passenger counts between buses of the same destination.
10. Apply a deterministic final tie-breaker based on stable passenger and bus
    ordering.

No lower-priority objective may increase a higher-priority objective.

### Draft editing

- The initial generated draft always keeps every passenger within their first
  or second choice.
- Global administrators may later move a passenger outside their preferences.
- An out-of-preference assignment produces a strong passenger-level warning.
- A draft with out-of-preference assignments can be confirmed only after a
  global administrator checks an explicit acknowledgement.
- The acknowledgement, actor, time, and affected passengers are stored in the
  allocation history.
- Every passenger assigned, bus capacity, and one destination per bus remain
  mandatory confirmation constraints.
- Recommended minimum passengers remains a warning.
- Manual edits mark the draft as changed from the proven optimal result.
- The draft screen does not provide a general re-optimization button.

### Changes after draft creation

- New and cancelled reservations are handled inside the existing draft.
- Existing passenger assignments and administrator edits are preserved.
- New passengers are assigned in this order:
  1. first-choice bus,
  2. bus with the most passengers from the same campus,
  3. bus with the most passengers from the same team,
  4. bus with the most remaining seats,
  5. second-choice bus with a warning.
- If existing assignments could be changed to avoid adding a bus, show an
  adjustment recommendation. Do not apply it automatically.
- Cancelled passengers are removed without automatically moving other
  passengers or deleting buses.
- Empty buses produce a deletion recommendation.
- Low-occupancy buses that can be removed produce a bus-reduction recommendation
  with proposed moves and preference/campus/team impact.
- All passengers must be assigned before confirmation.

## 3. Exact Optimization Model

Let:

- `P` be the set of active passengers.
- `D` be the set of destinations appearing in any passenger preference.
- `C` be the configured bus capacity.
- `PRICE` be the configured per-bus price.
- `pref1[p]` and `pref2[p]` be passenger `p` preferences.

### Destination assignment variables

```text
x[p,d] = 1 when passenger p is assigned to destination d, otherwise 0
z[d]   = number of buses serving destination d
```

Only `x[p,pref1[p]]` and `x[p,pref2[p]]` are created.

### Mandatory constraints

Each passenger is assigned exactly once:

```text
sum(x[p,d] for d in preferences[p]) = 1
```

Destination capacity is sufficient:

```text
sum(x[p,d] for p in P) <= C * z[d]
```

Variable domains:

```text
x[p,d] in {0,1}
z[d] in non-negative integers
```

### Phase 1: minimum cost proof

```text
minimize sum(z[d] for d in D)
```

The result may be used only when CP-SAT reports `OPTIMAL`.

### Phase 2: preference quality

Fix the optimal total bus count and minimize:

```text
sum(x[p,pref2[p]] for p in P)
```

### Physical bus assignment

After destination assignments and destination bus counts are fixed, create
physical bus slots for each destination.

```text
y[p,b] = 1 when passenger p is assigned to physical bus b
```

Constraints:

- each passenger uses exactly one bus serving their chosen destination,
- each bus has at most `C` passengers.

Additional boolean and integer variables measure campus/team bus usage,
distribution range, one-or-two-person groups, and odd groups. Each remaining
objective is solved lexicographically and fixed before the next objective.

The final physical bus numbering and seat numbering use stable sorting so the
same input always produces the same output.

## 4. Infeasible Result

If CP-SAT proves that a first-or-second-choice allocation is impossible, the
system must not create a draft.

The result screen shows:

- `배차 불가능`,
- affected passengers with anonymized IDs, campuses, teams, and preferences,
- destination-level seat shortages,
- minimum additional buses required,
- estimated added cost.

The shortage analysis is a separate diagnostic solve. It may introduce
temporary extra-bus variables and minimize their total count, but it must never
silently convert that result into a production draft.

## 5. Server Architecture

### Deployment

- Python 3 service packaged with Docker.
- OR-Tools CP-SAT solver.
- Executed as a Google Cloud Run Job.
- Initial resources: 2 vCPU and 2 GiB memory.
- Maximum execution time: 24 hours.
- Maximum concurrent optimization jobs: one.
- No general HTTP request remains open during optimization.

### Job flow

1. A global administrator creates an optimization job through an authorized
   Supabase RPC.
2. The RPC snapshots anonymized optimization input.
3. A trusted launcher starts the Cloud Run Job with the optimization job ID.
4. The Python worker claims the pending job.
5. The worker reads the immutable input snapshot and runs CP-SAT phases.
6. The worker periodically writes status, phase, elapsed time, best known bus
   count, and proof state.
7. The worker stores the final result only when the result passes independent
   validation.
8. The frontend creates a draft only from an `OPTIMAL` result.

### Solver statuses

- `PENDING`: queued but not claimed.
- `RUNNING`: solver is active.
- `CANCEL_REQUESTED`: administrator requested cancellation.
- `CANCELLED`: worker stopped without a result.
- `OPTIMAL`: minimum bus count and all tie-break phases proved optimal.
- `INFEASIBLE`: no first-or-second-choice allocation exists.
- `FAILED`: infrastructure, validation, or solver failure.

`FEASIBLE` results may be displayed as progress information but cannot create a
draft.

## 6. Data and Security

### Authorization

- Only global administrators may create, view, cancel, or use optimization
  jobs.
- Campus administrators have no optimization-page or result access.
- Database authorization is enforced by RPCs, not only by frontend routing.

### Optimizer input

The Python worker receives only:

- anonymized reservation ID,
- campus,
- team,
- first choice,
- second choice,
- bus capacity,
- bus price,
- recommended minimum passengers.

Names and phone numbers never leave Supabase. They are joined back to the
validated result only when a draft is created.

### Proposed tables

```text
allocation_optimization_jobs
  id
  status
  requested_by
  requested_at
  started_at
  completed_at
  cancel_requested_at
  input_hash
  input_snapshot
  progress
  current_phase
  elapsed_seconds
  best_known_bus_count
  proven_bus_count
  result
  diagnostics
  error_message

allocation_optimization_events
  id
  job_id
  created_at
  event_type
  detail
```

All writes from the worker use a server-only credential. Client access is
limited to authorized RPCs.

## 7. Independent Result Validation

Before a result can create a draft, Supabase validates:

- the job status is `OPTIMAL`,
- the optimization input still matches the active reservation snapshot,
- every active reservation appears exactly once,
- every assignment is first or second choice,
- every physical bus serves one destination,
- every bus is within capacity,
- reported bus count equals the number of physical buses,
- reported total cost equals bus count multiplied by configured price,
- no unknown destination or reservation exists.

The optimizer output is treated as untrusted until this validation passes.

## 8. Frontend Changes

### Allocation calculation page

- Replace multiple bus-option management with one bus configuration.
- Remove weighted-preference and heuristic minimum-cost modes.
- Show one exact optimization action.
- Show calculation phase, elapsed time, current best bus count, and proof state.
- Allow cancellation.
- Enable draft creation only for a validated `OPTIMAL` result.
- Show strong warnings for removed first-choice destinations and buses below the
  recommended minimum.

### Draft page

- Remove general re-optimization.
- Show `최적해 원본` or `최적해에서 변경됨`.
- Show differences from the original optimal result.
- Show adjustment recommendations after reservation changes.
- Allow global-admin out-of-preference edits with strong warnings.
- Require explicit acknowledgement before confirming out-of-preference edits.

## 9. Removal and Replacement Scope

The following heuristic responsibilities are replaced, not extended:

- bus combination enumeration,
- candidate and beam limits,
- weighted-preference allocation mode,
- greedy preferred-bus assignment for initial draft generation,
- greedy expensive-bus removal,
- allocation calculation web workers.

Reusable draft editing, history, confirmation, and display code should remain
where it does not depend on heuristic behavior.

## 10. Required Tests

### Solver tests

- proves the minimum bus count for small exhaustive reference cases,
- minimizes second choices only after fixing minimum bus count,
- removes a first-choice destination when doing so reduces bus count,
- never assigns outside first or second choice,
- respects capacity,
- minimizes campus split before team split,
- applies deterministic tie-breaking,
- reports infeasible inputs,
- reports the minimum additional buses for infeasible inputs.

### Security and integration tests

- campus administrators cannot create or view jobs,
- names and phone numbers are absent from optimizer snapshots,
- stale reservation snapshots cannot create drafts,
- non-`OPTIMAL` jobs cannot create drafts,
- malformed optimizer results are rejected,
- cancellation and worker restart are handled safely.

### Draft tests

- initial exact drafts contain only first-or-second-choice assignments,
- manual out-of-preference edits produce strong warnings,
- acknowledgement is required for confirmation,
- new reservations preserve existing assignments,
- cancellation produces reduction recommendations without automatic moves.
