# Technical Specification: Multiprogrammed Memory Simulator

**Version:** 1.0  
**Status:** Ready for implementation  
**Runtime:** Browser, Vanilla JavaScript ES modules  

## 1. System Overview

The application is a static client-side web application. The simulation domain must remain independent from the DOM so allocation behavior can be unit-tested without a browser UI. The source of truth is an immutable-style `SimulationState`; UI components issue commands, the engine validates and reduces those commands into a new state, and the renderer projects that state into the interface.

No framework, server, database, build-time dependency, or network connection is required for core operation.

## 2. Technical Constraints

- HTML5, CSS3, and modern Vanilla JavaScript.
- Native ECMAScript modules using `import` and `export`.[cite:77][cite:82]
- Exact integer byte arithmetic using JavaScript `Number`; 16,777,216 is far below `Number.MAX_SAFE_INTEGER`.[cite:79][cite:81]
- No floating-point memory values after input conversion.
- No external UI or state-management libraries.
- No inline event-handler attributes.
- Core simulation must run deterministically from state plus command.
- The application must work from a simple static HTTP server.
- Target latest two stable versions of Chrome, Firefox, Edge, and Safari.

## 3. Constants

```js
export const BYTE = 1;
export const KIB = 1024;
export const MIB = 1024 * KIB;
export const TOTAL_MEMORY_BYTES = 16 * MIB;       // 16,777,216
export const MIN_ADDRESS = 0x000000;
export const MAX_ADDRESS = 0xFFFFFF;
export const DEFAULT_OS_BYTES = 1 * MIB;
export const STATE_SCHEMA_VERSION = 1;
```

Invariant:

```text
TOTAL_MEMORY_BYTES = MAX_ADDRESS - MIN_ADDRESS + 1
```

## 4. Project Structure

```text
memory-simulator/
├── index.html
├── src/
│   ├── app.js
│   ├── domain/
│   │   ├── constants.js
│   │   ├── models.js
│   │   ├── invariants.js
│   │   ├── address.js
│   │   ├── metrics.js
│   │   └── errors.js
│   ├── engine/
│   │   ├── simulator.js
│   │   ├── candidates.js
│   │   ├── allocators.js
│   │   ├── static-equal.js
│   │   ├── static-unequal.js
│   │   ├── dynamic.js
│   │   ├── compaction.js
│   │   └── comparison.js
│   ├── state/
│   │   ├── store.js
│   │   ├── commands.js
│   │   ├── history.js
│   │   └── persistence.js
│   ├── ui/
│   │   ├── elements.js
│   │   ├── events.js
│   │   ├── render.js
│   │   ├── memory-map.js
│   │   ├── forms.js
│   │   ├── dialogs.js
│   │   └── accessibility.js
│   └── data/
│       └── default-programs.js
├── styles/
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   └── components.css
└── tests/
    ├── address.test.js
    ├── allocators.test.js
    ├── static-modes.test.js
    ├── dynamic.test.js
    ├── compaction.test.js
    ├── metrics.test.js
    ├── invariants.test.js
    └── fixtures.js
```

## 5. Domain Types

The implementation should use JSDoc typedefs and runtime validation.

