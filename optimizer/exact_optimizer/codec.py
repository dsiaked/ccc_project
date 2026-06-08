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


def _required_string(item: dict[str, Any], field: str, index: int) -> str:
    value = item.get(field)
    if not isinstance(value, str):
        raise ValueError(f"Passenger {index} field {field} must be a string.")
    return value


def input_from_snapshot(snapshot: dict[str, Any]) -> OptimizationInput:
    if snapshot.get("schema_version") != 1:
        raise ValueError("Unsupported optimization input schema version.")
    bus = snapshot.get("bus")
    passengers = snapshot.get("passengers")
    if not isinstance(bus, dict) or not isinstance(passengers, list):
        raise ValueError("Optimization input snapshot is malformed.")

    parsed_passengers = []
    for index, item in enumerate(passengers):
        if not isinstance(item, dict):
            raise ValueError(f"Passenger {index} must be an object.")
        parsed_passengers.append(
            Passenger(
                reservation_id=_required_string(item, "reservation_id", index),
                campus=_required_string(item, "campus", index),
                team=_required_string(item, "team", index),
                first_choice=_required_string(item, "first_choice", index),
                second_choice=_required_string(item, "second_choice", index),
            )
        )

    return OptimizationInput(
        passengers=tuple(parsed_passengers),
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
    try:
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
    except (TypeError, ValueError):
        return None
