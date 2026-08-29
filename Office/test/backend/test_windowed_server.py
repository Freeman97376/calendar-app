from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import backend_sidecar
from backend import server


class WindowedServerTests(unittest.TestCase):
    def test_sidecar_records_startup_failures_in_requested_data_directory(self) -> None:
        with TemporaryDirectory() as directory:
            with patch.object(
                backend_sidecar.sys,
                "argv",
                ["calendar-backend", "--data-dir", directory],
            ):
                backend_sidecar._record_unexpected_exit(RuntimeError("startup probe"))

            log = (Path(directory) / "calendar-backend-error.log").read_text(encoding="utf-8")
            self.assertIn("RuntimeError: startup probe", log)

    def test_process_probe_recognizes_current_and_missing_processes(self) -> None:
        self.assertTrue(server.process_is_running(server.os.getpid()))
        self.assertFalse(server.process_is_running(2_147_483_647))

    def test_windowed_sidecar_does_not_write_to_missing_console_streams(self) -> None:
        with (
            patch.object(server.sys, "stdout", None),
            patch.object(server.sys, "stderr", None),
            patch.object(server, "load_env_files"),
            patch.object(server, "create_app", return_value=object()),
            patch.object(server, "available_port", return_value=8797),
            patch.object(server.uvicorn, "run") as uvicorn_run,
        ):
            server.run(host="127.0.0.1", port=8797, mode="desktop", launch_token="test")

        options = uvicorn_run.call_args.kwargs
        self.assertIsNone(options["log_config"])
        self.assertFalse(options["access_log"])


if __name__ == "__main__":
    unittest.main()