```js
/** @typedef {'STATIC_EQUAL'|'STATIC_UNEQUAL'|'DYNAMIC_NO_COMPACTION'|'DYNAMIC_COMPACTION'} MemoryMode */
/** @typedef {'FIRST_FIT'|'BEST_FIT'|'WORST_FIT'} AllocationAlgorithm */
/** @typedef {'ready'|'allocated'|'terminated'|'rejected'} ProgramStatus */
/** @typedef {'OS'|'PARTITION'|'PROCESS'|'HOLE'} BlockKind */

/**
 * @typedef {Object} Segment
 * @property {string} id
 * @property {string} name
 * @property {number} sizeBytes
 */

/**
 * @typedef {Object} Program
 * @property {string} id
 * @property {string} name
 * @property {string} colorToken
 * @property {Segment[]} segments
 * @property {number} sizeBytes
 * @property {ProgramStatus} status
 * @property {number} arrivalOrder
 * @property {number|null} start
 * @property {number|null} end
 * @property {string|null} containerId
 */

/**
 * @typedef {Object} Partition
 * @property {string} id
 * @property {number} start
 * @property {number} sizeBytes
 * @property {number} end
 * @property {string|null} programId
 */

/**
 * @typedef {Object} MemoryBlock
 * @property {string} id
 * @property {BlockKind} kind
 * @property {number} start
 * @property {number} sizeBytes
 * @property {number} end
 * @property {string|null} programId
 */

/**
 * @typedef {Object} SimulationConfig
 * @property {MemoryMode} mode
 * @property {AllocationAlgorithm} algorithm
 * @property {number} totalBytes
 * @property {number} osBytes
 * @property {number|null} equalPartitionCount
 * @property {number[]} unequalPartitionSizes
 */

/**
 * @typedef {Object} SimulationState
 * @property {number} schemaVersion
 * @property {'CONFIGURING'|'RUNNING'} phase
 * @property {SimulationConfig} config
 * @property {Program[]} programs
 * @property {Partition[]} partitions
 * @property {MemoryBlock[]} blocks
 * @property {HistoryEntry[]} history
 * @property {number} nextSequence
 * @property {string|null} selectedId
 * @property {AllocationTrace|null} lastTrace
 */
```

## 6. State Invariants

`assertState(state)` must run in development and test builds after every successful command.

### 6.1 Global invariants

- `config.totalBytes === 16 * MIB`.
- OS starts at `0` and has size `config.osBytes`.
- Every size, start, and end is a safe integer.
- Every non-empty block satisfies `end === start + sizeBytes - 1`.
- Sorted physical blocks are adjacent: `blocks[i].end + 1 === blocks[i + 1].start`.
- First block starts at `MIN_ADDRESS`.
- Last block ends at `MAX_ADDRESS`.
- Blocks never overlap.
- Sum of block sizes equals `TOTAL_MEMORY_BYTES`.
- An allocated program appears exactly once in memory.
- A ready, rejected, or terminated program appears zero times in memory.
- Program total equals the sum of its segment sizes.

### 6.2 Static-mode invariants

- Partition boundaries do not change after simulation start.
- Each partition has zero or one program.
- Each allocated program size is less than or equal to its partition size.
- Internal fragmentation per occupied partition equals `partition.sizeBytes - program.sizeBytes`.

### 6.3 Dynamic-mode invariants

- No two adjacent blocks are both holes after a command completes.
- Process block size equals program total size.
- Dynamic internal fragmentation is zero in the byte-exact model.
- In compaction mode after compacting, exactly zero or one hole exists, and any hole is the final user-memory block.

## 7. Address Utilities

```js
export function endAddress(start, sizeBytes) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(sizeBytes)) {
    throw new DomainError('UNSAFE_INTEGER');
  }
  if (sizeBytes <= 0) throw new DomainError('INVALID_SIZE');
  const end = start + sizeBytes - 1;
  if (start < MIN_ADDRESS || end > MAX_ADDRESS) {
    throw new DomainError('ADDRESS_OUT_OF_RANGE');
  }
  return end;
}

export function toHexAddress(address) {
  if (!Number.isSafeInteger(address) || address < MIN_ADDRESS || address > MAX_ADDRESS) {
    throw new DomainError('ADDRESS_OUT_OF_RANGE');
  }
  return `0x${address.toString(16).toUpperCase().padStart(6, '0')}`;
}
```

Input conversion must parse the numeric text independently from the selected unit and reject negative, zero, fractional-byte, NaN, and infinite results.

## 8. Candidate Representation

The same allocation policies operate over a normalized candidate type.

```js
/**
 * @typedef {Object} AllocationCandidate
 * @property {string} id
 * @property {number} start
 * @property {number} capacityBytes
 * @property {'partition'|'hole'} type
 */
```

Candidate extraction:

- Static equal: all free partitions with adequate capacity, but allocation bypasses the selected policy and chooses lowest address.
- Static unequal: all free partitions with adequate capacity.
- Dynamic: all holes with adequate capacity.

All candidate arrays must initially be sorted by ascending `start`.

## 9. Allocation Policies

First fit returns the first address-ordered candidate large enough. Best fit returns the smallest adequate candidate. Worst fit returns the largest adequate candidate.[cite:50][cite:97]

