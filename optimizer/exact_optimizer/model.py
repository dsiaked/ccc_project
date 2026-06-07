from __future__ import annotations

import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from math import ceil
from threading import Event, Thread
from typing import Callable, Iterable

from ortools.sat.python import cp_model

from .schema import (
    AllocationBus,
    AllocationResult,
    AllocationWarning,
    ObjectiveValue,
    OptimizationInput,
    PassengerAssignment,
)
from .validation import validate_input, validate_result


ProgressCallback = Callable[[str, int | None], None]
CancellationCheck = Callable[[], bool]


class PhaseSolveError(RuntimeError):
    def __init__(self, phase: str, status: str) -> None:
        super().__init__(f"{phase} phase ended with {status}.")
        self.status = status


class OptimizationCancelled(RuntimeError):
    pass


@dataclass(frozen=True)
class _BusSlot:
    destination: str
    destination_index: int
    slot_index: int

    @property
    def key(self) -> tuple[str, int]:
        return (self.destination, self.slot_index)


def _status_name(status: cp_model.CpSolverStatus) -> str:
    return cp_model.CpSolver().StatusName(status)


def _search_worker_count() -> int:
    return max(1, (os.cpu_count() or 1) // 2)


def _secondary_phase_seconds() -> float:
    return max(1.0, float(os.environ.get("ALLOCATION_SECONDARY_PHASE_SECONDS", "30")))


def _maximum_unused_seats(
    passenger_count: int,
    bus_count: int,
    capacity: int,
) -> dict[tuple[int, tuple[str, int]], int]:
    return bus_count * capacity - passenger_count


def _maximum_destination_buses(
    eligible_passengers: int,
    capacity: int,
    maximum_unused_seats: int,
) -> int:
    return (eligible_passengers + maximum_unused_seats) // capacity


def _refresh_solution_hints(
    model: cp_model.CpModel,
    solver: cp_model.CpSolver,
) -> None:
    model.ClearHints()
    for variable_index in range(len(model.Proto().variables)):
        variable = model.GetIntVarFromProtoIndex(variable_index)
        model.AddHint(variable, solver.Value(variable))


def _complete_solution_hints(
    model: cp_model.CpModel,
    cancellation_check: CancellationCheck | None,
) -> None:
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = _search_worker_count()
    solver.parameters.max_time_in_seconds = _secondary_phase_seconds()
    monitor_stopped = Event()

    def monitor_cancellation() -> None:
        while not monitor_stopped.wait(0.5):
            if cancellation_check and cancellation_check():
                solver.StopSearch()
                return

    monitor = (
        Thread(target=monitor_cancellation, daemon=True)
        if cancellation_check
        else None
    )
    if monitor:
        monitor.start()
    try:
        status = solver.Solve(model)
    finally:
        monitor_stopped.set()
        if monitor:
            monitor.join(timeout=1)
    if cancellation_check and cancellation_check():
        raise OptimizationCancelled("Optimization cancellation was requested.")
    if status in (cp_model.FEASIBLE, cp_model.OPTIMAL):
        _refresh_solution_hints(model, solver)


def _solve_phase(
    *,
    model: cp_model.CpModel,
    expression: cp_model.LinearExpr,
    name: str,
    objectives: list[ObjectiveValue],
    progress: ProgressCallback | None,
    cancellation_check: CancellationCheck | None,
    search_workers: int | None = None,
    max_time_seconds: float | None = None,
) -> cp_model.CpSolver:
    model.Minimize(expression)
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = search_workers or _search_worker_count()
    solver.parameters.random_seed = 0
    if max_time_seconds is not None:
        solver.parameters.max_time_in_seconds = max_time_seconds
    monitor_stopped = Event()

    def monitor_cancellation() -> None:
        while not monitor_stopped.wait(0.5):
            if cancellation_check and cancellation_check():
                solver.StopSearch()
                return

    monitor = (
        Thread(target=monitor_cancellation, daemon=True)
        if cancellation_check
        else None
    )
    if monitor:
        monitor.start()
    try:
        status = solver.Solve(model)
    finally:
        monitor_stopped.set()
        if monitor:
            monitor.join(timeout=1)
    if cancellation_check and cancellation_check():
        raise OptimizationCancelled("Optimization cancellation was requested.")
    if status != cp_model.OPTIMAL:
        raise PhaseSolveError(name, _status_name(status))
    value = round(solver.ObjectiveValue())
    objectives.append(ObjectiveValue(name=name, value=value))
    model.Add(expression == value)
    _refresh_solution_hints(model, solver)
    if progress:
        progress(name, value)
    return solver


def _sum(items: Iterable[cp_model.LinearExpr]) -> cp_model.LinearExpr:
    return cp_model.LinearExpr.Sum(list(items))


def _solve_primary_objectives(
    data: OptimizationInput,
    passengers: tuple,
    destinations: tuple[str, ...],
    progress: ProgressCallback | None,
    cancellation_check: CancellationCheck | None,
) -> tuple[
    int,
    int,
    list[ObjectiveValue],
    dict[tuple[tuple[str, str], str], int],
    dict[str, int],
]:
    model = cp_model.CpModel()
    preference_pair_counts = Counter(
        (passenger.first_choice, passenger.second_choice)
        for passenger in passengers
    )
    assigned_by_pair_and_destination: dict[tuple[tuple[str, str], str], cp_model.IntVar] = {}
    first_choice_demand = Counter(
        passenger.first_choice for passenger in passengers
    )

    for pair_index, (pair, count) in enumerate(sorted(preference_pair_counts.items())):
        first, second = pair
        first_count = model.NewIntVar(0, count, f"pair_{pair_index}_first")
        second_count = model.NewIntVar(0, count, f"pair_{pair_index}_second")
        model.Add(first_count + second_count == count)
        assigned_by_pair_and_destination[(pair, first)] = first_count
        assigned_by_pair_and_destination[(pair, second)] = second_count

    buses_by_destination: dict[str, cp_model.IntVar] = {}
    assigned_by_destination: dict[str, cp_model.LinearExpr] = {}
    for destination_index, destination in enumerate(destinations):
        eligible = sum(
            count
            for pair, count in preference_pair_counts.items()
            if destination in pair
        )
        maximum_buses = ceil(eligible / data.bus.capacity)
        buses = model.NewIntVar(
            0, maximum_buses, f"destination_{destination_index}_buses"
        )
        has_buses = model.NewBoolVar(f"destination_{destination_index}_active")
        assigned_count = _sum(
            variable
            for (pair, assigned_destination), variable in assigned_by_pair_and_destination.items()
            if assigned_destination == destination
        )
        model.Add(assigned_count <= data.bus.capacity * buses)
        model.Add(assigned_count >= buses)
        model.Add(buses <= maximum_buses * has_buses)
        model.Add(buses >= has_buses)
        buses_by_destination[destination] = buses
        assigned_by_destination[destination] = assigned_count

    objectives: list[ObjectiveValue] = []
    solver = _solve_phase(
        model=model,
        expression=_sum(buses_by_destination.values()),
        name="total_buses",
        objectives=objectives,
        progress=progress,
        cancellation_check=cancellation_check,
    )
    total_buses = objectives[-1].value
    maximum_unused_seats = _maximum_unused_seats(
        len(passengers),
        total_buses,
        data.bus.capacity,
    )
    unused_seats_by_destination: dict[str, cp_model.IntVar] = {}
    first_choice_overflow_by_destination: dict[str, cp_model.IntVar] = {}
    required_second_choices = []
    for destination_index, destination in enumerate(destinations):
        buses = buses_by_destination[destination]
        assigned_count = assigned_by_destination[destination]
        unused_seats = model.NewIntVar(
            0,
            maximum_unused_seats,
            f"destination_{destination_index}_unused_seats",
        )
        model.Add(
            assigned_count + unused_seats == data.bus.capacity * buses
        )
        unused_seats_by_destination[destination] = unused_seats

        first_choice_overflow = model.NewIntVar(
            0,
            first_choice_demand[destination],
            f"destination_{destination_index}_first_choice_overflow",
        )
        model.Add(
            first_choice_overflow
            >= first_choice_demand[destination] - data.bus.capacity * buses
        )
        first_choice_overflow_by_destination[destination] = first_choice_overflow
        required_second_choices.append(first_choice_overflow)

    model.Add(
        _sum(unused_seats_by_destination.values()) == maximum_unused_seats
    )
    second_choices_expression = _sum(
        assigned_by_pair_and_destination[(pair, pair[1])]
        for pair in preference_pair_counts
    )
    model.Add(second_choices_expression >= _sum(required_second_choices))

    for destination, buses in buses_by_destination.items():
        bus_count = solver.Value(buses)
        model.AddHint(
            unused_seats_by_destination[destination],
            data.bus.capacity * bus_count
            - solver.Value(assigned_by_destination[destination]),
        )
        model.AddHint(
            first_choice_overflow_by_destination[destination],
            max(0, first_choice_demand[destination] - data.bus.capacity * bus_count),
        )

    solver = _solve_phase(
        model=model,
        expression=second_choices_expression,
        name="second_choice_passengers",
        objectives=objectives,
        progress=progress,
        cancellation_check=cancellation_check,
    )
    second_choice_count = objectives[-1].value

    return (
        total_buses,
        second_choice_count,
        objectives,
        {
            key: solver.Value(variable)
            for key, variable in assigned_by_pair_and_destination.items()
        },
        {
            destination: solver.Value(buses)
            for destination, buses in buses_by_destination.items()
        },
    )


def _add_detailed_solution_hints(
    model: cp_model.CpModel,
    *,
    cohorts: tuple[tuple[tuple[str, str, str, str], list[int]], ...],
    slots_by_destination: dict[str, list[_BusSlot]],
    assignment: dict[tuple[int, tuple[str, int]], cp_model.IntVar],
    active: dict[tuple[str, int], cp_model.IntVar],
    primary_assignment_counts: dict[tuple[tuple[str, str], str], int],
    primary_bus_counts: dict[str, int],
    capacity: int,
) -> int:
    cohort_destination_counts: dict[tuple[int, str], int] = defaultdict(int)
    cohort_indexes_by_pair: dict[tuple[str, str], list[int]] = defaultdict(list)
    for cohort_index, (cohort, _) in enumerate(cohorts):
        cohort_indexes_by_pair[(cohort[2], cohort[3])].append(cohort_index)

    for pair, cohort_indexes in cohort_indexes_by_pair.items():
        first, second = pair
        remaining_first = primary_assignment_counts[(pair, first)]
        for cohort_index in sorted(
            cohort_indexes,
            key=lambda index: (
                cohorts[index][0][0],
                cohorts[index][0][1],
                -len(cohorts[index][1]),
            ),
        ):
            cohort_size = len(cohorts[cohort_index][1])
            assigned_first = min(cohort_size, remaining_first)
            cohort_destination_counts[(cohort_index, first)] = assigned_first
            cohort_destination_counts[(cohort_index, second)] = (
                cohort_size - assigned_first
            )
            remaining_first -= assigned_first

    assignment_hints: dict[tuple[int, tuple[str, int]], int] = defaultdict(int)
    for destination, destination_slots in slots_by_destination.items():
        bus_count = primary_bus_counts[destination]
        active_slots = destination_slots[:bus_count]
        if bus_count == 0:
            continue
        destination_cohorts = sorted(
            (
                (cohort_index, count)
                for (cohort_index, assigned_destination), count
                in cohort_destination_counts.items()
                if assigned_destination == destination and count > 0
            ),
            key=lambda item: (
                cohorts[item[0]][0][0],
                cohorts[item[0]][0][1],
                -item[1],
            ),
        )
        destination_passenger_count = sum(count for _, count in destination_cohorts)
        base_occupancy, extra_passengers = divmod(
            destination_passenger_count,
            bus_count,
        )
        remaining_capacity_by_slot = [
            base_occupancy + int(slot_index < extra_passengers)
            for slot_index in range(bus_count)
        ]
        slot_index = 0
        for cohort_index, count in destination_cohorts:
            remaining_count = count
            while remaining_count > 0:
                slot = active_slots[slot_index]
                assigned_count = min(
                    remaining_count,
                    remaining_capacity_by_slot[slot_index],
                )
                assignment_hints[(cohort_index, slot.key)] += assigned_count
                remaining_count -= assigned_count
                remaining_capacity_by_slot[slot_index] -= assigned_count
                if remaining_capacity_by_slot[slot_index] == 0:
                    slot_index += 1

    for slot_key, variable in active.items():
        model.AddHint(
            variable,
            int(slot_key[1] < primary_bus_counts[slot_key[0]]),
        )
    for key, variable in assignment.items():
        model.AddHint(variable, assignment_hints[key])
    return assignment_hints


def _add_result_solution_hints(
    model: cp_model.CpModel,
    *,
    result: AllocationResult,
    passengers: tuple,
    cohorts: tuple[tuple[tuple[str, str, str, str], list[int]], ...],
    slots_by_destination: dict[str, list[_BusSlot]],
    assignment: dict[tuple[int, tuple[str, int]], cp_model.IntVar],
    active: dict[tuple[str, int], cp_model.IntVar],
) -> bool:
    passenger_index_by_id = {
        passenger.reservation_id: index for index, passenger in enumerate(passengers)
    }
    cohort_index_by_passenger_index = {
        passenger_index: cohort_index
        for cohort_index, (_, passenger_indexes) in enumerate(cohorts)
        for passenger_index in passenger_indexes
    }
    slot_key_by_bus_id: dict[str, tuple[str, int]] = {}
    destination_bus_indexes: dict[str, int] = defaultdict(int)
    for bus in result.buses:
        slot_index = destination_bus_indexes[bus.destination]
        destination_slots = slots_by_destination.get(bus.destination, [])
        if slot_index >= len(destination_slots):
            return False
        slot_key_by_bus_id[bus.bus_id] = destination_slots[slot_index].key
        destination_bus_indexes[bus.destination] += 1

    assignment_hints: dict[tuple[int, tuple[str, int]], int] = defaultdict(int)
    for passenger_assignment in result.assignments:
        passenger_index = passenger_index_by_id.get(
            passenger_assignment.reservation_id
        )
        slot_key = slot_key_by_bus_id.get(passenger_assignment.bus_id)
        if passenger_index is None or slot_key is None:
            return False
        cohort_index = cohort_index_by_passenger_index[passenger_index]
        key = (cohort_index, slot_key)
        if key not in assignment:
            return False
        assignment_hints[key] += 1

    model.ClearHints()
    active_slot_keys = set(slot_key_by_bus_id.values())
    for slot_key, variable in active.items():
        model.AddHint(variable, int(slot_key in active_slot_keys))
    for key, variable in assignment.items():
        model.AddHint(variable, assignment_hints[key])
    return True


def _build_result_from_slot_assignments(
    data: OptimizationInput,
    passengers: tuple,
    selected_slots: list[_BusSlot],
    passenger_indexes_by_slot: dict[tuple[str, int], list[int]],
    objectives: list[ObjectiveValue],
) -> AllocationResult:
    buses: list[AllocationBus] = []
    assignments: list[PassengerAssignment] = []
    for bus_index, slot in enumerate(selected_slots):
        passenger_indexes = sorted(
            passenger_indexes_by_slot[slot.key],
            key=lambda index: (
                passengers[index].campus,
                passengers[index].team,
                passengers[index].reservation_id,
            ),
        )
        passenger_ids = tuple(
            passengers[index].reservation_id for index in passenger_indexes
        )
        bus_id = f"bus-{bus_index + 1:03d}"
        buses.append(
            AllocationBus(
                bus_id=bus_id,
                label=f"{bus_index + 1} bus",
                destination=slot.destination,
                capacity=data.bus.capacity,
                price=data.bus.price,
                passenger_ids=passenger_ids,
            )
        )
        for seat_number, passenger_index in enumerate(passenger_indexes, start=1):
            passenger = passengers[passenger_index]
            assignments.append(
                PassengerAssignment(
                    reservation_id=passenger.reservation_id,
                    bus_id=bus_id,
                    destination=slot.destination,
                    preference_rank=(
                        1 if slot.destination == passenger.first_choice else 2
                    ),
                    seat_number=seat_number,
                )
            )

    warnings: list[AllocationWarning] = []
    first_choice_demand: dict[str, list[str]] = defaultdict(list)
    for passenger in passengers:
        first_choice_demand[passenger.first_choice].append(passenger.reservation_id)
    active_destinations = {bus.destination for bus in buses}
    for destination, passenger_ids in sorted(first_choice_demand.items()):
        if destination not in active_destinations:
            warnings.append(
                AllocationWarning(
                    code="FIRST_CHOICE_DESTINATION_REMOVED",
                    destination=destination,
                    passenger_ids=tuple(sorted(passenger_ids)),
                    message=f"{destination} first-choice service was removed.",
                )
            )
    for bus in buses:
        if len(bus.passenger_ids) < data.bus.recommended_minimum_passengers:
            warnings.append(
                AllocationWarning(
                    code="BELOW_RECOMMENDED_MINIMUM",
                    destination=bus.destination,
                    passenger_ids=bus.passenger_ids,
                    message=f"{bus.label} is below the recommended occupancy.",
                )
            )

    result = AllocationResult(
        status="OPTIMAL",
        total_buses=len(buses),
        total_cost=len(buses) * data.bus.price,
        second_choice_count=sum(
            assignment.preference_rank == 2 for assignment in assignments
        ),
        buses=tuple(buses),
        assignments=tuple(sorted(assignments, key=lambda item: item.reservation_id)),
        objectives=tuple(objectives),
        warnings=tuple(warnings),
    )
    result_errors = validate_result(data, result)
    if result_errors:
        return AllocationResult(
            status="FAILED",
            error_message=" ".join(result_errors),
            diagnostics={"invalid_result": result},
        )
    return result


def _build_baseline_result(
    data: OptimizationInput,
    passengers: tuple,
    destinations: tuple[str, ...],
    assignment_counts: dict[tuple[tuple[str, str], str], int],
    bus_counts: dict[str, int],
    objectives: list[ObjectiveValue],
) -> AllocationResult:
    passenger_indexes_by_pair: dict[tuple[str, str], list[int]] = defaultdict(list)
    for passenger_index, passenger in enumerate(passengers):
        passenger_indexes_by_pair[
            (passenger.first_choice, passenger.second_choice)
        ].append(passenger_index)

    passenger_indexes_by_destination: dict[str, list[int]] = defaultdict(list)
    for pair, passenger_indexes in sorted(passenger_indexes_by_pair.items()):
        first_choice_count = assignment_counts[(pair, pair[0])]
        passenger_indexes_by_destination[pair[0]].extend(
            passenger_indexes[:first_choice_count]
        )
        passenger_indexes_by_destination[pair[1]].extend(
            passenger_indexes[first_choice_count:]
        )

    selected_slots: list[_BusSlot] = []
    passenger_indexes_by_slot: dict[tuple[str, int], list[int]] = {}
    for destination_index, destination in enumerate(destinations):
        bus_count = bus_counts[destination]
        if bus_count == 0:
            continue
        destination_passengers = sorted(passenger_indexes_by_destination[destination])
        base_occupancy, extra_passengers = divmod(
            len(destination_passengers),
            bus_count,
        )
        next_passenger_index = 0
        for slot_index in range(bus_count):
            slot = _BusSlot(destination, destination_index, slot_index)
            occupancy = base_occupancy + int(slot_index < extra_passengers)
            selected_slots.append(slot)
            passenger_indexes_by_slot[slot.key] = destination_passengers[
                next_passenger_index : next_passenger_index + occupancy
            ]
            next_passenger_index += occupancy

    return _build_result_from_slot_assignments(
        data,
        passengers,
        selected_slots,
        passenger_indexes_by_slot,
        objectives,
    )


def optimize(
    data: OptimizationInput,
    progress: ProgressCallback | None = None,
    cancellation_check: CancellationCheck | None = None,
    *,
    detailed_balance: bool = False,
    skipped_detailed_phases: frozenset[str] = frozenset(),
    initial_result: AllocationResult | None = None,
) -> AllocationResult:
    input_errors = validate_input(data)
    if input_errors:
        return AllocationResult(
            status="FAILED",
            error_message=" ".join(input_errors),
        )
    if not data.passengers:
        return AllocationResult(status="OPTIMAL")

    passengers = tuple(
        sorted(data.passengers, key=lambda item: item.reservation_id)
    )
    destinations = tuple(
        sorted(
            {
                choice
                for passenger in passengers
                for choice in (passenger.first_choice, passenger.second_choice)
            }
        )
    )
    try:
        (
            optimal_total_buses,
            optimal_second_choices,
            objectives,
            primary_assignment_counts,
            primary_bus_counts,
        ) = (
            _solve_primary_objectives(
                data, passengers, destinations, progress, cancellation_check
            )
        )
    except PhaseSolveError as error:
        return AllocationResult(
            status="INFEASIBLE" if error.status == "INFEASIBLE" else "FAILED",
            error_message=str(error),
            diagnostics={"destinations": destinations},
        )
    if not detailed_balance:
        return _build_baseline_result(
            data,
            passengers,
            destinations,
            primary_assignment_counts,
            primary_bus_counts,
            objectives,
        )

    destination_index = {
        destination: index for index, destination in enumerate(destinations)
    }
    eligible_count = Counter(
        choice
        for passenger in passengers
        for choice in (passenger.first_choice, passenger.second_choice)
    )
    maximum_unused_seats = _maximum_unused_seats(
        len(passengers),
        optimal_total_buses,
        data.bus.capacity,
    )
    slots = tuple(
        _BusSlot(destination, destination_index[destination], slot_index)
        for destination in destinations
        for slot_index in range(
            _maximum_destination_buses(
                eligible_count[destination],
                data.bus.capacity,
                maximum_unused_seats,
            )
        )
    )
    slots_by_destination: dict[str, list[_BusSlot]] = defaultdict(list)
    for slot in slots:
        slots_by_destination[slot.destination].append(slot)
    slot_order_by_key = {slot.key: index for index, slot in enumerate(slots)}

    passenger_indexes_by_cohort: dict[tuple[str, str, str, str], list[int]] = defaultdict(list)
    for passenger_index, passenger in enumerate(passengers):
        passenger_indexes_by_cohort[
            (
                passenger.campus,
                passenger.team,
                passenger.first_choice,
                passenger.second_choice,
            )
        ].append(passenger_index)
    cohorts = tuple(sorted(passenger_indexes_by_cohort.items()))
    cohort_sizes = tuple(len(indexes) for _, indexes in cohorts)

    model = cp_model.CpModel()
    active = {
        slot.key: model.NewBoolVar(f"active_d{slot.destination_index}_b{slot.slot_index}")
        for slot in slots
    }
    assignment: dict[tuple[int, tuple[str, int]], cp_model.IntVar] = {}
    assignment_slot_keys_by_cohort: dict[int, list[tuple[str, int]]] = defaultdict(list)
    for cohort_index, (cohort, passenger_indexes) in enumerate(cohorts):
        _, _, first_choice, second_choice = cohort
        cohort_size = len(passenger_indexes)
        cohort_variables = []
        for destination in (first_choice, second_choice):
            for slot in slots_by_destination[destination]:
                variable = model.NewIntVar(
                    0,
                    cohort_size,
                    f"assign_c{cohort_index}_d{slot.destination_index}_b{slot.slot_index}",
                )
                assignment[(cohort_index, slot.key)] = variable
                assignment_slot_keys_by_cohort[cohort_index].append(slot.key)
                cohort_variables.append(variable)
                model.Add(variable <= cohort_size * active[slot.key])
        model.Add(_sum(cohort_variables) == cohort_size)

    occupancy: dict[tuple[str, int], cp_model.IntVar] = {}
    for slot in slots:
        assigned = [
            variable
            for (cohort_index, slot_key), variable in assignment.items()
            if slot_key == slot.key
        ]
        count = model.NewIntVar(0, data.bus.capacity, f"occupancy_{slot.destination_index}_{slot.slot_index}")
        model.Add(count == _sum(assigned))
        model.Add(count <= data.bus.capacity * active[slot.key])
        model.Add(count >= active[slot.key])
        occupancy[slot.key] = count

    for destination_slots in slots_by_destination.values():
        for previous, current in zip(destination_slots, destination_slots[1:]):
            model.Add(active[previous.key] >= active[current.key])
            model.Add(occupancy[previous.key] >= occupancy[current.key])

    total_buses = _sum(active.values())
    second_choice_variables = [
        variable
        for (cohort_index, slot_key), variable in assignment.items()
        if slot_key[0] == cohorts[cohort_index][0][3]
    ]
    model.Add(total_buses == optimal_total_buses)
    model.Add(_sum(second_choice_variables) == optimal_second_choices)
    for destination_slots in slots_by_destination.values():
        model.Add(
            _sum(occupancy[slot.key] for slot in destination_slots)
            >= (
                data.bus.capacity
                * _sum(active[slot.key] for slot in destination_slots)
                - maximum_unused_seats
            )
        )

    _add_detailed_solution_hints(
        model,
        cohorts=cohorts,
        slots_by_destination=slots_by_destination,
        assignment=assignment,
        active=active,
        primary_assignment_counts=primary_assignment_counts,
        primary_bus_counts=primary_bus_counts,
        capacity=data.bus.capacity,
    )
    if initial_result is not None:
        _add_result_solution_hints(
            model,
            result=initial_result,
            passengers=passengers,
            cohorts=cohorts,
            slots_by_destination=slots_by_destination,
            assignment=assignment,
            active=active,
        )
    _complete_solution_hints(model, cancellation_check)
    def solve_secondary(
        name: str,
        expression: cp_model.LinearExpr,
        *,
        search_workers: int | None = None,
    ) -> cp_model.CpSolver:
        return _solve_phase(
            model=model,
            expression=expression if detailed_balance else 0,
            name=name,
            objectives=objectives,
            progress=progress,
            cancellation_check=cancellation_check,
            search_workers=search_workers,
            max_time_seconds=_secondary_phase_seconds(),
        )

    def solve_or_skip(
        name: str,
        expression: cp_model.LinearExpr,
        *,
        primary_secondary_phase: bool = False,
    ) -> cp_model.CpSolver | None:
        if name in skipped_detailed_phases:
            if progress:
                progress(name, None)
            return None
        if primary_secondary_phase:
            return _solve_phase(
                model=model,
                expression=expression,
                name=name,
                objectives=objectives,
                progress=progress,
                cancellation_check=cancellation_check,
            )
        return solve_secondary(name, expression)

    def add_group_metrics(
        group_name: str,
        group_values: tuple[str, ...],
        member_sizes: tuple[int, ...],
        *,
        include_isolated: bool,
        include_odd: bool,
    ) -> tuple[
        cp_model.LinearExpr,
        cp_model.LinearExpr,
        cp_model.LinearExpr,
        cp_model.LinearExpr,
    ]:
        use_variables = []
        imbalances = []
        isolated_variables = []
        odd_variables = []
        members_by_group: dict[str, list[int]] = defaultdict(list)
        for index, group in enumerate(group_values):
            members_by_group[group].append(index)

        for group_index, (group, member_indexes) in enumerate(
            sorted(members_by_group.items())
        ):
            group_size = sum(member_sizes[index] for index in member_indexes)
            maximum_count_per_bus = min(group_size, data.bus.capacity)
            group_counts = []
            group_uses = []
            possible_slot_keys = {
                slot_key
                for member_index in member_indexes
                for slot_key in assignment_slot_keys_by_cohort[member_index]
            }
            for slot_number, slot in enumerate(slots):
                if slot.key not in possible_slot_keys:
                    continue
                variables = [
                    assignment[(member_index, slot.key)]
                    for member_index in member_indexes
                    if (member_index, slot.key) in assignment
                ]
                count = model.NewIntVar(
                    0,
                    maximum_count_per_bus,
                    f"{group_name}_count_g{group_index}_b{slot_number}",
                )
                model.Add(count == _sum(variables))
                used = model.NewBoolVar(
                    f"{group_name}_used_g{group_index}_b{slot_number}"
                )
                model.Add(count >= used)
                model.Add(count <= maximum_count_per_bus * used)
                use_variables.append(used)
                group_counts.append(count)
                group_uses.append(used)

                if include_isolated:
                    one = model.NewBoolVar(
                        f"{group_name}_one_g{group_index}_b{slot_number}"
                    )
                    two = model.NewBoolVar(
                        f"{group_name}_two_g{group_index}_b{slot_number}"
                    )
                    model.Add(count == 1).OnlyEnforceIf(one)
                    model.Add(count != 1).OnlyEnforceIf(one.Not())
                    model.Add(count == 2).OnlyEnforceIf(two)
                    model.Add(count != 2).OnlyEnforceIf(two.Not())
                    isolated_variables.extend((one, two))

                if include_odd:
                    remainder = model.NewIntVar(
                        0, 1, f"{group_name}_odd_g{group_index}_b{slot_number}"
                    )
                    model.AddModuloEquality(remainder, count, 2)
                    odd_variables.append(remainder)

            model.Add(
                _sum(group_uses) >= ceil(group_size / data.bus.capacity)
            )
            maximum = model.NewIntVar(
                0,
                maximum_count_per_bus,
                f"{group_name}_max_g{group_index}",
            )
            minimum = model.NewIntVar(
                0,
                maximum_count_per_bus,
                f"{group_name}_min_g{group_index}",
            )
            for count, used in zip(group_counts, group_uses):
                model.Add(maximum >= count)
                model.Add(
                    minimum
                    <= count + maximum_count_per_bus * (1 - used)
                )
            imbalance = model.NewIntVar(
                0,
                maximum_count_per_bus,
                f"{group_name}_imbalance_g{group_index}",
            )
            model.Add(imbalance == maximum - minimum)
            imbalances.append(imbalance)

        return (
            _sum(use_variables),
            _sum(imbalances),
            _sum(isolated_variables),
            _sum(odd_variables),
        )

    campus_metrics = add_group_metrics(
        "campus",
        tuple(cohort[0] for cohort, _ in cohorts),
        cohort_sizes,
        include_isolated=True,
        include_odd=True,
    )
    for name, expression in zip(
        (
            "campus_bus_uses",
            "campus_distribution_imbalance",
            "campus_isolated_groups",
            "campus_odd_groups",
        ),
        campus_metrics,
    ):
        try:
            next_solver = solve_or_skip(
                name,
                expression,
                primary_secondary_phase=name == "campus_bus_uses",
            )
            if next_solver is not None:
                solver = next_solver
        except PhaseSolveError as error:
            return AllocationResult(status="FAILED", error_message=str(error))

    campus_values = tuple(cohort[0] for cohort, _ in cohorts)
    team_values = tuple(
        f"{cohort[0]}\0{cohort[1]}" for cohort, _ in cohorts
    )
    if len(set(campus_values)) == len(set(team_values)):
        objective_values = {objective.name: objective.value for objective in objectives}
        for team_name, campus_name in (
            ("team_bus_uses", "campus_bus_uses"),
            ("team_distribution_imbalance", "campus_distribution_imbalance"),
        ):
            if team_name in skipped_detailed_phases or campus_name not in objective_values:
                if progress:
                    progress(team_name, None)
            else:
                value = objective_values[campus_name]
                objectives.append(ObjectiveValue(name=team_name, value=value))
                if progress:
                    progress(team_name, value)
    else:
        team_metrics = add_group_metrics(
            "team",
            team_values,
            cohort_sizes,
            include_isolated=False,
            include_odd=False,
        )
        for name, expression in zip(
            ("team_bus_uses", "team_distribution_imbalance"),
            team_metrics[:2],
        ):
            next_solver = solve_or_skip(name, expression)
            if next_solver is not None:
                solver = next_solver

    destination_imbalances = []
    for destination, destination_slots in sorted(slots_by_destination.items()):
        maximum = model.NewIntVar(
            0, data.bus.capacity, f"destination_max_{destination_index[destination]}"
        )
        minimum = model.NewIntVar(
            0, data.bus.capacity, f"destination_min_{destination_index[destination]}"
        )
        for slot in destination_slots:
            model.Add(maximum >= occupancy[slot.key])
            model.Add(
                minimum
                <= occupancy[slot.key]
                + data.bus.capacity * (1 - active[slot.key])
            )
        imbalance = model.NewIntVar(
            0,
            data.bus.capacity,
            f"destination_imbalance_{destination_index[destination]}",
        )
        model.Add(imbalance == maximum - minimum)
        destination_imbalances.append(imbalance)
    next_solver = solve_or_skip(
        "destination_occupancy_imbalance",
        _sum(destination_imbalances),
    )
    if next_solver is not None:
        solver = next_solver

    deterministic_terms = []
    for (cohort_index, slot_key), variable in assignment.items():
        slot_order = slot_order_by_key[slot_key]
        deterministic_terms.append(
            variable * ((cohort_index + 1) * (slot_order + 1))
        )
    model.ClearHints()
    solver = solve_secondary(
        "deterministic_tie_break",
        _sum(deterministic_terms),
        search_workers=1,
    )

    selected_slots = [slot for slot in slots if solver.Value(active[slot.key]) == 1]
    bus_id_by_slot = {
        slot.key: f"bus-{index + 1:03d}" for index, slot in enumerate(selected_slots)
    }
    passenger_indexes_by_slot: dict[tuple[str, int], list[int]] = defaultdict(list)
    remaining_passenger_indexes_by_cohort = {
        cohort_index: list(passenger_indexes)
        for cohort_index, (_, passenger_indexes) in enumerate(cohorts)
    }
    for (cohort_index, slot_key), variable in sorted(
        assignment.items(),
        key=lambda item: (item[0][0], slot_order_by_key[item[0][1]]),
    ):
        assigned_count = solver.Value(variable)
        if assigned_count <= 0:
            continue
        cohort_passenger_indexes = remaining_passenger_indexes_by_cohort[cohort_index]
        passenger_indexes_by_slot[slot_key].extend(
            cohort_passenger_indexes[:assigned_count]
        )
        del cohort_passenger_indexes[:assigned_count]

    buses: list[AllocationBus] = []
    assignments: list[PassengerAssignment] = []
    for bus_index, slot in enumerate(selected_slots):
        passenger_indexes = sorted(
            passenger_indexes_by_slot[slot.key],
            key=lambda index: (
                passengers[index].campus,
                passengers[index].team,
                passengers[index].reservation_id,
            ),
        )
        passenger_ids = tuple(
            passengers[index].reservation_id for index in passenger_indexes
        )
        bus_id = bus_id_by_slot[slot.key]
        buses.append(
            AllocationBus(
                bus_id=bus_id,
                label=f"{bus_index + 1}호차",
                destination=slot.destination,
                capacity=data.bus.capacity,
                price=data.bus.price,
                passenger_ids=passenger_ids,
            )
        )
        for seat_number, passenger_index in enumerate(passenger_indexes, start=1):
            passenger = passengers[passenger_index]
            assignments.append(
                PassengerAssignment(
                    reservation_id=passenger.reservation_id,
                    bus_id=bus_id,
                    destination=slot.destination,
                    preference_rank=(
                        1 if slot.destination == passenger.first_choice else 2
                    ),
                    seat_number=seat_number,
                )
            )

    warnings: list[AllocationWarning] = []
    first_choice_demand: dict[str, list[str]] = defaultdict(list)
    for passenger in passengers:
        first_choice_demand[passenger.first_choice].append(passenger.reservation_id)
    active_destinations = {bus.destination for bus in buses}
    for destination, passenger_ids in sorted(first_choice_demand.items()):
        if destination not in active_destinations:
            warnings.append(
                AllocationWarning(
                    code="FIRST_CHOICE_DESTINATION_REMOVED",
                    destination=destination,
                    passenger_ids=tuple(sorted(passenger_ids)),
                    message=(
                        f"{destination} 1지망 운행이 제외되어 "
                        f"{len(passenger_ids)}명이 2지망에 배차되었습니다."
                    ),
                )
            )
    for bus in buses:
        if len(bus.passenger_ids) < data.bus.recommended_minimum_passengers:
            warnings.append(
                AllocationWarning(
                    code="BELOW_RECOMMENDED_MINIMUM",
                    destination=bus.destination,
                    passenger_ids=bus.passenger_ids,
                    message=(
                        f"{bus.label} 탑승 인원이 권장 최소 "
                        f"{data.bus.recommended_minimum_passengers}명보다 적습니다."
                    ),
                )
            )

    result = AllocationResult(
        status="OPTIMAL",
        total_buses=len(buses),
        total_cost=len(buses) * data.bus.price,
        second_choice_count=sum(
            assignment.preference_rank == 2 for assignment in assignments
        ),
        buses=tuple(buses),
        assignments=tuple(sorted(assignments, key=lambda item: item.reservation_id)),
        objectives=tuple(objectives),
        warnings=tuple(warnings),
    )
    result_errors = validate_result(data, result)
    if result_errors:
        return AllocationResult(
            status="FAILED",
            error_message=" ".join(result_errors),
            diagnostics={"invalid_result": result},
        )
    return result
