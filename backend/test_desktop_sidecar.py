import os
from pathlib import Path
import unittest
from unittest.mock import patch

from desktop_sidecar import PACKAGED_YTDLP_FLAG, main, parse_parent_pid


class DesktopSidecarRoutingTests(unittest.TestCase):
    def test_local_edit_is_enabled_only_by_authenticated_desktop_shell(self):
        repository = Path(__file__).resolve().parent.parent
        shell = (repository / "frontend" / "src-tauri" / "src" / "lib.rs").read_text(encoding="utf-8")
        production = (repository / "docker-compose.production.yml").read_text(encoding="utf-8")

        self.assertIn('.env("ECLIPSE_MEDIA_SESSION_TOKEN", &token)', shell)
        self.assertIn('.env("ECLIPSE_MEDIA_LOCAL_EDIT_ENABLED", "true")', shell)
        self.assertIn('ECLIPSE_MEDIA_LOCAL_EDIT_ENABLED: "false"', production)

    def test_parent_pid_parser_accepts_only_a_windows_pid(self):
        self.assertIsNone(parse_parent_pid(None))
        self.assertIsNone(parse_parent_pid(""))
        self.assertEqual(parse_parent_pid("4242"), 4242)

        for value in ("-1", "1.5", "parent", "4294967296", str(os.getpid())):
            with self.subTest(value=value), self.assertRaises(SystemExit):
                parse_parent_pid(value)

    @patch("desktop_sidecar.yt_dlp.main")
    @patch("desktop_sidecar.start_parent_watchdog")
    def test_explicit_internal_flag_routes_to_bundled_ytdlp(self, watchdog, ytdlp_main):
        main([PACKAGED_YTDLP_FLAG, "--no-playlist", "--version"])

        watchdog.assert_called_once_with(None)
        ytdlp_main.assert_called_once_with(["--no-playlist", "--version"])


if __name__ == "__main__":
    unittest.main()