```js
export function selectCandidate(candidates, requestBytes, algorithm) {
  const suitable = candidates.filter(c => c.capacityBytes >= requestBytes);
  const probes = algorithm === 'FIRST_FIT'
    ? firstFitProbeCount(candidates, requestBytes)
    : candidates.length;

  if (suitable.length === 0) return { candidate: null, probes };

  if (algorithm === 'FIRST_FIT') {
    return { candidate: suitable[0], probes };
  }

  const direction = algorithm === 'BEST_FIT' ? 1 : -1;
  suitable.sort((a, b) =>
    direction * (a.capacityBytes - b.capacityBytes) || a.start - b.start
  );

  return { candidate: suitable[0], probes };
}
```

Tie-breaking is always lowest physical address. The allocator must also return an `AllocationTrace` containing inspected candidates, chosen candidate, probe count, algorithm, and rejection reason.

### 9.1 Complexity

With an unsorted linear candidate list:

- First fit: best case `O(1)`, worst case `O(n)`.
- Best fit: `O(n)` selection without sorting; implementation should use a linear minimum scan rather than sorting.
- Worst fit: `O(n)` selection without sorting; implementation should use a linear maximum scan rather than sorting.

The production implementation must not sort a cloned candidate array per request; it must scan once to keep best and worst fit at `O(n)` time and `O(1)` auxiliary space.

## 10. Static Equal Engine

### 10.1 Initialization

```text
userBytes = TOTAL_MEMORY_BYTES - osBytes
require userBytes mod partitionCount = 0
partitionSize = userBytes / partitionCount
create partitionCount adjacent partitions after the OS block
```

Default:

```text
OS: 1 MiB
User memory: 15 MiB
Partition count: 5
Partition size: 3 MiB
```

### 10.2 Allocation

1. Reject if program is not `ready`.
2. Filter free partitions where `partition.sizeBytes >= program.sizeBytes`.
3. Select the candidate with the lowest start address.
4. If absent, classify the failure.
5. Attach `programId` to the partition.
6. Set program addresses to the first `program.sizeBytes` bytes of the partition.
7. Represent the remaining bytes as internal fragmentation in the view model, not as reusable free memory.

### 10.3 Termination

Clear the partition's `programId`; reset the program's physical addresses and set status to `terminated`.

## 11. Static Unequal Engine

### 11.1 Initialization

- Validate every partition size as a positive safe integer.
- Validate `sum(partitionSizes) === TOTAL_MEMORY_BYTES - osBytes`.
- Create address-ordered partitions contiguously after the OS region.

Default partition vector:

```js
[1 * MIB, 2 * MIB, 3 * MIB, 4 * MIB, 5 * MIB]
```

### 11.2 Allocation

1. Build candidates from free partitions with sufficient capacity.
2. Call `selectCandidate` with the active algorithm.
3. Attach the program to the chosen partition.
4. Set the program's start to partition start.
5. Set program end from its own size, not partition size.
6. Derive internal fragmentation from the unused suffix.

No splitting, moving, resizing, or merging of partitions is allowed.

## 12. Dynamic Engine

### 12.1 Initialization

Create:

```text
OS block: [0, osBytes - 1]
Initial hole: [osBytes, TOTAL_MEMORY_BYTES - 1]
```

### 12.2 Allocation

1. Build candidates from `HOLE` blocks.
2. Select a candidate with the active policy.
3. If no candidate exists, classify the failure.
4. Replace the chosen hole with a `PROCESS` block at the hole's starting address.
5. If residual size is greater than zero, add one `HOLE` block immediately after the process.
6. Preserve physical block ordering.
7. Derive segment addresses.
8. Validate invariants and commit atomically.

```js
function allocateIntoHole(hole, program) {
  const processBlock = {
    id: crypto.randomUUID(),
    kind: 'PROCESS',
    start: hole.start,
    sizeBytes: program.sizeBytes,
    end: hole.start + program.sizeBytes - 1,
    programId: program.id
  };

  const residualBytes = hole.sizeBytes - program.sizeBytes;
  const residual = residualBytes === 0 ? null : {
    id: crypto.randomUUID(),
    kind: 'HOLE',
    start: processBlock.end + 1,
    sizeBytes: residualBytes,
    end: hole.end,
    programId: null
  };

  return residual ? [processBlock, residual] : [processBlock];
}
```

### 12.3 Failure classification

