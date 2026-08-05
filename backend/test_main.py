import socket
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from main import (
    DownloadRequest,
    TranscriptRequest,
    _ytdlp_base,
    get_transcript,
    start_download,
    validate_media_url,
    validate_proxy_url,
)


class MediaUrlValidationTests(unittest.TestCase):
    @patch("main.socket.getaddrinfo")
    def test_accepts_public_https_and_removes_fragment(self, getaddrinfo):
        getaddrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]

        self.assertEqual(
            validate_media_url(" HTTPS://Example.com/watch?v=1#private "),
            "https://example.com/watch?v=1",
        )

    def assert_rejected(self, value: str):
        with self.assertRaises(HTTPException):
            validate_media_url(value)

    def test_rejects_non_http_protocols(self):
        for value in ("file:///etc/passwd", "ftp://example.com/a", "javascript:alert(1)"):
            with self.subTest(value=value):
                self.assert_rejected(value)

    def test_rejects_credentials_and_local_targets(self):
        for value in (
            "https://user:secret@example.com/video",
            "http://localhost/video",
            "http://127.0.0.1/video",
            "http://169.254.169.254/latest/meta-data",
            "http://[::1]/video",
            "http://service.internal/video",
        ):
            with self.subTest(value=value):
                self.assert_rejected(value)

    @patch("main.socket.getaddrinfo")
    def test_rejects_hostname_resolving_to_private_address(self, getaddrinfo):
        getaddrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.10", 0))]

        self.assert_rejected("https://media.example/video")

    @patch("main.socket.getaddrinfo")
    def test_rejects_proxy_credentials(self, getaddrinfo):
        getaddrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]

        with self.assertRaises(HTTPException):
            validate_proxy_url("socks5://user:secret@proxy.example:1080")

    def test_mutating_requests_require_explicit_rights_confirmation(self):
        self.assertFalse(DownloadRequest(url="https://example.com/video").rights_confirmed)
        self.assertFalse(TranscriptRequest(url="https://example.com/video").rights_confirmed)
        with self.assertRaises(HTTPException) as download_error:
            start_download(DownloadRequest(url="https://example.com/video"))
        with self.assertRaises(HTTPException) as transcript_error:
            get_transcript(TranscriptRequest(url="https://example.com/video"))
        self.assertEqual(download_error.exception.status_code, 403)
        self.assertEqual(transcript_error.exception.status_code, 403)

    @patch.dict("main.os.environ", {}, clear=True)
    def test_remote_runtime_components_are_disabled_by_default(self):
        self.assertNotIn("--remote-components", _ytdlp_base())


if __name__ == "__main__":
    unittest.main()
