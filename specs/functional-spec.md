# Functional Specification: Multiprogrammed Memory Simulator

**Version:** 1.0  
**Status:** Ready for implementation  
**Target platform:** Modern desktop  
**Language:** English UI  

## 1. Product Definition

The product is an educational browser application that simulates contiguous memory allocation in a multiprogrammed system. It must let users configure memory, load and terminate programs, visualize physical addresses and internal program segments, compare allocation algorithms, and observe internal and external fragmentation. In dynamic-compaction mode, compaction is performed automatically as part of an allocation when required.

The implementation must use Vanilla JavaScript, HTML, and CSS without a frontend framework or backend service.

## 2. Goals

- Accurately simulate a 24-bit physical address space of 16 MiB.
- Support four memory-management modes.
- Demonstrate the consequences of first fit, best fit, and worst fit where applicable.
- Show memory allocation at partition, process, and segment levels.
- Make every state transition observable and reproducible.
- Provide at least five predefined programs.
- Present the simulation through a minimal cream-colored interface.

## 3. Non-Goals

- Virtual memory, paging, page replacement, segmentation as a non-contiguous allocation scheme, swapping, and CPU scheduling.
- Real operating-system memory inspection.
- Executing the simulated programs.
- Multi-user collaboration, authentication, or cloud persistence.
- Modeling cache, TLB, disk, or I/O timing.

## 4. Assumptions

Because no configuration choices were confirmed, version 1.0 uses these defaults:

- Total physical memory is fixed at 16 MiB: 16,777,216 bytes.
- Valid physical addresses are `0x000000` through `0xFFFFFF`, inclusive.
- The operating system occupies the first 1 MiB by default: `0x000000` through `0x0FFFFF`.
- The OS reservation is editable before a simulation starts, from 0 bytes up to less than 16 MiB.
- Programs are allocated contiguously by total size.
- Program segments are informational subdivisions inside the program's contiguous allocation.
- Program operations are manual and step-based: create, enqueue, allocate, terminate, undo, and reset.
- In `DYNAMIC_COMPACTION`, an allocation that fails solely because of external fragmentation compacts and retries within the same transaction. The application reports this automatic relocation to the user.
- All calculations use bytes internally. The UI accepts bytes, KiB, and MiB.
- Changing the memory-management mode or partition layout requires a reset confirmation.

## 5. Users

### Primary user

A computer-science or systems-engineering student learning contiguous memory allocation.

### Secondary user

An instructor demonstrating allocation decisions and fragmentation during a class or laboratory.

## 6. Management Modes

The mode selector must expose exactly these options:

1. **Static partitions — equal size**
2. **Static partitions — unequal size**
3. **Dynamic partitions — no compaction**
4. **Dynamic partitions — with compaction**

### 6.1 Static partitions — equal size

- User memory is divided into `N` equal partitions before the simulation starts.
- Default configuration: five partitions of 3 MiB each after the default 1 MiB OS region.
- One partition can contain at most one program.
- A program can be loaded only if its total size is less than or equal to the partition size.
- The assigned partition remains the same size; unused space inside it is internal fragmentation.
- Because all partitions are equal, the application assigns the lowest-address free partition. The allocation-algorithm selector must be disabled with an explanatory label.
- The number and size of partitions cannot change while programs are loaded.

### 6.2 Static partitions — unequal size

- User memory is divided into predefined partitions of different sizes before the simulation starts.
- Default partition sizes after the default OS region: 1 MiB, 2 MiB, 3 MiB, 4 MiB, and 5 MiB.
- One partition can contain at most one program.
- The selected allocation algorithm operates over free partitions that can contain the program.
- Unused space inside the selected partition is internal fragmentation.
- Partition boundaries never move during a simulation.

### 6.3 Dynamic partitions — no compaction

- User memory begins as one free hole after the OS region.
- Each loaded program receives one contiguous block exactly equal to its total size.
- The selected algorithm chooses a suitable free hole.
- Terminating a program converts its block into a hole.
- Adjacent free holes must merge immediately.
- Non-adjacent holes remain separate.
- Compaction controls must be hidden or disabled.
- An allocation must fail if no single hole is large enough, even when total free memory is sufficient.