```js
function classifyFailure(state, requestBytes) {
  const holes = state.blocks.filter(b => b.kind === 'HOLE');
  const totalFree = holes.reduce((sum, h) => sum + h.sizeBytes, 0);
  const largestHole = Math.max(0, ...holes.map(h => h.sizeBytes));

  if (totalFree < requestBytes) return 'INSUFFICIENT_TOTAL_MEMORY';
  if (largestHole < requestBytes) return 'EXTERNAL_FRAGMENTATION';
  return 'NO_CANDIDATE';
}
```

### 12.4 Termination and coalescing

1. Replace the target process block with a hole of identical range.
2. Scan the block list once in physical order.
3. Whenever the current and previous output blocks are holes, replace them with one hole covering both.
4. Commit the normalized list.

```js
export function coalesce(blocks) {
  const result = [];
  for (const block of blocks) {
    const previous = result.at(-1);
    if (previous?.kind === 'HOLE' && block.kind === 'HOLE') {
      previous.sizeBytes += block.sizeBytes;
      previous.end = block.end;
    } else {
      result.push(structuredClone(block));
    }
  }
  return result;
}
```

Coalescing adjacent free regions is required to avoid retaining unnecessary external fragments.[cite:50]

## 13. Compaction Engine

Compaction is valid only in `DYNAMIC_COMPACTION` mode.

### 13.1 Preconditions

- Simulation phase is `RUNNING`.
- At least two non-adjacent holes exist, or an allocation retry is waiting after `EXTERNAL_FRAGMENTATION`.
- There is no in-progress UI transition.

### 13.2 Algorithm

```text
cursor = osBytes
relocations = []
for each PROCESS block in ascending current start address:
    newStart = cursor
    newEnd = newStart + block.sizeBytes - 1
    if newStart != oldStart:
        record relocation
    update block and program addresses
    cursor = newEnd + 1
freeBytes = TOTAL_MEMORY_BYTES - cursor
append one HOLE [cursor, MAX_ADDRESS] when freeBytes > 0
```

Requirements:

- Preserve the relative order of processes.
- Do not change process or segment sizes.
- Recalculate segment addresses from the new process start.
- Report `bytesMoved` as the sum of sizes of relocated processes.
- Commit compaction as one undoable command.
- `Compact and retry` must commit compaction and allocation as one compound history operation; if allocation unexpectedly fails, roll back both.

Complexity is `O(p)`, where `p` is the number of resident processes.

## 14. Segment Address Derivation

Segments do not participate independently in allocation. After a program receives `[programStart, programEnd]`, segment addresses are derived in declared order.

```js
export function layoutSegments(program) {
  if (program.start === null) return [];
  let cursor = program.start;
  return program.segments.map(segment => {
    const placed = {
      ...segment,
      start: cursor,
      end: cursor + segment.sizeBytes - 1
    };
    cursor = placed.end + 1;
    return placed;
  });
}
```

Postcondition:

```text
lastSegment.end === program.end
```

## 15. Commands and Results

Supported commands:

```js
/** @typedef {
 * | {type:'START_SIMULATION', config:SimulationConfig}
 * | {type:'SET_ALGORITHM', algorithm:AllocationAlgorithm}
 * | {type:'CREATE_PROGRAM', payload:ProgramDraft}
 * | {type:'ALLOCATE_PROGRAM', programId:string}
 * | {type:'TERMINATE_PROGRAM', programId:string}
 * | {type:'COMPACT_MEMORY'}
 * | {type:'COMPACT_AND_RETRY', programId:string}
 * | {type:'UNDO'}
 * | {type:'RESET', config?:SimulationConfig}
 * | {type:'RESTORE_DEFAULT_PROGRAMS'}
 * | {type:'IMPORT_SCENARIO', payload:unknown}
 * } Command */
```

```js
/**
 * @typedef {Object} CommandResult
 * @property {boolean} ok
 * @property {SimulationState} state
 * @property {string} code
 * @property {Record<string, unknown>} details
 */
```

The domain layer returns codes and structured details, never localized UI strings.

## 16. Store and Transaction Model

```js
export function createStore(initialState, reducer) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,
    dispatch(command) {
      const result = reducer(state, command);
      if (result.ok) {
        assertState(result.state);
        state = result.state;
        listeners.forEach(fn => fn(state, result));
      }
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
```

