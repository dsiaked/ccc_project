from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .schema import (
    AllocationBus,
    AllocationResult,
    AllocationWarning,
    BusConfiguration,
    ObjectiveValue,
    OptimizationInput,
    Passenger,
    PassengerAssignment,
)


def input_from_snapshot(snapshot: dict[str, Any]) -> OptimizationInput:
    if snapshot.get("schema_version") != 1:
        raise ValueError("Unsupported optimization input schema version.")
    bus = snapshot.get("bus")
    passengers = snapshot.get("passengers")
    if not isinstance(bus, dict) or not isinstance(passengers, list):
        raise ValueError("Optimization input snapshot is malformed.")

    return OptimizationInput(
        passengers=tuple(
            Passenger(
                reservation_id=str(item["reservation_id"]),
                campus=str(item["campus"]),
                team=str(item["team"]),
                first_choice=str(item["first_choice"]),
                second_choice=str(item["second_choice"]),
            )
            for item in passengers
        ),
        bus=BusConfiguration(
            capacity=int(bus["capacity"]),
            price=int(bus["price"]),
            recommended_minimum_passengers=int(
                bus["recommended_minimum_passengers"]
            ),
            maximum_buses=(
                int(bus["maximum_buses"])
                if bus.get("maximum_buses") is not None
                else None
            ),
        ),
    )


def result_to_dict(result: AllocationResult) -> dict[str, Any]:
    return asdict(result)


def result_from_dict(value: dict[str, Any] | None) -> AllocationResult | None:
    if not isinstance(value, dict) or value.get("status") != "OPTIMAL":
        return None
    return AllocationResult(
        status="OPTIMAL",
        total_buses=int(value.get("total_buses", 0)),
        total_cost=int(value.get("total_cost", 0)),
        second_choice_count=int(value.get("second_choice_count", 0)),
        buses=tuple(AllocationBus(**item) for item in value.get("buses", [])),
        assignments=tuple(
            PassengerAssignment(**item) for item in value.get("assignments", [])
        ),
        objectives=tuple(
            ObjectiveValue(**item) for item in value.get("objectives", [])
        ),
        warnings=tuple(
            AllocationWarning(**item) for item in value.get("warnings", [])
        ),
        diagnostics=dict(value.get("diagnostics") or {}),
    )
