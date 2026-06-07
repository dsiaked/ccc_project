from __future__ import annotations

import unittest

from exact_optimizer.worker import run_job


class FakeRepository:
    def __init__(self) -> None:
        self.status = "PENDING"
        self.job = {
            "input_snapshot": {
                "schema_version": 1,
                "bus": {
                    "capacity": 3,
                    "price": 100,
                    "recommended_minimum_passengers": 2,
                },
                "passengers": [
                    {
                        "reservation_id": "p1",
                        "campus": "Campus",
                        "team": "Team",
                        "first_choice": "A",
                        "second_choice": "B",
                    },
                    {
                        "reservation_id": "p2",
                        "campus": "Campus",
                        "team": "Team",
                        "first_choice": "A",
                        "second_choice": "B",
                    },
                ],
            }
        }
        self.updates: list[dict[str, object]] = []
        self.events: list[str] = []

    def claim_job(self, job_id: str, worker_id: str) -> dict[str, object]:
        self.status = "RUNNING"
        return self.job

    def get_job_status(self, job_id: str) -> str:
        return self.status

    def update_job(self, job_id: str, values: dict[str, object]) -> None:
        self.updates.append(values)
        if "status" in values:
            self.status = str(values["status"])

    def add_event(
        self, job_id: str, event_type: str, detail: dict[str, object] | None = None
    ) -> None:
        self.events.append(event_type)

    def get_pending_job_ids(self, limit: int = 1) -> list[str]:
        return ["job-1"] if self.status == "PENDING" else []


class WorkerTests(unittest.TestCase):
    def test_lists_pending_jobs(self) -> None:
        repository = FakeRepository()

        self.assertEqual(repository.get_pending_job_ids(), ["job-1"])

    def test_completes_optimal_job(self) -> None:
        repository = FakeRepository()

        exit_code = run_job(repository, "job-1", "worker-1")  # type: ignore[arg-type]

        self.assertEqual(exit_code, 0)
        self.assertEqual(repository.status, "OPTIMAL")
        self.assertIn("JOB_OPTIMAL", repository.events)
        self.assertTrue(
            any(update.get("proven_bus_count") == 1 for update in repository.updates)
        )
        self.assertEqual(
            [
                update.get("current_phase")
                for update in repository.updates
                if "current_phase" in update
            ],
            ["total_buses", "second_choice_passengers", "completed"],
        )

    def test_runs_detailed_phases_only_for_detailed_job(self) -> None:
        repository = FakeRepository()
        repository.job["optimization_scope"] = "DETAILED"

        exit_code = run_job(repository, "job-1", "worker-1")  # type: ignore[arg-type]

        self.assertEqual(exit_code, 0)
        phases = [
            update.get("current_phase")
            for update in repository.updates
            if "current_phase" in update
        ]
        self.assertIn("campus_bus_uses", phases)
        self.assertIn("team_bus_uses", phases)
        self.assertEqual(phases[-1], "completed")

    def test_cancels_during_solver_work(self) -> None:
        repository = FakeRepository()
        original_claim = repository.claim_job

        def claim_and_cancel(job_id: str, worker_id: str) -> dict[str, object]:
            job = original_claim(job_id, worker_id)
            repository.status = "CANCEL_REQUESTED"
            return job

        repository.claim_job = claim_and_cancel  # type: ignore[method-assign]

        exit_code = run_job(repository, "job-1", "worker-1")  # type: ignore[arg-type]

        self.assertEqual(exit_code, 0)
        self.assertEqual(repository.status, "CANCELLED")
        self.assertIn("JOB_CANCELLED", repository.events)

    def test_treats_immediate_cancelled_status_as_solver_cancellation(self) -> None:
        repository = FakeRepository()
        original_claim = repository.claim_job

        def claim_and_cancel(job_id: str, worker_id: str) -> dict[str, object]:
            job = original_claim(job_id, worker_id)
            repository.status = "CANCELLED"
            return job

        repository.claim_job = claim_and_cancel  # type: ignore[method-assign]

        exit_code = run_job(repository, "job-1", "worker-1")  # type: ignore[arg-type]

        self.assertEqual(exit_code, 0)
        self.assertEqual(repository.status, "CANCELLED")
        self.assertIn("JOB_CANCELLED", repository.events)


if __name__ == "__main__":
    unittest.main()
