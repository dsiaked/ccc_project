from __future__ import annotations

import unittest

from exact_optimizer.codec import input_from_snapshot, result_from_dict, result_to_dict
from exact_optimizer.schema import AllocationResult


class CodecTests(unittest.TestCase):
    def test_reads_anonymized_snapshot(self) -> None:
        result = input_from_snapshot(
            {
                "schema_version": 1,
                "bus": {
                    "capacity": 45,
                    "price": 900000,
                    "recommended_minimum_passengers": 36,
                    "maximum_buses": 12,
                },
                "passengers": [
                    {
                        "reservation_id": "reservation-1",
                        "campus": "Campus",
                        "team": "Team",
                        "first_choice": "A",
                        "second_choice": "B",
                    }
                ],
            }
        )

        self.assertEqual(result.bus.capacity, 45)
        self.assertEqual(result.bus.maximum_buses, 12)
        self.assertEqual(result.passengers[0].reservation_id, "reservation-1")

    def test_reads_legacy_snapshot_without_maximum_bus_count(self) -> None:
        result = input_from_snapshot(
            {
                "schema_version": 1,
                "bus": {
                    "capacity": 45,
                    "price": 900000,
                    "recommended_minimum_passengers": 36,
                },
                "passengers": [],
            }
        )

        self.assertIsNone(result.bus.maximum_buses)

    def test_serializes_result(self) -> None:
        self.assertEqual(result_to_dict(AllocationResult(status="OPTIMAL"))["status"], "OPTIMAL")

    def test_rejects_non_string_passenger_fields(self) -> None:
        snapshot = {
            "schema_version": 1,
            "bus": {
                "capacity": 45,
                "price": 900000,
                "recommended_minimum_passengers": 36,
            },
            "passengers": [
                {
                    "reservation_id": "reservation-1",
                    "campus": None,
                    "team": "Team",
                    "first_choice": "A",
                    "second_choice": "B",
                }
            ],
        }

        with self.assertRaisesRegex(ValueError, "campus must be a string"):
            input_from_snapshot(snapshot)

    def test_rejects_non_integer_bus_fields(self) -> None:
        for field, value in (
            ("capacity", 45.5),
            ("price", "900000"),
            ("recommended_minimum_passengers", True),
            ("maximum_buses", "12"),
        ):
            with self.subTest(field=field):
                bus = {
                    "capacity": 45,
                    "price": 900000,
                    "recommended_minimum_passengers": 36,
                    "maximum_buses": 12,
                }
                bus[field] = value

                with self.assertRaisesRegex(ValueError, f"{field} must be an integer"):
                    input_from_snapshot(
                        {
                            "schema_version": 1,
                            "bus": bus,
                            "passengers": [],
                        }
                    )

    def test_ignores_malformed_optional_result_payload(self) -> None:
        result = result_from_dict(
            {
                "status": "OPTIMAL",
                "buses": [{"bus_id": "bus-001"}],
            }
        )

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