### 6.4 Dynamic partitions — with compaction

- Allocation and termination behavior is identical to dynamic partitions without compaction.
- If allocation fails because the largest hole is too small but total free memory is sufficient, the allocation transaction automatically compacts memory and retries.
- Automatic compaction moves allocated processes toward the lowest available user-memory address while preserving their current address order, then creates one free hole at the high-address end of memory.
- The successful allocation exposes its relocated processes, moved bytes, and triggering program through its result details; the UI reports the event and displays the bytes moved by the latest compaction.
- Undo treats automatic compaction and its triggering allocation as one state change.

## 7. Allocation Algorithms

| Mode | First fit | Best fit | Worst fit |
|---|---:|---:|---:|
| Static, equal size | Not applicable; lowest-address free partition | Not applicable | Not applicable |
| Static, unequal size | Required | Required | Required |
| Dynamic, no compaction | Required | Required | Required |
| Dynamic, with compaction | Required | Required | Required |

### 7.1 First fit

Select the first suitable candidate in ascending physical-address order.

### 7.2 Best fit

Select the smallest suitable candidate. If multiple candidates have equal size, select the one with the lowest starting address.

### 7.3 Worst fit

Select the largest suitable candidate. If multiple candidates have equal size, select the one with the lowest starting address.

### 7.4 Algorithm switching

- The user may change the algorithm between allocation operations.
- Changing the algorithm affects future allocations only.
- Existing allocations must not be moved or recalculated.
- The event history must record which algorithm was used for every allocation attempt.

## 8. Program Model

Each simulated program must contain:

- Unique immutable ID.
- Editable display name.
- Color assigned by the application.
- Ordered internal segments.
- Total size calculated as the sum of segment sizes.
- State: `ready`, `allocated`, `terminated`, or `rejected`.
- Arrival order.
- Current physical start and end addresses when allocated.

The default segment types are `Code`, `Data`, `Heap`, and `Stack`. Custom segment names are allowed. A program must contain at least one segment, every segment size must be a positive integer number of bytes, and the sum must be at most the available user memory.

### 8.1 Default programs

| Program | Code | Data | Heap | Stack | Total |
|---|---:|---:|---:|---:|---:|
| P1 — Compiler | 768 KiB | 512 KiB | 512 KiB | 256 KiB | 2 MiB |
| P2 — Browser | 1 MiB | 768 KiB | 1 MiB | 256 KiB | 3 MiB |
| P3 — Editor | 512 KiB | 256 KiB | 256 KiB | 256 KiB | 1.25 MiB |
| P4 — Database | 1 MiB | 1.5 MiB | 1 MiB | 512 KiB | 4 MiB |
| P5 — Media Player | 768 KiB | 512 KiB | 1 MiB | 256 KiB | 2.5 MiB |

The application may provide additional presets, but these five must always be available after **Restore defaults**.

## 9. Core User Flows

### 9.1 Start a simulation

1. User selects a management mode.
2. User sets the OS reservation.
3. User configures the partition count or sizes when the selected mode requires it.
4. User selects an allocation algorithm when applicable.
5. User reviews the generated address map.
6. User selects **Start simulation**.
7. Configuration controls become locked until reset.

### 9.2 Load a predefined program

1. User selects a program in the ready queue.
2. User selects **Allocate**.
3. The simulator determines suitable candidates.
4. The simulator visually highlights the inspected candidates in algorithm order.
5. The simulator selects a candidate or rejects the request.
6. The memory map, metrics, tables, and history update atomically.

### 9.3 Create a custom program

1. User selects **New program**.
2. User enters a name.
3. User adds, edits, reorders, or removes segments.
4. The application displays the computed total size in real time.
5. User saves the program to the ready queue.

### 9.4 Terminate a program

