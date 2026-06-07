from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .schema import (
    AllocationResult,
    BusConfiguration,
    OptimizationInput,
    Passenger,
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
        ),
    )


def result_to_dict(result: AllocationResult) -> dict[str, Any]:
    return asdict(result)

