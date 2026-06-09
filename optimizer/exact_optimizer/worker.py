from __future__ import annotations

import json
import base64
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime
from typing import Any

from .codec import input_from_snapshot, result_from_dict, result_to_dict
from .model import OptimizationCancelled, optimize
from .schema import AllocationResult
from .validation import validate_result


class JobCancelled(Exception):
    pass


def normalize_service_role_key(value: str) -> str:
    key = value.strip()
    if key.startswith("SUPABASE_SERVICE_ROLE_KEY="):
        key = key.split("=", 1)[1].strip()
    key = key.strip("\"'")
    # Clipboard copies can contain line wraps, BOMs, or zero-width characters.
    key = re.sub(r"[\s\u200b\u200c\u200d\ufeff]+", "", key)

    if key.startswith("sb_secret_"):
        return key
    if key.startswith("sb_publishable_"):
        raise ValueError("publishable 키가 아닌 sb_secret_ 비밀 키를 입력해주세요.")
    if key.startswith("eyJ") and key.count(".") == 2:
        try:
            payload_segment = key.split(".", 2)[1]
            padding = "=" * (-len(payload_segment) % 4)
            payload = json.loads(
                base64.urlsafe_b64decode(payload_segment + padding).decode("utf-8")
            )
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("service_role JWT 키가 올바르지 않거나 일부가 잘렸습니다.") from error
        if payload.get("role") != "service_role":
            raise ValueError("anon 키가 아닌 service_role 키를 입력해주세요.")
        return key
    key_kind = (
        "JWT처럼 보이지만 구분점 개수가 올바르지 않음"
        if key.startswith("eyJ")
        else "인식할 수 없는 키 접두사"
    )
    raise ValueError(
        "올바른 Supabase service_role JWT 또는 sb_secret_ 비밀 키를 입력해주세요. "
        f"감지 결과: {key_kind}, 길이 {len(key)}자"
    )


def build_supabase_headers(service_role_key: str) -> dict[str, str]:
    key = normalize_service_role_key(service_role_key)
    headers = {
        "apikey": key,
        "Content-Type": "application/json",
    }
    # Supabase's newer sb_secret_ keys are API keys, not JWT bearer tokens.
    if key.startswith("eyJ") and key.count(".") == 2:
        headers["Authorization"] = f"Bearer {key}"
    return headers