A command must either apply all changes or none. UI animation must occur after the domain commit and must never be the source of simulation state.

## 17. History and Undo

A bounded snapshot strategy is acceptable because the state is small.

```js
/**
 * @typedef {Object} HistoryEntry
 * @property {number} sequence
 * @property {string} commandType
 * @property {string} outcomeCode
 * @property {string} mode
 * @property {string|null} algorithm
 * @property {string} timestamp
 * @property {Record<string, unknown>} details
 */
```

- Keep up to 50 prior snapshots in memory.
- Before a successful mutating command, push a structured clone of state excluding the undo stack itself.
- Undo replaces current state with the latest snapshot.
- Persistence stores current state and history entries, but storing the complete undo stack is optional.

## 18. Metrics

```js
export function deriveMetrics(state) {
  // Pure function; no cached mutable totals.
}
```

Definitions:

- `allocatedProgramBytes`: sum of resident program sizes.
- `freeBytes`: sum of free partition capacities in static modes; sum of hole sizes in dynamic modes.
- `internalFragmentationBytes`: sum of `partition.sizeBytes - program.sizeBytes` for occupied static partitions.
- `largestFreeBlockBytes`: largest free partition or hole.
- `freeBlockCount`: free partitions or holes.
- `residentProgramCount`: allocated programs.
- `utilizationPercent`: `allocatedProgramBytes / userBytes * 100`.
- `externalFragmentationDetected`: true when a rejected request has `totalFree >= request` and `largestHole < request`.
- `lastProbeCount`: from the latest allocation trace.
- `lastCompactionBytesMoved`: from the latest compaction event.

## 19. Algorithm Comparison

`compareAlgorithms(baseState, programIds)` must:

1. Clone the same initial state three times.
2. Set one clone to each algorithm.
3. Apply the same ordered allocation commands to every clone.
4. Never mutate or persist the active state.
5. Return one result object per algorithm.

```js
{
  algorithm,
  allocatedCount,
  rejectedCount,
  internalFragmentationBytes,
  freeBytes,
  largestFreeBlockBytes,
  freeBlockCount,
  totalProbes,
  finalBlocks
}
```

The comparison must reject execution if the base state already contains allocated programs unless the UI explicitly offers to compare from the current snapshot.

## 20. Persistence and Scenario Schema

Local-storage key:

```text
mms:simulation:v1
```

Exported scenario:

```json
{
  "schemaVersion": 1,
  "exportedAt": "ISO-8601 timestamp",
  "config": {},
  "programs": [],
  "activeState": {}
}
```

Import procedure:

1. Parse JSON inside `try/catch`.
2. Validate the object against explicit runtime guards.
3. Reject unknown or unsupported schema versions.
4. Recompute derived fields such as totals and end addresses rather than trusting imported values.
5. Run `assertState`.
6. Replace active state only after complete validation.

## 21. UI Architecture

### 21.1 Rendering

- Use a single store subscription to schedule rendering.
- Render only affected regions where practical, but correctness takes priority over micro-optimization.
- Use `DocumentFragment` for list and memory-map updates.
- Bind event listeners once through delegation on stable containers.
- Store IDs in `data-*` attributes, never serialized objects.

### 21.2 Memory-map scaling

The proportional overview uses:

```text
heightPercent = block.sizeBytes / TOTAL_MEMORY_BYTES * 100
```

The detailed interactive map may enforce a CSS minimum height for usability. It must label this as a detailed view and retain numeric addresses, while a parallel proportional rail shows true scale.

### 21.3 DOM semantics

- `<header>` for global controls.
- `<main>` for the simulator workspace.
- `<section>` with headings for configuration, queue, memory, metrics, and history.
- Forms use native `<label>`, `<input>`, `<select>`, and `<button>` elements.
- Memory table uses semantic `<table>` markup.
- Dialogs use native `<dialog>` where supported, with a controlled fallback.
- Status output uses `role="status"` or `aria-live="polite"`.

## 22. Design Tokens

