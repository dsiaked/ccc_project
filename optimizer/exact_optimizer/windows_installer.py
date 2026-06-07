from __future__ import annotations

import base64
import ctypes
import getpass
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from ctypes import wintypes
from pathlib import Path

from exact_optimizer.local_worker import main as run_local_worker
from exact_optimizer.worker import build_supabase_headers, normalize_service_role_key


APP_NAME = "CCC Bus Allocation Optimizer"
INSTALL_DIRECTORY_NAME = "CCC Bus Allocation Optimizer"
EXECUTABLE_NAME = "CCC-Bus-Allocation-Optimizer.exe"
STARTUP_FILE_NAME = "CCC-Bus-Allocation-Optimizer.cmd"


class DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_byte)),
    ]


crypt32 = ctypes.windll.crypt32
kernel32 = ctypes.windll.kernel32
kernel32.CreateMutexW.restype = wintypes.HANDLE
kernel32.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
ERROR_ALREADY_EXISTS = 183
WORKER_MUTEX_NAME = "Local\\CCC-Bus-Allocation-Optimizer-Worker"


def _blob_from_bytes(value: bytes) -> tuple[DataBlob, ctypes.Array]:
    buffer = ctypes.create_string_buffer(value)
    return (
        DataBlob(
            len(value),
            ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)),
        ),
        buffer,
    )


def protect_secret(value: str) -> str:
    input_blob, input_buffer = _blob_from_bytes(value.encode("utf-8"))
    output_blob = DataBlob()
    description = APP_NAME
    if not crypt32.CryptProtectData(
        ctypes.byref(input_blob),
        description,
        None,
        None,
        None,
        0,
        ctypes.byref(output_blob),
    ):
        raise ctypes.WinError()
    del input_buffer
    try:
        encrypted = ctypes.string_at(output_blob.pbData, output_blob.cbData)
        return base64.b64encode(encrypted).decode("ascii")
    finally:
        kernel32.LocalFree(output_blob.pbData)


def unprotect_secret(value: str) -> str:
    encrypted = base64.b64decode(value)
    input_blob, input_buffer = _blob_from_bytes(encrypted)
    output_blob = DataBlob()
    if not crypt32.CryptUnprotectData(
        ctypes.byref(input_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(output_blob),
    ):
        raise ctypes.WinError()
    del input_buffer
    try:
        decrypted = ctypes.string_at(output_blob.pbData, output_blob.cbData)
        return decrypted.decode("utf-8")
    finally:
        kernel32.LocalFree(output_blob.pbData)


def local_app_data() -> Path:
    return Path(os.environ["LOCALAPPDATA"])


def app_data() -> Path:
    return Path(os.environ["APPDATA"])


def install_directory() -> Path:
    return local_app_data() / "Programs" / INSTALL_DIRECTORY_NAME


def installed_executable() -> Path:
    return install_directory() / EXECUTABLE_NAME


def config_path() -> Path:
    return app_data() / INSTALL_DIRECTORY_NAME / "config.json"


def log_path() -> Path:
    return app_data() / INSTALL_DIRECTORY_NAME / "worker.log"


def startup_path() -> Path:
    return (
        app_data()
        / "Microsoft"
        / "Windows"
        / "Start Menu"
        / "Programs"
        / "Startup"
        / STARTUP_FILE_NAME
    )


def load_config() -> tuple[str, str]:
    path = config_path()
    if not path.exists():
        return "", ""
    payload = json.loads(path.read_text(encoding="utf-8"))
    return str(payload.get("supabase_url", "")), unprotect_secret(
        str(payload.get("service_role_key", ""))
    )


def save_config(supabase_url: str, service_role_key: str) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "supabase_url": supabase_url.rstrip("/"),
        "service_role_key": protect_secret(service_role_key),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_supabase_url(value: str) -> str:
    url = value.strip().rstrip("/")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Supabase URL은 https://프로젝트참조.supabase.co 형식으로 입력해주세요.")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError(
            "Supabase URL에는 /rest/v1 또는 대시보드 경로를 넣지 마세요. "
            "예: https://프로젝트참조.supabase.co"
        )
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


