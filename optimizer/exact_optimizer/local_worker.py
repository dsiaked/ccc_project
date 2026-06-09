from __future__ import annotations

import argparse
import os
import socket
import sys
import time
import uuid
from pathlib import Path

from .worker import SupabaseRepository, run_job


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def build_repository(root: Path) -> SupabaseRepository:
    load_env_file(root / ".env")
    load_env_file(root / ".env.local")
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    missing = [
        name
        for name, value in {
            "VITE_SUPABASE_URL or SUPABASE_URL": url,
            "SUPABASE_SERVICE_ROLE_KEY": service_role_key,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"Missing local worker settings: {', '.join(missing)}")
    return SupabaseRepository(url or "", service_role_key or "")


def main() -> int:
    parser = argparse.ArgumentParser(description="Watch and run exact allocation jobs.")
    parser.add_argument("--once", action="store_true", help="Exit when no pending job remains.")
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    parser.add_argument("--job-id")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
    repository = build_repository(root)
    worker_id = (
        os.environ.get("WORKER_ID")
        or f"local-{socket.gethostname()}-{uuid.uuid4().hex[:8]}"
    )
    print(f"Local allocation optimizer ready: {worker_id}", flush=True)
    consecutive_poll_failures = 0

    try:
        while True:
            try:
                job_ids = (
                    [args.job_id]
                    if args.job_id
                    else repository.get_pending_job_ids(execution_mode="local")
                )
                consecutive_poll_failures = 0
            except Exception as error:
                if args.once:
                    print(f"Pending job poll failed: {error}", file=sys.stderr, flush=True)
                    return 1
                consecutive_poll_failures += 1
                retry_seconds = min(
                    60.0,
                    max(0.5, args.poll_seconds)
                    * (2 ** min(consecutive_poll_failures - 1, 5)),
                )
                print(
                    f"Pending job poll failed: {error}. "
                    f"Retrying in {retry_seconds:g} seconds.",
                    file=sys.stderr,
                    flush=True,
                )
                time.sleep(retry_seconds)
                continue
            if not job_ids:
                if args.once:
                    return 0
                time.sleep(max(0.5, args.poll_seconds))
                continue

            for job_id in job_ids:
                if not job_id:
                    continue
                print(f"Claiming allocation optimization job {job_id}", flush=True)
                try:
                    run_job(repository, job_id, worker_id, "local")
                except Exception as error:
                    print(f"Job {job_id} failed: {error}", file=sys.stderr, flush=True)
                if args.job_id:
                    return 0
    except KeyboardInterrupt:
        print("Local allocation optimizer stopped.", flush=True)
        return 0


if __name__ == "__main__":
    sys.exit(main())