```css
:root {
  --color-bg: #F4EEDF;
  --color-surface: #FFF9ED;
  --color-surface-strong: #EDE2CE;
  --color-text: #2F2A24;
  --color-muted: #746A5D;
  --color-border: #CFC0A8;
  --color-primary: #725A3A;
  --color-primary-hover: #5F492F;
  --color-free: #E7DDCB;
  --color-os: #4B4339;
  --color-danger: #9B3E32;
  --color-success: #486B4B;
  --radius-sm: 6px;
  --radius-md: 10px;
  --shadow-card: 0 1px 3px rgb(47 42 36 / 0.10);
  --font-ui: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
}
```

If external fonts are unavailable, system fallbacks must preserve functionality. Text contrast must meet WCAG AA; normal text requires at least 4.5:1, while large text requires at least 3:1.[cite:85][cite:86]

## 23. Default Program Data

```js
export const DEFAULT_PROGRAMS = [
  {
    id: 'P1', name: 'Compiler',
    segments: [
      { id: 'P1-CODE', name: 'Code', sizeBytes: 768 * KIB },
      { id: 'P1-DATA', name: 'Data', sizeBytes: 512 * KIB },
      { id: 'P1-HEAP', name: 'Heap', sizeBytes: 512 * KIB },
      { id: 'P1-STACK', name: 'Stack', sizeBytes: 256 * KIB }
    ]
  },
  {
    id: 'P2', name: 'Browser',
    segments: [
      { id: 'P2-CODE', name: 'Code', sizeBytes: 1 * MIB },
      { id: 'P2-DATA', name: 'Data', sizeBytes: 768 * KIB },
      { id: 'P2-HEAP', name: 'Heap', sizeBytes: 1 * MIB },
      { id: 'P2-STACK', name: 'Stack', sizeBytes: 256 * KIB }
    ]
  },
  {
    id: 'P3', name: 'Editor',
    segments: [
      { id: 'P3-CODE', name: 'Code', sizeBytes: 512 * KIB },
      { id: 'P3-DATA', name: 'Data', sizeBytes: 256 * KIB },
      { id: 'P3-HEAP', name: 'Heap', sizeBytes: 256 * KIB },
      { id: 'P3-STACK', name: 'Stack', sizeBytes: 256 * KIB }
    ]
  },
  {
    id: 'P4', name: 'Database',
    segments: [
      { id: 'P4-CODE', name: 'Code', sizeBytes: 1 * MIB },
      { id: 'P4-DATA', name: 'Data', sizeBytes: 1536 * KIB },
      { id: 'P4-HEAP', name: 'Heap', sizeBytes: 1 * MIB },
      { id: 'P4-STACK', name: 'Stack', sizeBytes: 512 * KIB }
    ]
  },
  {
    id: 'P5', name: 'Media Player',
    segments: [
      { id: 'P5-CODE', name: 'Code', sizeBytes: 768 * KIB },
      { id: 'P5-DATA', name: 'Data', sizeBytes: 512 * KIB },
      { id: 'P5-HEAP', name: 'Heap', sizeBytes: 1 * MIB },
      { id: 'P5-STACK', name: 'Stack', sizeBytes: 256 * KIB }
    ]
  }
].map((program, index) => ({
  ...program,
  sizeBytes: program.segments.reduce((sum, segment) => sum + segment.sizeBytes, 0),
  status: 'ready',
  arrivalOrder: index,
  start: null,
  end: null,
  containerId: null
}));
```

## 24. Error Codes

| Code | Meaning |
|---|---|
| `INVALID_CONFIGURATION` | Memory or partition configuration violates constraints. |
| `INVALID_PROGRAM` | Program or segment data is invalid. |
| `PROGRAM_NOT_READY` | Allocation target is not ready. |
| `PROGRAM_NOT_RESIDENT` | Termination target is not allocated. |
| `PROGRAM_TOO_LARGE` | No partition can ever contain the program. |
| `NO_FREE_PARTITION` | Suitable static partitions exist but are occupied. |
| `INSUFFICIENT_TOTAL_MEMORY` | Total free memory is smaller than request. |
| `EXTERNAL_FRAGMENTATION` | Total free memory is sufficient but no hole is large enough. |
| `COMPACTION_NOT_ALLOWED` | Current mode does not support compaction. |
| `COMPACTION_NOT_NEEDED` | Memory has zero or one free region. |
| `ADDRESS_OUT_OF_RANGE` | Computed address lies outside the 24-bit space. |
| `STATE_INVARIANT_FAILED` | Internal state is inconsistent. |
| `UNSUPPORTED_SCHEMA` | Imported or persisted data has an unsupported version. |

