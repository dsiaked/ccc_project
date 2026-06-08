from __future__ import annotations

import unittest

from exact_optimizer.codec import input_from_snapshot, result_to_dict
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


if __name__ == "__main__":
    unittest.main()
