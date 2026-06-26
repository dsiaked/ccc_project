from __future__ import annotations

import unittest
from dataclasses import replace

from exact_optimizer import BusConfiguration, OptimizationInput, Passenger
from exact_optimizer.schema import AllocationBus, AllocationResult, PassengerAssignment
from exact_optimizer.validation import validate_input, validate_result


def passenger(
    reservation_id: str,
    first_choice: str = "A",
    second_choice: str = "B",
) -> Passenger:
    return Passenger(
        reservation_id=reservation_id,
        campus="Campus",
        team="Team",
        first_choice=first_choice,
        second_choice=second_choice,
    )


def valid_input() -> OptimizationInput:
    return OptimizationInput(
        passengers=(passenger("p1"), passenger("p2")),
        bus=BusConfiguration(
            capacity=2,
            price=100,
            recommended_minimum_passengers=1,
            maximum_buses=1,
        ),
    )


def valid_result() -> AllocationResult:
    return AllocationResult(
        status="OPTIMAL",
        total_buses=1,
        total_cost=100,
        second_choice_count=0,
        buses=(
            AllocationBus(
                bus_id="bus-1",
                label="Bus 1",
                destination="A",
                capacity=2,
                price=100,
                passenger_ids=("p1", "p2"),
            ),
        ),
        assignments=(
            PassengerAssignment("p1", "bus-1", "A", 1, 1),
            PassengerAssignment("p2", "bus-1", "A", 1, 2),
        ),
    )


class InputValidationTests(unittest.TestCase):
    def test_reports_all_independent_input_failures(self) -> None:
        data = OptimizationInput(
            passengers=(
                Passenger("", "", "", "", ""),
                passenger("duplicate"),
                passenger("duplicate", "A", "A"),
            ),
            bus=BusConfiguration(
                capacity=0,
                price=-1,
                recommended_minimum_passengers=0,
                maximum_buses=0,
            ),
        )

        errors = validate_input(data)

        self.assertIn("Bus capacity must be positive.", errors)
        self.assertIn("Bus price cannot be negative.", errors)
        self.assertIn("Recommended minimum passengers must be positive.", errors)
        self.assertIn("Maximum bus count must be positive.", errors)
        self.assertIn("Duplicate reservation IDs: duplicate", errors)
        self.assertIn("Every passenger needs a reservation ID.", errors)
        self.assertIn(": campus is required.", errors)
        self.assertIn(": team is required.", errors)
        self.assertIn(": first and second choices are required.", errors)

    def test_allows_single_destination_passengers(self) -> None:
        data = OptimizationInput(
            passengers=(passenger("remaining-seat", "A", "A"),),
            bus=BusConfiguration(
                capacity=1,
                price=100,
                recommended_minimum_passengers=1,
            ),
        )

        self.assertEqual(validate_input(data), [])


class ResultValidationTests(unittest.TestCase):
    def test_accepts_a_complete_valid_result(self) -> None:
        self.assertEqual(validate_result(valid_input(), valid_result()), [])

    def test_rejects_missing_duplicate_and_unknown_assignments(self) -> None:
        result = replace(
            valid_result(),
            assignments=(
                PassengerAssignment("p1", "missing-bus", "A", 1, 1),
                PassengerAssignment("p1", "missing-bus", "A", 1, 2),
            ),
        )

        errors = validate_result(valid_input(), result)

        self.assertIn(
            "Assignments do not match the optimization passenger snapshot.", errors
        )
        self.assertIn("Every passenger must appear exactly once.", errors)
        self.assertIn("Assignment references an unknown passenger or bus.", errors)

    def test_rejects_destination_rank_and_second_choice_mismatches(self) -> None:
        result = replace(
            valid_result(),
            second_choice_count=0,
            assignments=(
                PassengerAssignment("p1", "bus-1", "B", 1, 1),
                PassengerAssignment("p2", "bus-1", "C", 1, 2),
            ),
        )

        errors = validate_result(valid_input(), result)

        self.assertIn("Assignment destination does not match its bus destination.", errors)
        self.assertIn("p1: reported preference rank is invalid.", errors)
        self.assertIn("p2: assignment is outside preferences.", errors)
        self.assertIn("Reported second-choice count is invalid.", errors)

    def test_rejects_bus_totals_passenger_lists_and_noncontiguous_seats(self) -> None:
        result = replace(
            valid_result(),
            total_buses=2,
            total_cost=999,
            buses=(
                replace(
                    valid_result().buses[0],
                    passenger_ids=("p1",),
                ),
            ),
            assignments=(
                PassengerAssignment("p1", "bus-1", "A", 1, 1),
                PassengerAssignment("p2", "bus-1", "A", 1, 3),
            ),
        )

        errors = validate_result(valid_input(), result)

        self.assertIn("Reported total bus count does not match physical buses.", errors)
        self.assertIn("Reported total bus count exceeds the configured maximum.", errors)
        self.assertIn("Reported total cost does not match bus count and price.", errors)
        self.assertIn("bus-1: passenger list does not match assignments.", errors)
        self.assertIn("bus-1: seat numbers must be contiguous and unique.", errors)

    def test_rejects_non_optimal_results(self) -> None:
        errors = validate_result(
            valid_input(),
            AllocationResult(status="FAILED"),
        )

        self.assertEqual(
            errors,
            ["Only OPTIMAL results can be validated for draft creation."],
        )


if __name__ == "__main__":
    unittest.main()