## 25. Testing Strategy

### 25.1 Unit tests

- Address formatting at 0, 1 MiB boundaries, and `0xFFFFFF`.
- Byte/KiB/MiB conversion and invalid values.
- Candidate selection for first, best, and worst fit.
- Deterministic tie-breaking.
- Exact-fit and split-hole allocation.
- Static internal-fragmentation calculation.
- Dynamic failure classification.
- Coalescing left, right, and both neighbors.
- Compaction order, addresses, and bytes moved.
- Segment layout before and after relocation.
- Metrics and invariant checks.
- Import validation and schema rejection.

### 25.2 Required allocator fixture

```js
const holes = [
  { id: 'H1', start: 0x100000, capacityBytes: 4 * MIB, type: 'hole' },
  { id: 'H2', start: 0x500000, capacityBytes: 3 * MIB, type: 'hole' },
  { id: 'H3', start: 0x800000, capacityBytes: 5 * MIB, type: 'hole' }
];
const request = 2 * MIB;
```

Expected:

- First fit returns `H1`.
- Best fit returns `H2`.
- Worst fit returns `H3`.

### 25.3 Integration tests

- Initialize each mode and verify full address coverage.
- Allocate all default programs in multiple orders.
- Terminate middle processes and verify holes.
- Trigger external fragmentation, compact, and retry.
- Change algorithms mid-simulation and verify existing addresses remain unchanged.
- Undo allocation, termination, and compaction.
- Export, import, and compare equivalent states.

### 25.4 Property-based invariants

For generated valid command sequences:

- Sum of represented bytes always equals 16 MiB.
- Blocks never overlap.
- Addresses never exceed 24 bits.
- No adjacent dynamic holes remain after normalization.
- Compaction never changes process sizes or order.
- Allocation never mutates an existing resident process.
- Failed commands leave state byte-for-byte equivalent to the prior state.

## 26. Performance Requirements

- Support at least 500 programs and 1,000 memory blocks without incorrect behavior.
- A single allocation, termination, or compaction should complete within 50 ms on a typical modern laptop for 1,000 blocks, excluding animation.
- UI animation must not exceed 300 ms by default and must respect `prefers-reduced-motion`.
- Rendering must not use one DOM element per byte, KiB, or fixed address unit.
- Comparison runs must execute in memory without blocking the main thread for more than 100 ms; if scenarios grow beyond this threshold, chunk work or use a Web Worker.

## 27. Security and Robustness

- Insert user-provided names through `textContent`, never `innerHTML`.
- Validate imported JSON structurally and semantically.
- Do not evaluate user input as JavaScript.
- Do not load executable code from scenario files.
- Catch local-storage quota and parsing failures.
- Treat DOM state as untrusted input; commands must be validated again in the domain layer.

## 28. Implementation Sequence

1. Define constants, models, address functions, errors, and invariants.
2. Implement default programs and configuration validators.
3. Implement candidate extraction and the three allocation policies.
4. Implement equal and unequal static engines.
5. Implement dynamic allocation, termination, splitting, and coalescing.
6. Implement compaction and segment relocation.
7. Implement metrics, traces, comparison, and history.
8. Implement store, commands, undo, persistence, import, and export.
9. Build semantic HTML structure and cream design system.
10. Connect forms and controls to commands.
11. Render memory overview, detailed map, metrics, and history.
12. Add responsive behavior and accessibility support.
13. Complete unit, integration, invariant, and browser tests.

## 29. Definition of Done

- Every functional acceptance criterion has an automated test or documented manual test.
- All state invariants pass after valid command sequences.
- The four modes produce correct and distinguishable behavior.
- First, best, and worst fit pass deterministic fixtures.
- Five default programs and their segment distributions are present.
- All addresses remain within `0x000000–0xFFFFFF`.
- Static modes report internal fragmentation correctly.
- Dynamic modes split and coalesce holes correctly.
- Compaction preserves process order and yields one final hole.
- Keyboard-only operation covers every command.
- UI text and controls meet WCAG AA contrast requirements.
- The app runs from a static server without a build step.
- No framework or backend dependency is present.
