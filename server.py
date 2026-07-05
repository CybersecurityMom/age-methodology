"""Local AGE development server with a controlled public-webpage reader."""

from __future__ import annotations

import ipaddress
import json
import os
import socket
import ssl
import subprocess
import tempfile
import threading
import time
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

import websocket

try:
    import certifi
except ImportError:  # The system certificate store remains the fallback.
    certifi = None

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "4173"))
MAX_RESPONSE_BYTES = 5 * 1024 * 1024
ROOT = Path(__file__).resolve().parent
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where() if certifi else None)
CHROME_PATHS = (
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
)
RENDER_BROWSER = next((path for path in CHROME_PATHS if path.exists()), None)
RENDER_LIMIT = threading.BoundedSemaphore(2)
EVIDENCE_IMAGE_TERMS = ("table", "chart", "figure", "audit", "assessment", "results", "metrics")
CHALLENGE_MARKERS = (
    "just a moment",
    "enable javascript and cookies to continue",
    "verification successful. waiting",
    "cdn-cgi/challenge-platform",
)


class EvidenceImageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.images: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "img":
            return
        values = {name.lower(): value or "" for name, value in attrs}
        label = " ".join((values.get("alt", ""), values.get("title", ""), values.get("aria-label", ""))).strip()
        source = values.get("src") or values.get("data-src")
        if source and any(term in label.lower() for term in EVIDENCE_IMAGE_TERMS):
            self.images.append({"src": source, "label": label or "Evidence image"})


def identify_evidence_images(html: str) -> list[dict[str, str]]:
    parser = EvidenceImageParser()
    parser.feed(html)
    return [{
        "label": image["label"],
        "text": "Image-based evidence was identified, but its exact rows were not readable. Upload the image or a CSV export for row-level analysis.",
    } for image in parser.images[:3]]


def is_access_challenge(content: str) -> bool:
    lowered = content.lower()
    return any(marker in lowered for marker in CHALLENGE_MARKERS)


def receive_cdp_response(connection, message_id: int, timeout: float = 20) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        message = json.loads(connection.recv())
        if message.get("id") == message_id:
            return message
    raise TimeoutError("The rendered page did not become ready in time.")


def render_with_browser(url: str) -> tuple[str, str]:
    if not RENDER_BROWSER:
        raise ValueError("A supported local rendering browser is not available.")

    with tempfile.TemporaryDirectory(prefix="age-render-") as profile:
        command = [
            str(RENDER_BROWSER),
            "--headless=new",
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-default-apps",
            "--disable-extensions",
            "--disable-gpu",
            "--disable-sync",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--remote-debugging-port=0",
            "--remote-allow-origins=*",
            f"--user-data-dir={profile}",
            "about:blank",
        ]
        process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        connection = None
        try:
            port_file = Path(profile) / "DevToolsActivePort"
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline and not port_file.exists():
                if process.poll() is not None:
                    raise ValueError("The rendered-page browser could not start.")
                time.sleep(0.1)
            if not port_file.exists():
                raise TimeoutError("The rendered-page browser did not start in time.")

            port = port_file.read_text(encoding="utf-8").splitlines()[0]
            new_tab_request = Request(f"http://127.0.0.1:{port}/json/new", method="PUT")
            with urlopen(new_tab_request, timeout=5) as response:
                target = json.loads(response.read().decode("utf-8"))

            connection = websocket.create_connection(
                target["webSocketDebuggerUrl"],
                timeout=25,
                origin=f"http://127.0.0.1:{port}",
            )
            connection.send(json.dumps({
                "id": 1,
                "method": "Page.navigate",
                "params": {"url": url},
            }))
            navigation = receive_cdp_response(connection, 1, timeout=8)
            if navigation.get("result", {}).get("errorText"):
                raise ValueError(f"Navigation failed: {navigation['result']['errorText']}")

            expression = """
                new Promise(resolve => {
                  const finish = () => setTimeout(() => resolve({
                    url: location.href,
                    html: document.documentElement.outerHTML
                  }), 5000);
                  if (document.readyState === 'complete') finish();
                  else addEventListener('load', finish, {once: true});
                })
            """
            message_id = 2
            connection.send(json.dumps({
                "id": message_id,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": expression,
                    "awaitPromise": True,
                    "returnByValue": True,
                },
            }))
            response = receive_cdp_response(connection, message_id, timeout=22)
            if response.get("result", {}).get("exceptionDetails"):
                description = response["result"]["exceptionDetails"].get("text", "Page evaluation failed.")
                raise ValueError(description)
            value = response.get("result", {}).get("result", {}).get("value")
            if not value or not value.get("html"):
                raise ValueError("The rendered page did not return readable HTML.")
            return value["html"], value["url"]
        finally:
            if connection:
                connection.close()
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()


