from __future__ import annotations

import io
import sys
import unittest
from unittest.mock import patch

if sys.platform != "win32":
    raise unittest.SkipTest("Windows installer tests require Windows.")

from exact_optimizer.windows_installer import (
    read_hidden_console_input,
    run_installed_worker,
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


if __name__ == "__main__":
    unittest.main()
