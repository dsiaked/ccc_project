from __future__ import annotations

import base64
import ctypes
import getpass
import json
import msvcrt
import os
import shutil
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from ctypes import wintypes
from pathlib import Path
from typing import Callable

from exact_optimizer.local_worker import main as run_local_worker
from exact_optimizer.worker import (
    build_supabase_headers,
    normalize_service_role_key,
    normalize_supabase_url,
)


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
user32 = ctypes.windll.user32
kernel32.CreateMutexW.restype = wintypes.HANDLE
kernel32.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
kernel32.GlobalLock.restype = wintypes.LPVOID
kernel32.GlobalLock.argtypes = [wintypes.HANDLE]
kernel32.GlobalUnlock.argtypes = [wintypes.HANDLE]
user32.OpenClipboard.argtypes = [wintypes.HWND]
user32.GetClipboardData.restype = wintypes.HANDLE
user32.GetClipboardData.argtypes = [wintypes.UINT]
ERROR_ALREADY_EXISTS = 183
WORKER_MUTEX_NAME = "Local\\CCC-Bus-Allocation-Optimizer-Worker"
CF_UNICODETEXT = 13


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


def read_clipboard_text() -> str:
    if not user32.OpenClipboard(None):
        raise ctypes.WinError()
    try:
        handle = user32.GetClipboardData(CF_UNICODETEXT)
        if not handle:
            raise ctypes.WinError()
        pointer = kernel32.GlobalLock(handle)
        if not pointer:
            raise ctypes.WinError()
        try:
            return ctypes.wstring_at(pointer)
        finally:
            kernel32.GlobalUnlock(handle)
    finally:
        user32.CloseClipboard()


def read_hidden_console_input(
    prompt: str,
    *,
    read_character: Callable[[], str] = msvcrt.getwch,
    read_clipboard: Callable[[], str] = read_clipboard_text,
) -> str:
    sys.stdout.write(prompt)
    sys.stdout.flush()
    characters: list[str] = []
    try:
        while True:
            character = read_character()
            if character in {"\r", "\n"}:
                return "".join(characters)
            if character == "\x03":
                raise KeyboardInterrupt
            if character == "\x16":
                characters.extend(read_clipboard())
                continue
            if character in {"\b", "\x7f"}:
                if characters:
                    characters.pop()
                continue
            if character in {"\x00", "\xe0"}:
                read_character()
                continue
            characters.append(character)
    finally:
        sys.stdout.write("\n")
        sys.stdout.flush()


def read_secret(prompt: str) -> str:
    if sys.stdin.isatty():
        return read_hidden_console_input(prompt)
    return getpass.getpass(prompt)


def local_app_data() -> Path:
    return Path(os.environ["LOCALAPPDATA"])


def app_data() -> Path:
    return Path(os.environ["APPDATA"])


def install_directory() -> Path:
    return local_app_data() / "Programs" / INSTALL_DIRECTORY_NAME


def installed_executable() -> Path:
    return install_directory() / EXECUTABLE_NAME


def is_application_installed() -> bool:
    return installed_executable().exists() and config_path().exists()


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


def run_installed_worker() -> int:
    original_argv = sys.argv
    sys.argv = [sys.argv[0]]
    try:
        return run_local_worker()
    finally:
        sys.argv = original_argv


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
            return run_installed_worker()
        finally:
            kernel32.CloseHandle(mutex)


def self_test() -> int:
    value = "ccc-bus-installer-self-test"
    if unprotect_secret(protect_secret(value)) != value:
        return 1
    return 0


