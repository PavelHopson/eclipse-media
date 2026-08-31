import socket
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from main import (
    DownloadRequest,
    InfoRequest,
    LocalEditStartRequest,
    TranscriptRequest,
    _build_download_command,
    _run_download,
    _ytdlp_base,
    format_ytdlp_error,
    get_info,
    get_transcript,
    is_recoverable_stream_rejection,
    jobs,
    local_edit_capability,
    local_edit_sources,
    parse_progress_line,
    parse_ytdlp_title_line,
    parse_ytdlp_phase_line,
    resolve_vk_external_url,
    run_ytdlp_info,
    sanitize_filename,
    start_download,
    validate_desktop_session_token,
    validate_media_url,
    validate_proxy_url,
    vk_resolve_cache,
)


class MediaUrlValidationTests(unittest.TestCase):
    def test_public_runtime_exposes_preview_only_and_rejects_export_sources(self):
        capability = local_edit_capability()["data"]
        self.assertFalse(capability["enabled"])
        self.assertEqual(capability["mode"], "preview-only")
        with self.assertRaises(HTTPException) as error:
            local_edit_sources()
        self.assertEqual(error.exception.status_code, 409)

    def test_local_edit_start_schema_rejects_unknown_worker_arguments(self):
        with self.assertRaises(ValidationError):
            LocalEditStartRequest(
                run_id="00000000-0000-4000-8000-000000000001",
                approval_token="x" * 43,
                plan_json="{}",
                ffmpeg=["-i", "http://127.0.0.1/private"],
            )

    def test_desktop_session_token_is_required_and_compared_exactly(self):
        expected = "A" * 43

        self.assertTrue(validate_desktop_session_token(expected, expected))
        self.assertFalse(validate_desktop_session_token(None, expected))
        self.assertFalse(validate_desktop_session_token("A" * 42, expected))
        self.assertFalse(validate_desktop_session_token(expected, ""))

    def setUp(self):
        vk_resolve_cache.clear()
        jobs.clear()

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
        command = _ytdlp_base()
        self.assertEqual(command[:3], [sys.executable, "-m", "yt_dlp"])
        self.assertNotIn("--remote-components", command)

    def test_youtube_runtime_is_pinned_with_local_ejs(self):
        requirements = Path(__file__).with_name("requirements.txt").read_text(encoding="utf-8")

        self.assertIn("yt-dlp[default]==2026.8.19", requirements)
        self.assertIn("yt-dlp-ejs==0.8.0", requirements)

    @patch.object(sys, "frozen", True, create=True)
    def test_packaged_sidecar_routes_ytdlp_through_its_explicit_entry_point(self):
        command = _ytdlp_base()

        self.assertEqual(command[:2], [sys.executable, "--eclipse-ytdlp"])
        self.assertNotIn("-m", command)
        self.assertNotIn("--remote-components", command)

    def test_archive_preset_uses_only_bounded_metadata_and_thumbnail_flags(self):
        command = _build_download_command(
            "https://example.com/video", "downloads/job.%(ext)s", "video", "137",
            "mp3", "best", None, "archive", "none", "en",
        )
        self.assertIn("--embed-metadata", command)
        self.assertIn("--embed-thumbnail", command)
        self.assertIn("--convert-thumbnails", command)
        self.assertNotIn("--write-subs", command)
        self.assertEqual(command[-1], "https://example.com/video")

    def test_selected_video_format_falls_back_to_combined_stream(self):
        command = _build_download_command(
            "https://example.com/video", "downloads/job.%(ext)s", "video", "vk-1080",
            "mp3", "best", None, "standard", "none", "en",
        )
        self.assertEqual(command[command.index("-f") + 1], "vk-1080+bestaudio/vk-1080/best")

    def test_download_command_reports_the_actual_extractor_title_after_processing(self):
        command = _build_download_command(
            "https://example.com/video", "downloads/job.%(ext)s", "video", None,
            "mp3", "best", None, "standard", "none", "en",
        )

        print_values = [command[index + 1] for index, value in enumerate(command) if value == "--print"]
        self.assertEqual(print_values, [
            "before_dl:__ECLIPSE_MEDIA_PHASE__:downloading",
            "post_process:__ECLIPSE_MEDIA_PHASE__:processing",
            "after_move:__ECLIPSE_MEDIA_TITLE__:%(title)j",
        ])
        self.assertIn("--progress", command)
        self.assertEqual(parse_ytdlp_title_line('__ECLIPSE_MEDIA_TITLE__:"Второй ролик"'), "Второй ролик")
        self.assertIsNone(parse_ytdlp_title_line('__ECLIPSE_MEDIA_TITLE__:{"unexpected":true}'))
        self.assertEqual(parse_ytdlp_phase_line("__ECLIPSE_MEDIA_PHASE__:processing"), "processing")
        self.assertIsNone(parse_ytdlp_phase_line("__ECLIPSE_MEDIA_PHASE__:unknown"))

    def test_hls_progress_exposes_fragments_without_claiming_unknown_eta(self):
        parsed = parse_progress_line(
            "[download]   0.4% of ~   2.07GiB at    1.75MiB/s ETA Unknown (frag 10/2106)"
        )

        self.assertEqual(parsed["percent"], 0.5)
        self.assertEqual(parsed["speed"], "1.75MiB/s")
        self.assertEqual(parsed["fragment_current"], 10)
        self.assertEqual(parsed["fragment_total"], 2106)
        self.assertNotIn("eta", parsed)

    def test_consecutive_downloads_keep_distinct_safe_source_names(self):
        first = sanitize_filename(
            parse_ytdlp_title_line('__ECLIPSE_MEDIA_TITLE__:"Первый ролик"') or "",
            ".mp4",
        )
        second = sanitize_filename(
            parse_ytdlp_title_line('__ECLIPSE_MEDIA_TITLE__:"Второй ролик"') or "",
            ".mp4",
        )

        self.assertEqual(first, "Первый ролик.mp4")
        self.assertEqual(second, "Второй ролик.mp4")
        self.assertNotEqual(first, second)
        self.assertEqual(sanitize_filename("NUL", ".mp4"), "download-NUL.mp4")
        self.assertEqual(sanitize_filename("bad\x00name\n", ".mp4"), "badname.mp4")

    @patch("main.subprocess.Popen")
    def test_completed_download_uses_actual_title_instead_of_stale_client_title(self, popen):
        job_id = "a" * 32
        process = MagicMock()

        def output_lines():
            yield "__ECLIPSE_MEDIA_PHASE__:downloading\n"
            yield "[download] 10.0% of ~ 1.00GiB at 1.00MiB/s ETA Unknown (frag 10/100)\n"
            self.assertEqual(jobs[job_id]["progress"], 10.0)
            yield "[download] 100% of 1.00MiB at 1.00MiB/s ETA 00:00\n"
            self.assertEqual(jobs[job_id]["progress"], 10.0)
            yield "__ECLIPSE_MEDIA_PHASE__:processing\n"
            self.assertEqual(jobs[job_id]["progress"], 100.0)
            yield '__ECLIPSE_MEDIA_TITLE__:"Второй ролик"\n'

        process.stdout = output_lines()
        process.returncode = 0
        popen.return_value = process

        with tempfile.TemporaryDirectory() as temp_dir, patch("main.DOWNLOAD_DIR", temp_dir):
            Path(temp_dir, f"{job_id}.mp4").write_bytes(b"test")
            jobs[job_id] = {
                "status": "downloading",
                "phase": "preparing",
                "progress": 0.0,
                "speed": "",
                "eta": "",
                "fragment_current": None,
                "fragment_total": None,
                "file": None,
                "filename": None,
                "error": None,
                "process": None,
            }

            _run_download(job_id, "https://example.com/second", "video", None, "Первый ролик")

            self.assertEqual(jobs[job_id]["filename"], "Второй ролик.mp4")
            self.assertEqual(jobs[job_id]["status"], "done")
            self.assertEqual(jobs[job_id]["phase"], "finalizing")
            jobs.pop(job_id, None)

    def test_download_errors_are_actionable_and_do_not_echo_untrusted_output(self):
        secret_url = "https://media.example/video?token=do-not-expose"
        self.assertEqual(
            format_ytdlp_error([f"ERROR: HTTP Error 403: Forbidden {secret_url}"]),
            "Источник отклонил основной и совместимый потоки (HTTP 403). Попробуйте меньшее качество или другой публичный источник.",
        )
        self.assertNotIn("token", format_ytdlp_error([f"ERROR: unknown {secret_url}"]))
        self.assertIn("прямую ссылку", format_ytdlp_error(["Unable to extract cursor data"]))
        self.assertIn("не найдено", format_ytdlp_error([f"HTTP Error 404: Not Found {secret_url}"]))
        self.assertIn("TLS-сертификат", format_ytdlp_error(["CERTIFICATE_VERIFY_FAILED"]))

    def test_compatible_stream_recovery_is_bounded_and_prefers_hls(self):
        command = _build_download_command(
            "https://example.com/video", "downloads/job.%(ext)s", "video", "vk-720",
            "mp3", "best", None, "standard", "none", "en",
            format_height=720,
            compatible_stream=True,
        )

        selector = command[command.index("-f") + 1]
        self.assertTrue(selector.startswith("best[height<=720][protocol^=m3u8]"))
        self.assertIn("bestvideo[height<=720]+bestaudio", selector)
        self.assertNotIn("vk-720", selector)
        self.assertNotIn("--cookies", command)
        self.assertNotIn("--username", command)
        self.assertEqual(command[-1], "https://example.com/video")

    def test_stream_recovery_never_retries_authentication_failures(self):
        self.assertTrue(is_recoverable_stream_rejection(["ERROR: HTTP Error 403: Forbidden"]))
        self.assertFalse(is_recoverable_stream_rejection([
            "ERROR: HTTP Error 403: Forbidden; login required; pass cookies",
        ]))
        self.assertFalse(is_recoverable_stream_rejection(["ERROR: HTTP Error 404: Not Found"]))

    @patch("main.subprocess.Popen")
    def test_download_retries_one_403_with_bounded_compatible_stream(self, popen):
        job_id = "b" * 32
        first = MagicMock()
        first.stdout = iter(["ERROR: HTTP Error 403: Forbidden\n"])
        first.returncode = 1

        second = MagicMock()
        second.returncode = 0

        with tempfile.TemporaryDirectory() as temp_dir, patch("main.DOWNLOAD_DIR", temp_dir):
            def recovered_output():
                Path(temp_dir, f"{job_id}.mp4").write_bytes(b"recovered")
                yield "__ECLIPSE_MEDIA_PHASE__:downloading\n"
                yield "[download] 100.0% of 1.00MiB at 1.00MiB/s ETA 00:00\n"
                yield '__ECLIPSE_MEDIA_TITLE__:"Восстановленный ролик"\n'

            second.stdout = recovered_output()
            popen.side_effect = [first, second]
            jobs[job_id] = {
                "status": "downloading",
                "phase": "preparing",
                "progress": 0.0,
                "speed": "",
                "eta": "",
                "fragment_current": None,
                "fragment_total": None,
                "file": None,
                "filename": None,
                "error": None,
                "process": None,
            }

            _run_download(
                job_id, "https://example.com/video", "video", "vk-720", "",
                format_height=720,
            )

            self.assertEqual(popen.call_count, 2)
            recovery_command = popen.call_args_list[1].args[0]
            recovery_selector = recovery_command[recovery_command.index("-f") + 1]
            self.assertIn("height<=720", recovery_selector)
            self.assertIn("protocol^=m3u8", recovery_selector)
            self.assertEqual(jobs[job_id]["status"], "done")
            self.assertEqual(jobs[job_id]["filename"], "Восстановленный ролик.mp4")
            jobs.pop(job_id, None)

    @patch("main.time.sleep")
    @patch("main.subprocess.run")
    def test_info_retries_one_transient_extractor_failure(self, run, sleep):
        run.side_effect = [
            SimpleNamespace(returncode=1, stdout="", stderr="ERROR: temporary extractor failure"),
            SimpleNamespace(returncode=0, stdout='{"id":"video"}', stderr=""),
        ]

        result = run_ytdlp_info([sys.executable, "-m", "yt_dlp", "-j", "https://example.com/video"])

        self.assertEqual(result.returncode, 0)
        self.assertEqual(run.call_count, 2)
        sleep.assert_called_once_with(0.35)

    @patch("main.time.sleep")
    @patch("main.subprocess.run")
    def test_info_does_not_retry_permanent_source_failure(self, run, sleep):
        run.return_value = SimpleNamespace(returncode=1, stdout="", stderr="ERROR: Unsupported URL")

        result = run_ytdlp_info([sys.executable, "-m", "yt_dlp", "-j", "https://example.com/video"])

        self.assertEqual(result.returncode, 1)
        run.assert_called_once()
        sleep.assert_not_called()

    def test_tls_verification_is_never_disabled(self):
        command = _build_download_command(
            "https://example.com/video", "downloads/job.%(ext)s", "video", None,
            "mp3", "best", None, "standard", "none", "en",
        )
        self.assertNotIn("--no-check-certificates", command)
        self.assertNotIn("--no-check-certificate", command)

    @patch("main._fetch_vk_video_item")
    @patch("main._fetch_vk_guest_token", return_value="anonym.test-token")
    def test_resolves_public_vk_external_ok_video_without_cookies(self, guest_token, video_item):
        video_item.return_value = {
            "platform": "ok.ru",
            "files": {"external": "https://ok.ru/videoembed/1903142701709?temporary=removed"},
        }

        resolved = resolve_vk_external_url("https://vkvideo.ru/video-168673382_456239188")

        self.assertEqual(resolved, "https://ok.ru/videoembed/1903142701709")
        guest_token.assert_called_once_with(None)
        video_item.assert_called_once_with("anonym.test-token", "-168673382_456239188", None)

    @patch("main._fetch_vk_video_item")
    @patch("main._fetch_vk_guest_token", return_value="anonym.test-token")
    def test_vk_resolver_rejects_untrusted_external_urls(self, _guest_token, video_item):
        original = "https://vk.com/video-1_2"

        for external in (
            "https://attacker.example/video/123",
            "https://user:password@ok.ru/videoembed/123",
            "http://ok.ru/videoembed/123",
        ):
            with self.subTest(external=external):
                video_item.return_value = {"files": {"external": external}}
                self.assertEqual(resolve_vk_external_url(original), original)

    @patch("main._fetch_vk_guest_token")
    def test_vk_resolver_does_not_touch_channels_or_bypass_socks_proxy(self, guest_token):
        channel = "https://vkvideo.ru/@akari_group/all"
        direct = "https://vkvideo.ru/video-168673382_456239188"

        self.assertEqual(resolve_vk_external_url(channel), channel)
        self.assertEqual(resolve_vk_external_url(direct, "socks5://proxy.example:1080"), direct)
        guest_token.assert_not_called()

    @patch("main.subprocess.run")
    @patch("main.socket.getaddrinfo")
    def test_info_error_does_not_expose_source_query_tokens(self, getaddrinfo, run):
        getaddrinfo.return_value = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
        run.return_value = SimpleNamespace(
            returncode=1,
            stdout="",
            stderr="ERROR: HTTP Error 403 https://media.example/video?token=do-not-expose",
        )

        with self.assertRaises(HTTPException) as error:
            get_info(InfoRequest(url="https://media.example/video?token=do-not-expose"))

        self.assertNotIn("token", str(error.exception.detail))
        self.assertIn("HTTP 403", str(error.exception.detail))

    def test_subtitle_modes_are_explicit_and_language_is_a_single_argument(self):
        manual = _build_download_command(
            "https://example.com/video", "downloads/job.%(ext)s", "video", None,
            "mp3", "best", None, "standard", "manual", "ru",
        )
        automatic = _build_download_command(
            "https://example.com/video", "downloads/job.%(ext)s", "video", None,
            "mp3", "best", None, "standard", "auto", "en-US",
        )
        self.assertIn("--write-subs", manual)
        self.assertNotIn("--write-auto-subs", manual)
        self.assertIn("--write-auto-subs", automatic)
        self.assertEqual(automatic[automatic.index("--sub-langs") + 1], "en-US")

    def test_rejects_subtitle_argument_injection_and_audio_subtitles(self):
        with self.assertRaises(HTTPException):
            start_download(DownloadRequest(
                url="https://example.com/video", rights_confirmed=True,
                subtitle_mode="manual", subtitle_lang="en,--exec",
            ))
        with self.assertRaises(HTTPException):
            start_download(DownloadRequest(
                url="https://example.com/audio", rights_confirmed=True,
                format="audio", subtitle_mode="auto",
            ))

    def test_rejects_unknown_cli_like_fields(self):
        with self.assertRaises(ValidationError):
            DownloadRequest(
                url="https://example.com/video",
                rights_confirmed=True,
                custom_arguments="--exec calc",
            )


if __name__ == "__main__":
    unittest.main()
