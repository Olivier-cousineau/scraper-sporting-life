from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_HEADERS: Dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )
}


@dataclass
class HttpResponse:
    status_code: int
    text: str
    url: str

    def json(self) -> dict:
        return json.loads(self.text)


class HttpClient:
    """A tiny HTTP client built on top of :mod:`urllib`.

    The client is intentionally minimal to avoid external dependencies. It
    provides just enough ergonomics for the scraper while remaining easy to
    mock in tests.
    """

    def __init__(self, headers: Optional[Dict[str, str]] = None) -> None:
        self.headers = {**DEFAULT_HEADERS, **(headers or {})}

    def get(self, url: str, params: Optional[Dict[str, object]] = None) -> HttpResponse:
        request_url = self._with_query(url, params)
        request = Request(request_url, headers=self.headers)
        try:
            with urlopen(request) as response:  # type: ignore[call-arg]
                body = response.read()
                encoding = response.headers.get_content_charset("utf-8")
                text = body.decode(encoding)
                return HttpResponse(status_code=response.getcode(), text=text, url=request_url)
        except Exception as exc:  # pragma: no cover - thin wrapper over urllib
            raise RuntimeError(f"HTTP GET request to {request_url} failed: {exc}") from exc

    @staticmethod
    def _with_query(url: str, params: Optional[Dict[str, object]]) -> str:
        if not params:
            return url
        query_string = urlencode(params)
        separator = "&" if "?" in url else "?"
        return f"{url}{separator}{query_string}"