def _http_error_detail(error: urllib.error.HTTPError) -> str:
    raw_detail = error.read().decode("utf-8", errors="replace").strip()
    if not raw_detail:
        return "응답 본문 없음"
    try:
        payload = json.loads(raw_detail)
    except json.JSONDecodeError:
        return raw_detail[:1000]
    if not isinstance(payload, dict):
        return raw_detail[:1000]
    details = [
        str(payload[name])
        for name in ("message", "details", "hint", "code")
        if payload.get(name)
    ]
    return " | ".join(details) if details else raw_detail[:1000]


def validate_connection(supabase_url: str, service_role_key: str) -> None:
    base_url = normalize_supabase_url(supabase_url)
    key = normalize_service_role_key(service_role_key)
    checks = [
        (
            "/rest/v1/",
            "Supabase 키 인증 실패",
            "Settings > API Keys에서 service_role 또는 sb_secret_ 키를 다시 복사해주세요.",
        ),
        (
            "/rest/v1/allocation_optimization_jobs?select=id&limit=1",
            "배차 계산 테이블 확인 실패",
            "Supabase 마이그레이션을 적용해 allocation_optimization_jobs 테이블을 생성해주세요.",
        ),
    ]
    for path, title, guidance in checks:
        request = urllib.request.Request(
            f"{base_url}{path}",
            headers=build_supabase_headers(key),
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.status >= 400:
                    raise RuntimeError(f"{title}: HTTP {response.status}")
        except urllib.error.HTTPError as error:
            detail = _http_error_detail(error)
            raise RuntimeError(
                f"{title}: HTTP {error.code}\n서버 응답: {detail}\n확인사항: {guidance}"
            ) from error
        except urllib.error.URLError as error:
            raise RuntimeError(f"Supabase 연결 실패: {error.reason}") from error


def write_startup_file() -> None:
    path = startup_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    executable = installed_executable()
    path.write_text(
        f'@echo off\r\nstart "" /min "{executable}" --worker\r\n',
        encoding="utf-8-sig",
    )


def stop_installed_worker() -> None:
    subprocess.run(
        ["taskkill", "/f", "/im", EXECUTABLE_NAME],
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )


def install_application(supabase_url: str, service_role_key: str) -> None:
    target = installed_executable()
    target.parent.mkdir(parents=True, exist_ok=True)
    source = Path(sys.executable).resolve()
    if source != target.resolve():
        if target.exists():
            stop_installed_worker()
        shutil.copy2(source, target)
    save_config(supabase_url, service_role_key)
    write_startup_file()


def start_worker() -> None:
    executable = installed_executable()
    if not executable.exists():
        raise RuntimeError("먼저 설치를 완료해주세요.")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(
        subprocess, "DETACHED_PROCESS", 0
    )
    subprocess.Popen(
        [str(executable), "--worker"],
        cwd=str(executable.parent),
        creationflags=flags,
        close_fds=True,
    )


def uninstall_application() -> None:
    startup_path().unlink(missing_ok=True)
    config_path().unlink(missing_ok=True)
    log_path().unlink(missing_ok=True)
    target = installed_executable()
    if target.exists():
        cleanup_script = Path(os.environ["TEMP"]) / "ccc-bus-optimizer-cleanup.cmd"
        cleanup_script.write_text(
            "\r\n".join(
                [
                    "@echo off",
                    f'taskkill /f /im "{EXECUTABLE_NAME}" > nul 2>&1',
                    "ping 127.0.0.1 -n 3 > nul",
                    f'del /f /q "{target}"',
                    f'rmdir /s /q "{target.parent}"',
                    'del /f /q "%~f0"',
                ]
            ),
            encoding="utf-8-sig",
        )
        subprocess.Popen(
            ["cmd.exe", "/c", str(cleanup_script)],
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )


def worker_mode() -> int:
    mutex = kernel32.CreateMutexW(None, False, WORKER_MUTEX_NAME)
    if not mutex:
        raise ctypes.WinError()
    if kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
        kernel32.CloseHandle(mutex)
        return 0
    supabase_url, service_role_key = load_config()
    if not supabase_url or not service_role_key:
        kernel32.CloseHandle(mutex)
        return 2
    os.environ["SUPABASE_URL"] = supabase_url
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = service_role_key
    log = log_path()
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a", encoding="utf-8") as stream:
        sys.stdout = stream
        sys.stderr = stream
        print("Starting installed local allocation optimizer.", flush=True)
        try:
            return run_local_worker()
        finally:
            kernel32.CloseHandle(mutex)


def self_test() -> int:
    value = "ccc-bus-installer-self-test"
    if unprotect_secret(protect_secret(value)) != value:
        return 1
    return 0


def prompt_connection() -> tuple[str, str]:
    try:
        saved_url, saved_key = load_config()
    except Exception:
        saved_url, saved_key = "", ""
    url_prompt = f"Supabase URL [{saved_url}]: " if saved_url else "Supabase URL: "
    url = normalize_supabase_url(input(url_prompt).strip() or saved_url)
    key_prompt = (
        "Supabase service-role 키 [기존 암호화 키 사용, 변경 시 입력]: "
        if saved_key
        else "Supabase service-role 키: "
    )
    key = getpass.getpass(key_prompt).strip() or saved_key
    if not key:
        raise ValueError("Supabase service-role 키를 입력해주세요.")
    return url, normalize_service_role_key(key)


def print_header() -> None:
    print("=" * 64)
    print("CCC 버스 배차 계산기 설치")
    print("=" * 64)
    print("현재 사용자 계정에 설치하며 관리자 권한은 필요하지 않습니다.")
    print("service-role 키는 Windows DPAPI로 암호화 저장됩니다.")
    print(f"설치 위치: {install_directory()}")
    print(f"로그 위치: {log_path()}")
    print()


def installer_wizard() -> int:
    while True:
        print_header()
        installed = installed_executable().exists() and config_path().exists()
        print(f"현재 상태: {'설치됨' if installed else '설치 전'}")
        print()
        print("1. 설치 / 업데이트")
        print("2. Supabase 연결 확인")
        print("3. 로컬 워커 실행")
        print("4. 제거")
        print("0. 종료")
        print()
        choice = input("선택: ").strip()
        try:
            if choice == "1":
                url, key = prompt_connection()
                print("Supabase 연결을 확인하는 중입니다...")
                validate_connection(url, key)
                install_application(url, key)
                start_worker()
                print("설치와 자동 실행 등록을 완료했습니다.")
            elif choice == "2":
                url, key = prompt_connection()
                validate_connection(url, key)
                print("Supabase 연결 확인 완료.")
            elif choice == "3":
                start_worker()
                print("로컬 배차 워커를 실행했습니다.")
            elif choice == "4":
                if input("설치와 저장된 연결 정보를 제거할까요? [y/N]: ").lower() == "y":
                    uninstall_application()
                    print("제거 작업을 예약했습니다. 이 창을 닫으면 완료됩니다.")
                    input("Enter 키를 눌러 종료하세요.")
                    return 0
            elif choice == "0":
                return 0
            else:
                print("메뉴 번호를 다시 입력해주세요.")
        except Exception as error:
            print(f"오류: {error}")
        print()
        input("계속하려면 Enter 키를 누르세요.")
        os.system("cls")


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    if "--worker" in sys.argv:
        return worker_mode()
    return installer_wizard()


if __name__ == "__main__":
    raise SystemExit(main())