def validate_public_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only complete HTTP or HTTPS URLs can be imported.")

    hostname = parsed.hostname.lower()
    if hostname == "localhost" or hostname.endswith(".local"):
        raise ValueError("Local network addresses cannot be imported.")

    try:
        addresses = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise ValueError("The webpage hostname could not be resolved.") from exc

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("Private or local network addresses cannot be imported.")
    return value


class AgeHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            payload = b'{"status":"ok"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            return
        if parsed.path == "/api/fetch-url":
            self.fetch_public_webpage(parse_qs(parsed.query).get("url", [""])[0])
            return
        if parsed.path == "/api/render-url":
            self.render_public_webpage(parse_qs(parsed.query).get("url", [""])[0])
            return
        if parsed.path == "/api/read-url":
            self.read_public_webpage(parse_qs(parsed.query).get("url", [""])[0])
            return
        super().do_GET()

    def fetch_public_webpage(self, url: str) -> None:
        try:
            validate_public_url(url)
            request = Request(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/126.0.0.0 Safari/537.36"
                    ),
                    "Accept": "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8",
                    "Accept-Language": "en-US,en;q=0.8",
                },
            )
            with urlopen(request, timeout=15, context=SSL_CONTEXT) as response:
                validate_public_url(response.geturl())
                content_type = response.headers.get_content_type()
                if content_type not in {"text/html", "application/xhtml+xml", "text/plain"}:
                    raise ValueError(f"Unsupported webpage content type: {content_type}.")
                body = response.read(MAX_RESPONSE_BYTES + 1)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise ValueError("The webpage is too large to import.")
                charset = response.headers.get_content_charset() or "utf-8"
                html = body.decode(charset, errors="replace")

            payload = json.dumps({"html": html, "sourceUrl": url}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
        except (ValueError, HTTPError, URLError, TimeoutError) as exc:
            message = getattr(exc, "reason", None) or str(exc)
            payload = json.dumps({"error": f"Unable to read this webpage: {message}"}).encode("utf-8")
            self.send_response(422)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)

    def render_public_webpage(self, url: str) -> None:
        try:
            validate_public_url(url)
            if not RENDER_BROWSER:
                raise ValueError("A supported local rendering browser is not available.")
            if not RENDER_LIMIT.acquire(blocking=False):
                raise ValueError("The rendered-page reader is busy. Try again in a moment.")
            try:
                html, final_url = render_with_browser(url)
            finally:
                RENDER_LIMIT.release()

            validate_public_url(final_url)
            encoded_html = html.encode("utf-8")
            if len(encoded_html) > MAX_RESPONSE_BYTES:
                raise ValueError("The rendered webpage is too large to import.")
            if is_access_challenge(html):
                raise ValueError("The website displayed an access-verification page instead of the document.")
            if len(html.strip()) < 200:
                raise ValueError("The rendered page did not contain enough readable content.")

            image_evidence = identify_evidence_images(html)
            payload = json.dumps({
                "html": html,
                "sourceUrl": url,
                "rendered": True,
                "imageEvidence": image_evidence,
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
        except (ValueError, TimeoutError, OSError, websocket.WebSocketException) as exc:
            payload = json.dumps({"error": f"Unable to render this webpage: {exc}"}).encode("utf-8")
            self.send_response(422)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)

    def read_public_webpage(self, url: str) -> None:
        """Use a public text reader only after the site's own readers are blocked."""
        try:
            validate_public_url(url)
            reader_url = f"https://r.jina.ai/{url}"
            request = Request(
                reader_url,
                headers={
                    "User-Agent": "AGE-Methodology/1.0 public-document-review",
                    "Accept": "text/plain,text/markdown;q=0.9",
                },
            )
            with urlopen(request, timeout=30, context=SSL_CONTEXT) as response:
                body = response.read(MAX_RESPONSE_BYTES + 1)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise ValueError("The readable document is too large to import.")
                text = body.decode(response.headers.get_content_charset() or "utf-8", errors="replace").strip()
            if len(text) < 200 or is_access_challenge(text):
                raise ValueError("The public text reader did not return enough readable document content.")

            payload = json.dumps({
                "text": text,
                "sourceUrl": url,
                "reader": "public text reader",
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
        except (ValueError, HTTPError, URLError, TimeoutError) as exc:
            message = getattr(exc, "reason", None) or str(exc)
            payload = json.dumps({"error": f"Unable to read this webpage: {message}"}).encode("utf-8")
            self.send_response(422)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), AgeHandler)
    print(f"AGE Methodology is available at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
