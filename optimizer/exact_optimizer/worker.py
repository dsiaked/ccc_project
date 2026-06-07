from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime
from typing import Any

from .codec import input_from_snapshot, result_to_dict
from .model import OptimizationCancelled, optimize


class JobCancelled(Exception):
    pass


class SupabaseRepository:
    def __init__(self, url: str, service_role_key: str) -> None:
        self.base_url = url.rstrip("/")
        self.service_role_key = service_role_key

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
        prefer: str | None = None,
    ) -> Any:
        payload = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=payload,
            method=method,
            headers={
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Content-Type": "application/json",
                **({"Prefer": prefer} if prefer else {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                content = response.read()
                return json.loads(content) if content else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Supabase request failed with HTTP {error.code}: {detail}"
            ) from error

    def claim_job(self, job_id: str, worker_id: str) -> dict[str, Any] | None:
        encoded_id = urllib.parse.quote(job_id)
        rows = self._request(
            "PATCH",
            (
                "/rest/v1/allocation_optimization_jobs"
                f"?id=eq.{encoded_id}&status=eq.PENDING"
            ),
            body={
                "status": "RUNNING",
                "started_at": now_iso(),
                "current_phase": "starting",
                "worker_id": worker_id,
            },
            prefer="return=representation",
        )
        return rows[0] if rows else None

    def get_job_status(self, job_id: str) -> str | None:
        encoded_id = urllib.parse.quote(job_id)
        rows = self._request(
            "GET",
            (
                "/rest/v1/allocation_optimization_jobs"
                f"?id=eq.{encoded_id}&select=status"
            ),
        )
        return rows[0]["status"] if rows else None

    def get_pending_job_ids(self, limit: int = 1) -> list[str]:
        rows = self._request(
            "GET",
            (
                "/rest/v1/allocation_optimization_jobs"
                "?status=eq.PENDING&select=id&order=requested_at.asc"
                f"&limit={max(1, limit)}"
            ),
        )
        return [str(row["id"]) for row in rows or []]

    def update_job(self, job_id: str, values: dict[str, Any]) -> None:
        encoded_id = urllib.parse.quote(job_id)
        self._request(
            "PATCH",
            f"/rest/v1/allocation_optimization_jobs?id=eq.{encoded_id}",
            body=values,
            prefer="return=minimal",
        )

    def add_event(
        self, job_id: str, event_type: str, detail: dict[str, Any] | None = None
    ) -> None:
        self._request(
            "POST",
            "/rest/v1/allocation_optimization_events",
            body={
                "job_id": job_id,
                "event_type": event_type,
                "detail": detail or {},
            },
            prefer="return=minimal",
        )


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


PHASE_PROGRESS = {
    "total_buses": 15,
    "second_choice_passengers": 30,
    "campus_bus_uses": 42,
    "campus_distribution_imbalance": 52,
    "campus_isolated_groups": 60,
    "campus_odd_groups": 67,
    "team_bus_uses": 74,
    "team_distribution_imbalance": 81,
    "destination_occupancy_imbalance": 88,
    "deterministic_tie_break": 95,
}


def run_job(repository: SupabaseRepository, job_id: str, worker_id: str) -> int:
    job = repository.claim_job(job_id, worker_id)
    if job is None:
        status = repository.get_job_status(job_id)
        if status == "CANCELLED":
            return 0
        raise RuntimeError("Optimization job is not pending or does not exist.")

    started = time.monotonic()
    last_heartbeat = 0.0
    repository.add_event(job_id, "WORKER_CLAIMED", {"worker_id": worker_id})

    def check_cancellation() -> bool:
        nonlocal last_heartbeat
        status = repository.get_job_status(job_id)
        elapsed = time.monotonic() - started
        if status == "RUNNING" and elapsed - last_heartbeat >= 1:
            repository.update_job(job_id, {"elapsed_seconds": round(elapsed)})
            last_heartbeat = elapsed
        return status in ("CANCEL_REQUESTED", "CANCELLED")

    def report_progress(phase: str, value: int | None) -> None:
        status = repository.get_job_status(job_id)
        if status in ("CANCEL_REQUESTED", "CANCELLED"):
            raise JobCancelled()
        if status != "RUNNING":
            raise RuntimeError(f"Optimization job entered unexpected status: {status}")

        values: dict[str, Any] = {
            "progress": PHASE_PROGRESS.get(phase, 0),
            "current_phase": phase,
            "elapsed_seconds": round(time.monotonic() - started),
        }
        if phase == "total_buses":
            values["best_known_bus_count"] = value
            values["proven_bus_count"] = value
        repository.update_job(job_id, values)
        repository.add_event(job_id, "PHASE_OPTIMAL", {"phase": phase, "value": value})

    try:
        optimization_input = input_from_snapshot(job["input_snapshot"])
        result = optimize(
            optimization_input,
            report_progress,
            check_cancellation,
            detailed_balance=job.get("optimization_scope") == "DETAILED",
        )
        if check_cancellation():
            raise JobCancelled()
        elapsed_seconds = round(time.monotonic() - started)
        result_payload = result_to_dict(result)

        if result.status == "OPTIMAL":
            repository.update_job(
                job_id,
                {
                    "status": "OPTIMAL",
                    "progress": 100,
                    "current_phase": "completed",
                    "elapsed_seconds": elapsed_seconds,
                    "best_known_bus_count": result.total_buses,
                    "proven_bus_count": result.total_buses,
                    "result": result_payload,
                    "completed_at": now_iso(),
                },
            )
            repository.add_event(
                job_id,
                "JOB_OPTIMAL",
                {
                    "total_buses": result.total_buses,
                    "second_choice_count": result.second_choice_count,
                    "elapsed_seconds": elapsed_seconds,
                },
            )
            return 0

        repository.update_job(
            job_id,
            {
                "status": result.status,
                "current_phase": "completed",
                "elapsed_seconds": elapsed_seconds,
                "diagnostics": result_payload.get("diagnostics"),
                "error_message": result.error_message,
                "completed_at": now_iso(),
            },
        )
        repository.add_event(
            job_id,
            f"JOB_{result.status}",
            {"elapsed_seconds": elapsed_seconds},
        )
        return 2
    except (JobCancelled, OptimizationCancelled):
        repository.update_job(
            job_id,
            {
                "status": "CANCELLED",
                "current_phase": "cancelled",
                "elapsed_seconds": round(time.monotonic() - started),
                "completed_at": now_iso(),
            },
        )
        repository.add_event(job_id, "JOB_CANCELLED")
        return 0
    except Exception as error:
        repository.update_job(
            job_id,
            {
                "status": "FAILED",
                "current_phase": "failed",
                "elapsed_seconds": round(time.monotonic() - started),
                "error_message": str(error),
                "completed_at": now_iso(),
            },
        )
        repository.add_event(job_id, "JOB_FAILED", {"message": str(error)})
        raise


def main() -> int:
    required = {
        "SUPABASE_URL": os.environ.get("SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
        "ALLOCATION_OPTIMIZATION_JOB_ID": os.environ.get(
            "ALLOCATION_OPTIMIZATION_JOB_ID"
        ),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

    worker_id = os.environ.get("WORKER_ID") or f"worker-{uuid.uuid4()}"
    repository = SupabaseRepository(
        required["SUPABASE_URL"] or "",
        required["SUPABASE_SERVICE_ROLE_KEY"] or "",
    )
    return run_job(
        repository,
        required["ALLOCATION_OPTIMIZATION_JOB_ID"] or "",
        worker_id,
    )


if __name__ == "__main__":
    sys.exit(main())