def installer_gui() -> int:
    import tkinter as tk
    from tkinter import messagebox, ttk

    try:
        saved_url, saved_key = load_config()
    except Exception:
        saved_url, saved_key = "", ""

    root = tk.Tk()
    root.title("CCC 버스 배차 계산기 설치")
    root.geometry("760x650")
    root.minsize(720, 620)
    root.option_add("*Font", ("Malgun Gothic", 10))

    style = ttk.Style(root)
    style.configure("Title.TLabel", font=("Malgun Gothic", 20, "bold"))
    style.configure("Subtitle.TLabel", foreground="#475569")
    style.configure("Status.TLabel", font=("Malgun Gothic", 11, "bold"))
    style.configure("Primary.TButton", font=("Malgun Gothic", 10, "bold"))

    saved_key_holder = {"value": saved_key}
    busy = {"value": False}
    action_buttons: list[ttk.Button] = []

    url_var = tk.StringVar(value=saved_url)
    key_var = tk.StringVar()
    show_key_var = tk.BooleanVar(value=False)
    installation_status_var = tk.StringVar()
    status_message_var = tk.StringVar(value="연결 정보를 입력한 뒤 설치를 진행해주세요.")

    main = ttk.Frame(root, padding=24)
    main.grid(row=0, column=0, sticky="nsew")
    root.columnconfigure(0, weight=1)
    root.rowconfigure(0, weight=1)
    main.columnconfigure(0, weight=1)

    ttk.Label(main, text="CCC 버스 배차 계산기", style="Title.TLabel").grid(
        row=0, column=0, sticky="w"
    )
    ttk.Label(
        main,
        text="Supabase 연결을 확인하고 로컬 최적화 워커를 설치합니다.",
        style="Subtitle.TLabel",
    ).grid(row=1, column=0, sticky="w", pady=(4, 18))

    status_frame = ttk.LabelFrame(main, text="설치 상태", padding=14)
    status_frame.grid(row=2, column=0, sticky="ew", pady=(0, 14))
    status_frame.columnconfigure(0, weight=1)
    ttk.Label(
        status_frame, textvariable=installation_status_var, style="Status.TLabel"
    ).grid(row=0, column=0, sticky="w")

    connection_frame = ttk.LabelFrame(main, text="Supabase 연결 정보", padding=16)
    connection_frame.grid(row=3, column=0, sticky="ew", pady=(0, 14))
    connection_frame.columnconfigure(1, weight=1)

    ttk.Label(connection_frame, text="프로젝트 URL").grid(
        row=0, column=0, sticky="w", padx=(0, 12), pady=(0, 12)
    )
    url_entry = ttk.Entry(connection_frame, textvariable=url_var)
    url_entry.grid(row=0, column=1, columnspan=2, sticky="ew", pady=(0, 12))

    ttk.Label(connection_frame, text="Service-role 키").grid(
        row=1, column=0, sticky="w", padx=(0, 12)
    )
    key_entry = ttk.Entry(connection_frame, textvariable=key_var, show="*")
    key_entry.grid(row=1, column=1, sticky="ew")

    def toggle_key_visibility() -> None:
        key_entry.configure(show="" if show_key_var.get() else "*")

    ttk.Checkbutton(
        connection_frame,
        text="표시",
        variable=show_key_var,
        command=toggle_key_visibility,
    ).grid(row=1, column=2, sticky="e", padx=(10, 0))

    saved_key_text = (
        "저장된 암호화 키가 있습니다. 변경할 때만 새 키를 입력하세요."
        if saved_key
        else "키 입력칸에는 Ctrl+V로 전체 키를 붙여넣을 수 있습니다."
    )
    ttk.Label(
        connection_frame,
        text=saved_key_text,
        style="Subtitle.TLabel",
        wraplength=620,
    ).grid(row=2, column=0, columnspan=3, sticky="w", pady=(10, 0))

    ttk.Label(
        connection_frame,
        text=(
            "보안 안내: service-role 키는 이 PC의 현재 Windows 사용자만 해독할 수 "
            "있도록 DPAPI로 암호화 저장됩니다."
        ),
        wraplength=620,
    ).grid(row=3, column=0, columnspan=3, sticky="w", pady=(8, 0))

    action_frame = ttk.Frame(main)
    action_frame.grid(row=4, column=0, sticky="ew")
    for column in range(4):
        action_frame.columnconfigure(column, weight=1)

    progress = ttk.Progressbar(main, mode="indeterminate")
    progress.grid(row=5, column=0, sticky="ew", pady=(16, 8))
    ttk.Label(
        main,
        textvariable=status_message_var,
        wraplength=680,
        justify="left",
    ).grid(row=6, column=0, sticky="w")

    paths_frame = ttk.LabelFrame(main, text="설치 정보", padding=12)
    paths_frame.grid(row=7, column=0, sticky="ew", pady=(18, 0))
    paths_frame.columnconfigure(0, weight=1)
    ttk.Label(
        paths_frame,
        text=f"설치 위치: {install_directory()}\n로그 위치: {log_path()}",
        style="Subtitle.TLabel",
        wraplength=650,
    ).grid(row=0, column=0, sticky="w")

    def refresh_installation_status() -> None:
        installed = is_application_installed()
        installation_status_var.set(
            "설치됨 · Windows 로그인 시 자동 실행"
            if installed
            else "설치 전 · 연결 확인 후 설치해주세요"
        )
        if busy["value"]:
            return
        start_button.configure(state="normal" if installed else "disabled")
        remove_button.configure(state="normal" if installed else "disabled")
        install_button.configure(text="업데이트" if installed else "설치")

    def set_busy(value: bool, message: str) -> None:
        busy["value"] = value
        status_message_var.set(message)
        for button in action_buttons:
            button.configure(state="disabled" if value else "normal")
        url_entry.configure(state="disabled" if value else "normal")
        key_entry.configure(state="disabled" if value else "normal")
        if value:
            progress.start(12)
        else:
            progress.stop()
            refresh_installation_status()

    def current_connection() -> tuple[str, str]:
        url = normalize_supabase_url(url_var.get())
        raw_key = key_var.get().strip() or saved_key_holder["value"]
        if not raw_key:
            raise ValueError("Supabase service-role 키를 입력해주세요.")
        return url, normalize_service_role_key(raw_key)

    def show_input_error(error: Exception) -> None:
        messagebox.showerror("입력 확인", str(error), parent=root)

    def run_task(
        start_message: str,
        success_message: str,
        operation: Callable[[], None],
        on_success: Callable[[], None] | None = None,
    ) -> None:
        set_busy(True, start_message)

        def finish_success() -> None:
            if on_success:
                on_success()
            set_busy(False, success_message)
            messagebox.showinfo("완료", success_message, parent=root)

        def finish_error(message: str) -> None:
            set_busy(False, f"오류: {message}")
            messagebox.showerror("작업 실패", message, parent=root)

        def worker() -> None:
            try:
                operation()
            except Exception as error:
                root.after(0, lambda message=str(error): finish_error(message))
            else:
                root.after(0, finish_success)

        threading.Thread(target=worker, daemon=True).start()

    def validate_clicked() -> None:
        try:
            url, key = current_connection()
        except Exception as error:
            show_input_error(error)
            return
        run_task(
            "Supabase 연결과 배차 계산 테이블을 확인하는 중입니다...",
            "Supabase 연결 확인을 완료했습니다.",
            lambda: validate_connection(url, key),
        )

    def install_clicked() -> None:
        try:
            url, key = current_connection()
        except Exception as error:
            show_input_error(error)
            return

        def operation() -> None:
            validate_connection(url, key)
            install_application(url, key)
            start_worker()

        def on_success() -> None:
            saved_key_holder["value"] = key
            url_var.set(url)
            key_var.set("")

        run_task(
            "연결을 확인하고 로컬 최적화 워커를 설치하는 중입니다...",
            "설치와 자동 실행 등록을 완료했습니다.",
            operation,
            on_success,
        )

    def start_clicked() -> None:
        run_task(
            "로컬 최적화 워커를 시작하는 중입니다...",
            "로컬 최적화 워커를 시작했습니다.",
            start_worker,
        )

    def remove_clicked() -> None:
        if not messagebox.askyesno(
            "설치 제거",
            "설치된 워커와 저장된 연결 정보를 제거할까요?",
            parent=root,
        ):
            return

        def on_success() -> None:
            saved_key_holder["value"] = ""
            key_var.set("")

        run_task(
            "설치 제거를 준비하는 중입니다...",
            "제거 작업을 예약했습니다. 창을 닫으면 완료됩니다.",
            uninstall_application,
            on_success,
        )

    validate_button = ttk.Button(
        action_frame, text="연결 확인", command=validate_clicked
    )
    validate_button.grid(row=0, column=0, sticky="ew", padx=(0, 6))
    install_button = ttk.Button(
        action_frame, text="설치", command=install_clicked, style="Primary.TButton"
    )
    install_button.grid(row=0, column=1, sticky="ew", padx=6)
    start_button = ttk.Button(
        action_frame, text="워커 실행", command=start_clicked
    )
    start_button.grid(row=0, column=2, sticky="ew", padx=6)
    remove_button = ttk.Button(
        action_frame, text="제거", command=remove_clicked
    )
    remove_button.grid(row=0, column=3, sticky="ew", padx=(6, 0))
    action_buttons.extend(
        [validate_button, install_button, start_button, remove_button]
    )

    refresh_installation_status()
    url_entry.focus_set()
    root.mainloop()
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
    key = read_secret(key_prompt).strip() or saved_key
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
    if "--console-wizard" in sys.argv:
        return installer_wizard()
    return installer_gui()


if __name__ == "__main__":
    raise SystemExit(main())
