from __future__ import annotations

import io
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

if sys.platform != "win32":
    raise unittest.SkipTest("Windows installer tests require Windows.")

from exact_optimizer.windows_installer import (
    EXECUTABLE_NAME,
    configured_install_directory,
    installed_executable,
    normalize_install_directory,
    read_hidden_console_input,
    run_installed_worker,
    uninstall_application,
)


class WindowsInstallerTests(unittest.TestCase):
    def test_ctrl_v_reads_the_full_clipboard_without_echoing_it(self) -> None:
        characters = iter(["a", "\x16", "b", "\r"])
        output = io.StringIO()

        with patch("sys.stdout", output):
            value = read_hidden_console_input(
                "Secret: ",
                read_character=lambda: next(characters),
                read_clipboard=lambda: "clipboard-secret",
            )

        self.assertEqual(value, "aclipboard-secretb")
        self.assertEqual(output.getvalue(), "Secret: \n")

    def test_backspace_removes_the_previous_character(self) -> None:
        characters = iter(["a", "b", "\b", "c", "\r"])

        value = read_hidden_console_input(
            "",
            read_character=lambda: next(characters),
            read_clipboard=lambda: "",
        )

        self.assertEqual(value, "ac")

    def test_installed_worker_does_not_receive_installer_arguments(self) -> None:
        original_argv = ["optimizer.exe", "--worker"]

        with patch.object(sys, "argv", original_argv):
            with patch(
                "exact_optimizer.windows_installer.run_local_worker",
                side_effect=lambda: 0 if sys.argv == ["optimizer.exe"] else 1,
            ):
                result = run_installed_worker()

            self.assertIs(sys.argv, original_argv)

        self.assertEqual(result, 0)

    def test_custom_install_directory_controls_executable_location(self) -> None:
        directory = r"C:\CCC Bus Worker"
        normalized = normalize_install_directory(directory)

        self.assertEqual(installed_executable(directory), normalized / EXECUTABLE_NAME)

    def test_install_directory_must_be_absolute(self) -> None:
        with self.assertRaisesRegex(ValueError, "절대 경로"):
            normalize_install_directory("relative-folder")

    def test_legacy_config_uses_default_install_directory(self) -> None:
        config = Mock()
        config.exists.return_value = True
        config.read_text.return_value = '{"supabase_url": "https://example.supabase.co"}'
        default = Path(r"C:\Users\tester\AppData\Local\Programs\CCC Bus Worker")

        with patch(
            "exact_optimizer.windows_installer.config_path", return_value=config
        ), patch(
            "exact_optimizer.windows_installer.default_install_directory",
            return_value=default,
        ):
            self.assertEqual(configured_install_directory(), default)

    def test_uninstall_uses_configured_directory_before_deleting_config(self) -> None:
        config_exists = True
        config = Mock()

        def delete_config(*, missing_ok: bool) -> None:
            nonlocal config_exists
            config_exists = False

        config.unlink.side_effect = delete_config
        configured_target = Mock()
        configured_target.exists.return_value = False
        default_target = Mock()
        default_target.exists.return_value = False

        with patch(
            "exact_optimizer.windows_installer.config_path", return_value=config
        ), patch(
            "exact_optimizer.windows_installer.startup_path"
        ), patch(
            "exact_optimizer.windows_installer.log_path"
        ), patch(
            "exact_optimizer.windows_installer.installed_executable",
            side_effect=lambda _: configured_target if config_exists else default_target,
        ):
            uninstall_application()

        configured_target.exists.assert_called_once_with()
        default_target.exists.assert_not_called()


if __name__ == "__main__":
    unittest.main()