1. User selects an allocated program.
2. User selects **Terminate**.
3. Static mode marks its complete partition free.
4. Dynamic mode converts its allocation into a hole and merges adjacent holes.
5. Metrics and history update.

### 9.5 Automatic compaction during allocation

1. User selects **Allocate** for a ready program.
2. If no individual hole is large enough but total free memory is sufficient, the simulator detects external fragmentation.
3. Within that same allocation transaction, allocated processes move toward the OS boundary in physical-address order and segment offsets remain unchanged.
4. The simulator retries the allocation against the single final hole.
5. The UI confirms the successful allocation and reports the bytes moved.
6. One undo operation restores the exact pre-allocation fragmented layout.

### 9.6 Compare algorithms

The user may select **Compare algorithms** for the current initial configuration and ready-program order. The application must run first, best, and worst fit in isolated cloned states and display:

- Successful allocations.
- Rejected allocations.
- Total internal fragmentation.
- Total external free memory.
- Largest free hole.
- Number of free holes.
- Search probes performed.

Comparison runs must not modify the active simulation.

## 10. Interface Requirements

### 10.1 Layout

Desktop layout must contain:

- Top bar: title, mode selector, algorithm selector, reset, undo.
- Left panel: configuration and ready queue.
- Center panel: vertical physical memory map.
- Right panel: metrics, selected-block details, and event history.
- Bottom area or modal: algorithm comparison.

On narrow screens, panels must stack in the order configuration, memory map, metrics, and history.

### 10.2 Visual style

- Minimalist interface with cream and warm neutral colors.
- Main background: warm cream.
- Cards: slightly lighter cream.
- Primary text: dark brown or charcoal.
- Borders: muted beige.
- Accent colors may identify processes, but must remain distinguishable against the cream background.
- No gradients, glassmorphism, neon colors, or heavy shadows.
- Use whitespace and thin borders to establish hierarchy.
- Use a monospaced font for addresses, byte counts, and event details.

### 10.3 Memory map

- The memory map must represent address `0x000000` at the top and `0xFFFFFF` at the bottom.
- Each block must display its type, name, size, start address, and end address when space permits.
- Blocks too small to label must remain selectable and expose details through a tooltip or side panel.
- The OS, free memory, partitions, processes, internal fragmentation, and program segments must have distinct visual treatments.
- Program segments must appear nested inside an allocated program block.
- The map must support a minimum visible height for tiny blocks without falsifying numeric sizes; a separate proportional overview must retain true scale.

### 10.4 Feedback

Every operation must produce a clear status message:

- Allocation successful.
- Allocation rejected: program exceeds every partition.
- Allocation rejected: insufficient total memory.
- Allocation rejected: external fragmentation.
- Partition or hole selected by the active algorithm.
- Process terminated.
- Adjacent holes merged.
- Memory compacted automatically during allocation, including bytes moved and the allocated program.
- Invalid configuration or input.

Messages must include the relevant program, requested size, algorithm, and candidate or failure reason.

## 11. Metrics

The application must continuously display:

- Total memory.
- OS-reserved memory.
- User memory.
- Allocated program memory.
- Free memory.
- Number of resident programs.
- Number of free partitions or holes.
- Largest free partition or hole.
- Total internal fragmentation.
- External fragmentation condition.
- User-memory utilization percentage.
- Number of search probes in the last allocation.
- Total bytes moved by the last compaction.

For dynamic modes, internal fragmentation is zero under the simplified byte-exact model. For static modes, external fragmentation is not reported; free whole partitions are reported separately.

## 12. Address and Size Rules

- One KiB equals 1,024 bytes.
- One MiB equals 1,048,576 bytes.
- All starts and sizes must be non-negative safe integers.
- For a non-empty block, `end = start + size - 1`.
- Every address must remain between `0x000000` and `0xFFFFFF`.
- Hexadecimal addresses must use uppercase digits and exactly six characters after `0x`.
- The memory map must contain no overlap and no unrepresented byte.
- The OS block must always start at `0x000000`.
- User memory must always start at `OS size`.

## 13. Validation Rules

