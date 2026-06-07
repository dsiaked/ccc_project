from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


OptimizationStatus = Literal["OPTIMAL", "INFEASIBLE", "FAILED"]


@dataclass(frozen=True)
class Passenger:
    reservation_id: str
    campus: str
    team: str
    first_choice: str
    second_choice: str


@dataclass(frozen=True)
class BusConfiguration:
    capacity: int
    price: int
    recommended_minimum_passengers: int = 36


@dataclass(frozen=True)
class OptimizationInput:
    passengers: tuple[Passenger, ...]
    bus: BusConfiguration


@dataclass(frozen=True)
class PassengerAssignment:
    reservation_id: str
    bus_id: str
    destination: str
    preference_rank: int
    seat_number: int


@dataclass(frozen=True)
class AllocationBus:
    bus_id: str
    label: str
    destination: str
    capacity: int
    price: int
    passenger_ids: tuple[str, ...]


@dataclass(frozen=True)
class ObjectiveValue:
    name: str
    value: int


@dataclass(frozen=True)
class AllocationWarning:
    code: str
    message: str
    destination: str | None = None
    passenger_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class AllocationResult:
    status: OptimizationStatus
    total_buses: int = 0
    total_cost: int = 0
    second_choice_count: int = 0
    buses: tuple[AllocationBus, ...] = ()
    assignments: tuple[PassengerAssignment, ...] = ()
    objectives: tuple[ObjectiveValue, ...] = ()
    warnings: tuple[AllocationWarning, ...] = ()
    error_message: str | None = None
    diagnostics: dict[str, object] = field(default_factory=dict)

