from __future__ import annotations

import unittest
from unittest.mock import patch

from exact_optimizer.worker import (
    SupabaseRepository,
    build_supabase_headers,
    normalize_service_role_key,
    run_job,
)


class FakeRepository:
    def __init__(self) -> None:
        self.status = "PENDING"
        self.job = {
            "input_hash": "same-input",
            "optimization_scope": "BASELINE",
            "detailed_settings": {},
            "resume_from_job_id": None,
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
        self.cancel_before_completion = False
        self.reusable_job: dict[str, object] | None = None

    def claim_job(
        self, job_id: str, worker_id: str, execution_mode: str | None = None
    ) -> dict[str, object]:
        self.status = "RUNNING"
        return self.job

    def get_job_status(self, job_id: str) -> str:
        return self.status

    def get_reusable_optimal_job(
        self,
        job_id: str,
        input_hash: str,
        input_snapshot: dict[str, object],
        optimization_scope: str,
        detailed_settings: dict[str, object],
    ) -> dict[str, object] | None:
        if (
            self.reusable_job is not None
            and self.reusable_job.get("input_snapshot") != input_snapshot
        ):
            return None
        return self.reusable_job

    def get_job_result(self, job_id: str) -> dict[str, object] | None:
        return None

    def update_job(
        self,
        job_id: str,
        values: dict[str, object],
        *,
        expected_status: str | None = None,
    ) -> bool:
        if (
            self.cancel_before_completion
            and expected_status == "RUNNING"
            and values.get("status") == "OPTIMAL"
        ):
            self.status = "CANCELLED"
        if expected_status is not None and self.status != expected_status:
            return False
        self.updates.append(values)
        if "status" in values:
            self.status = str(values["status"])
        return True

    def add_event(
        self, job_id: str, event_type: str, detail: dict[str, object] | None = None
    ) -> None:
        self.events.append(event_type)

    def get_pending_job_ids(
        self, limit: int = 1, execution_mode: str = "local"
    ) -> list[str]:
        return ["job-1"] if self.status == "PENDING" else []


class WorkerTests(unittest.TestCase):
    def test_normalizes_service_role_env_assignment(self) -> None:
        key = "sb_secret_example"

        self.assertEqual(
            normalize_service_role_key(f'SUPABASE_SERVICE_ROLE_KEY="{key}"'),
            key,
        )

    def test_removes_clipboard_whitespace_and_zero_width_characters(self) -> None:
        key = "sb_secret_example"

        self.assertEqual(
            normalize_service_role_key("  sb_secret_\u200bexam\r\nple  "),
            key,
        )

    def test_rejects_publishable_key(self) -> None:
        with self.assertRaisesRegex(ValueError, "publishable"):
            normalize_service_role_key("sb_publishable_example")

    def test_uses_bearer_header_for_legacy_jwt_service_role_key(self) -> None:
        key = (
            "eyJhbGciOiJIUzI1NiJ9."
            "eyJyb2xlIjoic2VydmljZV9yb2xlIn0."
            "signature"
        )

        headers = build_supabase_headers(key)

        self.assertEqual(headers["apikey"], key)
        self.assertEqual(headers["Authorization"], f"Bearer {key}")

    def test_does_not_use_secret_api_key_as_bearer_token(self) -> None:
        key = "sb_secret_example"

        headers = build_supabase_headers(key)

        self.assertEqual(headers["apikey"], key)
        self.assertNotIn("Authorization", headers)

    def test_lists_pending_jobs(self) -> None:
        repository = FakeRepository()

        self.assertEqual(repository.get_pending_job_ids(), ["job-1"])

    def test_local_pending_query_filters_execution_mode(self) -> None:
        repository = SupabaseRepository("https://example.supabase.co", "sb_secret_test")

        with patch.object(repository, "_request", return_value=[]) as request:
            repository.get_pending_job_ids(execution_mode="local")

        self.assertIn("execution_mode=eq.local", request.call_args.args[1])

    def test_cloud_claim_filters_execution_mode(self) -> None:
        repository = SupabaseRepository("https://example.supabase.co", "sb_secret_test")

        with patch.object(repository, "_request", return_value=[]) as request:
            repository.claim_job("job-1", "worker-1", "cloud")

        self.assertIn("execution_mode=eq.cloud", request.call_args.args[1])

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

    def test_reuses_previous_optimal_result_for_unchanged_input(self) -> None:
        repository = FakeRepository()
        repository.reusable_job = {
            "id": "job-previous",
            "input_snapshot": repository.job["input_snapshot"],
            "result": {
                "status": "OPTIMAL",
                "total_buses": 1,
                "total_cost": 100,
                "second_choice_count": 0,
                "buses": [],
                "assignments": [],
                "warnings": [],
                "objectives": [],
            },
            "diagnostics": None,
            "best_known_bus_count": 1,
            "proven_bus_count": 1,
        }

        with patch("exact_optimizer.worker.optimize") as optimize:
            exit_code = run_job(repository, "job-1", "worker-1")  # type: ignore[arg-type]

        self.assertEqual(exit_code, 0)
        optimize.assert_not_called()
        self.assertEqual(repository.status, "OPTIMAL")
        self.assertIn("JOB_RESULT_REUSED", repository.events)
        self.assertNotIn("JOB_OPTIMAL", repository.events)
        self.assertEqual(repository.updates[-1]["result"], repository.reusable_job["result"])

    def test_recalculates_when_reservation_snapshot_changed(self) -> None:
        repository = FakeRepository()
        repository.reusable_job = {
            "id": "job-previous",
            "input_snapshot": {"passengers": []},
            "result": {"status": "OPTIMAL"},
        }

        exit_code = run_job(repository, "job-1", "worker-1")  # type: ignore[arg-type]

        self.assertEqual(exit_code, 0)
        self.assertIn("JOB_OPTIMAL", repository.events)
        self.assertNotIn("JOB_RESULT_REUSED", repository.events)

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
        self.assertNotIn("JOB_OPTIMAL", repository.events)

    def test_does_not_overwrite_cancelled_job_at_completion(self) -> None:
        repository = FakeRepository()
        repository.cancel_before_completion = True

        exit_code = run_job(repository, "job-1", "worker-1")  # type: ignore[arg-type]

        self.assertEqual(exit_code, 0)
        self.assertEqual(repository.status, "CANCELLED")
        self.assertNotIn("JOB_OPTIMAL", repository.events)


if __name__ == "__main__":
    unittest.main()
