import unittest
from unittest.mock import patch

from desktop_sidecar import PACKAGED_YTDLP_FLAG, main


class DesktopSidecarRoutingTests(unittest.TestCase):
    @patch("desktop_sidecar.yt_dlp.main")
    def test_explicit_internal_flag_routes_to_bundled_ytdlp(self, ytdlp_main):
        main([PACKAGED_YTDLP_FLAG, "--no-playlist", "--version"])

        ytdlp_main.assert_called_once_with(["--no-playlist", "--version"])


if __name__ == "__main__":
    unittest.main()