- Total partition size plus OS size must equal exactly 16 MiB.
- Equal static partitions must divide user memory without a remainder. If they do not, the configuration is invalid rather than silently rounding.
- Unequal static partitions must all be positive and sum exactly to user memory.
- Program names must be between 1 and 60 visible characters.
- Segment names must be between 1 and 40 visible characters.
- Program and segment sizes must be positive integers after unit conversion.
- Duplicate program display names are allowed; IDs remain unique.
- Allocating an already allocated or terminated program must be prevented.
- Terminating a non-resident program must be prevented.
- No manual compaction control may be exposed. Automatic compaction is attempted only by an allocation in `DYNAMIC_COMPACTION` after external fragmentation is detected.

## 14. History and Undo

- Every state-changing command must create an immutable history entry.
- History entries must include sequence number, operation, target, mode, algorithm, before/after summary, and outcome.
- The application must support undoing at least the latest 50 state-changing operations.
- Undo must restore the exact prior memory map, queue, metrics, and program addresses.
- Comparison simulations do not enter active history.
- Reset creates a new initial state after confirmation.

## 15. Persistence

- The current configuration, custom programs, and active simulation must persist in browser local storage.
- On reload, the user must be offered **Resume simulation** or **Start over**.
- A version field must be stored so incompatible future state can be safely discarded.
- The app must provide JSON export and import for simulation scenarios.

## 16. Accessibility

- All functionality must be keyboard accessible.
- Inputs must have visible labels and associated error messages.
- Focus indicators must always be visible.
- Color must not be the only indicator of block type or status.
- Text and controls must meet WCAG AA contrast targets.
- Status changes must be announced through an `aria-live` region.
- The memory map must have an equivalent table representation for screen-reader and keyboard users.

## 17. Acceptance Criteria

### AC-01 Address space

Given a new simulation, the first address is `0x000000`, the final address is `0xFFFFFF`, and the represented size is exactly 16,777,216 bytes.

### AC-02 Equal static partitions

Given a 1 MiB OS reservation and five equal partitions, each partition is exactly 3 MiB and the five partitions cover all 15 MiB of user memory without overlap or gaps.

### AC-03 Internal fragmentation

Given a 2 MiB program allocated to a 3 MiB static partition, the UI reports 1 MiB of internal fragmentation for that partition.

### AC-04 First fit

Given free candidates of 4 MiB at a lower address and 3 MiB at a higher address, a 2 MiB request under first fit uses the lower-address 4 MiB candidate.

### AC-05 Best fit

Given free candidates of 4 MiB, 3 MiB, and 5 MiB, a 2 MiB request under best fit uses the 3 MiB candidate.

### AC-06 Worst fit

Given free candidates of 4 MiB, 3 MiB, and 5 MiB, a 2 MiB request under worst fit uses the 5 MiB candidate.

### AC-07 Deterministic tie

Given equal-size valid candidates, best fit and worst fit select the candidate with the lowest physical start address.

### AC-08 Hole splitting

Given a 5 MiB dynamic hole and a 2 MiB request, successful allocation creates one 2 MiB process block followed by one 3 MiB free hole.

### AC-09 Hole merging

Given a process between two free holes, terminating it merges all three adjacent free regions into one hole.

### AC-10 External fragmentation

Given 4 MiB total free memory split into two non-adjacent 2 MiB holes, a 3 MiB request fails and is identified as external fragmentation.

### AC-11 Compaction

Given separated holes totaling 4 MiB, compaction preserves process order, updates moved addresses, and produces one 4 MiB hole at the end of user memory.

### AC-12 Segment integrity

After allocation or compaction, each program segment retains its size and order, and the segment address ranges exactly cover the program allocation.

### AC-13 Algorithm isolation

Changing the algorithm does not modify previously allocated blocks.

### AC-14 Defaults

Restoring defaults produces the five required programs with the exact segment distributions defined in this specification.

### AC-15 State integrity

After every successful command, all 16 MiB are represented exactly once and no memory block overlaps another.