class SupabaseRepository:
    def __init__(self, url: str, service_role_key: str) -> None:
        self.base_url = url.rstrip("/")
        self.service_role_key = normalize_service_role_key(service_role_key)
        self.headers = build_supabase_headers(self.service_role_key)

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
                **self.headers,
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

    def claim_job(
        self, job_id: str, worker_id: str, execution_mode: str | None = None
    ) -> dict[str, Any] | None:
        encoded_id = urllib.parse.quote(job_id)
        mode_filter = (
            f"&execution_mode=eq.{urllib.parse.quote(execution_mode)}"
            if execution_mode
            else ""
        )
        rows = self._request(
            "PATCH",
            (
                "/rest/v1/allocation_optimization_jobs"
                f"?id=eq.{encoded_id}&status=eq.PENDING{mode_filter}"
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

    def get_pending_job_ids(
        self, limit: int = 1, execution_mode: str = "local"
    ) -> list[str]:
        encoded_mode = urllib.parse.quote(execution_mode)
        rows = self._request(
            "GET",
            (
                "/rest/v1/allocation_optimization_jobs"
                f"?status=eq.PENDING&execution_mode=eq.{encoded_mode}"
                "&select=id&order=requested_at.asc"
                f"&limit={max(1, limit)}"
            ),
        )
        return [str(row["id"]) for row in rows or []]

    def get_reusable_optimal_job(
        self,
        job_id: str,
        input_hash: str,
        input_snapshot: dict[str, Any],
        optimization_scope: str,
        detailed_settings: dict[str, Any],
    ) -> dict[str, Any] | None:
        return self._request(
            "POST",
            "/rest/v1/rpc/get_reusable_allocation_optimization_job",
            body={
                "p_job_id": job_id,
                "p_input_hash": input_hash,
                "p_input_snapshot": input_snapshot,
                "p_optimization_scope": optimization_scope,
                "p_detailed_settings": detailed_settings,
            },
        )

    def get_job_result(self, job_id: str) -> dict[str, Any] | None:
        encoded_id = urllib.parse.quote(job_id)
        rows = self._request(
            "GET",
            (
                "/rest/v1/allocation_optimization_jobs"
                f"?id=eq.{encoded_id}&status=eq.OPTIMAL&select=result"
            ),
        )
        return rows[0].get("result") if rows else None

    def update_job(
        self,
        job_id: str,
        values: dict[str, Any],
        *,
        expected_status: str | None = None,
    ) -> bool:
        encoded_id = urllib.parse.quote(job_id)
        status_filter = (
            f"&status=eq.{urllib.parse.quote(expected_status)}"
            if expected_status
            else ""
        )
        rows = self._request(
            "PATCH",
            (
                "/rest/v1/allocation_optimization_jobs"
                f"?id=eq.{encoded_id}{status_filter}"
            ),
            body=values,
            prefer="return=representation" if expected_status else "return=minimal",
        )
        return bool(rows) if expected_status else True

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

STATUS_POLL_INTERVAL_SECONDS = 2.0
HEARTBEAT_INTERVAL_SECONDS = 5.0


def _validated_reusable_result(
    input_snapshot: dict[str, Any],
    result_payload: dict[str, Any] | None,
) -> AllocationResult | None:
    try:
        optimization_input = input_from_snapshot(input_snapshot)
        result = result_from_dict(result_payload)
        if result is None or validate_result(optimization_input, result):
            return None
    except (KeyError, TypeError, ValueError):
        return None

    return result


def run_job(
    repository: SupabaseRepository,
    job_id: str,
    worker_id: str,
    execution_mode: str | None = None,
) -> int:
    job = (
        repository.claim_job(job_id, worker_id, execution_mode)
        if execution_mode
        else repository.claim_job(job_id, worker_id)
    )
    if job is None:
        status = repository.get_job_status(job_id)
        if status == "CANCELLED":
            return 0
        raise RuntimeError("Optimization job is not pending or does not exist.")

    started = time.monotonic()
    last_heartbeat = 0.0
    last_status_check = -STATUS_POLL_INTERVAL_SECONDS
    cached_status = "RUNNING"
    repository.add_event(job_id, "WORKER_CLAIMED", {"worker_id": worker_id})

    reusable_job = repository.get_reusable_optimal_job(
        job_id,
        str(job["input_hash"]),
        job["input_snapshot"],
        str(job.get("optimization_scope") or "BASELINE"),
        job.get("detailed_settings") or {},
    )
    if reusable_job is not None:
        reusable_result = _validated_reusable_result(
            job["input_snapshot"],
            reusable_job.get("result"),
        )
        if reusable_result is None:
            repository.add_event(
                job_id,
                "JOB_RESULT_REUSE_REJECTED",
                {"source_job_id": reusable_job["id"]},
            )
        else:
            completed = repository.update_job(
                job_id,
                {
                    "status": "OPTIMAL",
                    "progress": 100,
                    "current_phase": "completed",
                    "elapsed_seconds": 0,
                    "best_known_bus_count": reusable_result.total_buses,
                    "proven_bus_count": reusable_result.total_buses,
                    "result": reusable_job["result"],
                    "diagnostics": reusable_job.get("diagnostics"),
                    "completed_at": now_iso(),
                },
                expected_status="RUNNING",
            )
            if completed:
                repository.add_event(
                    job_id,
                    "JOB_RESULT_REUSED",
                    {"source_job_id": reusable_job["id"]},
                )
                return 0

            status = repository.get_job_status(job_id)
            if status in ("CANCEL_REQUESTED", "CANCELLED"):
                return 0
            raise RuntimeError(f"Optimization job entered unexpected status: {status}")

    def check_cancellation() -> bool:
        nonlocal cached_status, last_heartbeat, last_status_check
        elapsed = time.monotonic() - started
        if elapsed - last_status_check >= STATUS_POLL_INTERVAL_SECONDS:
            cached_status = repository.get_job_status(job_id)
            last_status_check = elapsed
        if (
            cached_status == "RUNNING"
            and elapsed - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS
        ):
            repository.update_job(job_id, {"elapsed_seconds": round(elapsed)})
            last_heartbeat = elapsed
        return cached_status in ("CANCEL_REQUESTED", "CANCELLED")

    def report_progress(phase: str, value: int | None) -> None:
        nonlocal cached_status, last_heartbeat, last_status_check
        status = repository.get_job_status(job_id)
        elapsed = time.monotonic() - started
        cached_status = status
        last_status_check = elapsed
        if status in ("CANCEL_REQUESTED", "CANCELLED"):
            raise JobCancelled()
        if status != "RUNNING":
            raise RuntimeError(f"Optimization job entered unexpected status: {status}")

        values: dict[str, Any] = {
            "progress": PHASE_PROGRESS.get(phase, 0),
            "current_phase": phase,
            "elapsed_seconds": round(elapsed),
        }
        if phase == "total_buses":
            values["best_known_bus_count"] = value
            values["proven_bus_count"] = value
        repository.update_job(job_id, values)
        last_heartbeat = elapsed
        repository.add_event(
            job_id,
            "PHASE_SKIPPED" if value is None else "PHASE_OPTIMAL",
            {"phase": phase, "value": value},
        )

    try:
        optimization_input = input_from_snapshot(job["input_snapshot"])
        resume_result = (
            _validated_reusable_result(
                job["input_snapshot"],
                repository.get_job_result(str(job["resume_from_job_id"])),
            )
            if job.get("resume_from_job_id")
            else None
        )
        result = optimize(
            optimization_input,
            report_progress,
            check_cancellation,
            detailed_balance=job.get("optimization_scope") == "DETAILED",
            skipped_detailed_phases=frozenset(
                job.get("detailed_settings", {}).get("skipped_phases", [])
            ),
            initial_result=resume_result,
        )
        if check_cancellation():
            raise JobCancelled()
        elapsed_seconds = round(time.monotonic() - started)
        result_payload = result_to_dict(result)

        if result.status == "OPTIMAL":
            completed = repository.update_job(
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
                expected_status="RUNNING",
            )
            if not completed:
                status = repository.get_job_status(job_id)
                if status in ("CANCEL_REQUESTED", "CANCELLED"):
                    raise JobCancelled()
                raise RuntimeError(
                    f"Optimization job entered unexpected status: {status}"
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

        completed = repository.update_job(
            job_id,
            {
                "status": result.status,
                "current_phase": "completed",
                "elapsed_seconds": elapsed_seconds,
                "diagnostics": result_payload.get("diagnostics"),
                "error_message": result.error_message,
                "completed_at": now_iso(),
            },
            expected_status="RUNNING",
        )
        if not completed:
            status = repository.get_job_status(job_id)
            if status in ("CANCEL_REQUESTED", "CANCELLED"):
                raise JobCancelled()
            raise RuntimeError(
                f"Optimization job entered unexpected status: {status}"
            )
        repository.add_event(
            job_id,
            f"JOB_{result.status}",
            {"elapsed_seconds": elapsed_seconds},
        )
        return 2
    except (JobCancelled, OptimizationCancelled):
        status = repository.get_job_status(job_id)
        transitioned = False
        if status in ("RUNNING", "CANCEL_REQUESTED"):
            transitioned = repository.update_job(
                job_id,
                {
                    "status": "CANCELLED",
                    "current_phase": "cancelled",
                    "elapsed_seconds": round(time.monotonic() - started),
                    "completed_at": now_iso(),
                },
                expected_status=status,
            )
        if transitioned:
            repository.add_event(job_id, "JOB_CANCELLED")
        return 0
    except Exception as error:
        failed = repository.update_job(
            job_id,
            {
                "status": "FAILED",
                "current_phase": "failed",
                "elapsed_seconds": round(time.monotonic() - started),
                "error_message": str(error),
                "completed_at": now_iso(),
            },
            expected_status="RUNNING",
        )
        if failed:
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
        os.environ.get("ALLOCATION_OPTIMIZER_EXECUTION_MODE") or "cloud",
    )


if __name__ == "__main__":
    sys.exit(main())
