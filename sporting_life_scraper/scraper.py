from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Dict, List, Optional
from urllib.parse import urljoin

from .http_client import HttpClient


CONFIG_PATTERN = re.compile(r'siteId"\s*:\s*"(?P<site_id>[^"]+)"')
DOMAIN_PATTERN = re.compile(r'domain"\s*:\s*"(?P<domain>[^"]+)"')
COLLECTION_PATTERN = re.compile(r'collection"\s*:\s*"(?P<collection>[^"]+)"')


@dataclass
class Product:
    name: str
    url: str
    price: Optional[float]
    sale_price: Optional[float]
    image: Optional[str]
    raw: Dict[str, object]


class SportingLifeScraper:
    """Scrape liquidation products from Sporting Life using the Searchspring API."""

    def __init__(
        self,
        base_url: str = "https://www.sportinglife.ca/fr-CA/liquidation/",
        site_id: Optional[str] = None,
        collection: Optional[str] = None,
        results_per_page: int = 48,
        http_client: Optional[HttpClient] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.site_id = site_id
        self.collection = collection or "liquidation"
        self.results_per_page = results_per_page
        self.http = http_client or HttpClient()

    def discover_config(self) -> Dict[str, str]:
        """Pull configuration values embedded in the listing page."""
        response = self.http.get(self.base_url)
        html = response.text
        site_id = self.site_id or self._search(CONFIG_PATTERN, html)
        domain = self._search(DOMAIN_PATTERN, html) or "https://www.sportinglife.ca"
        collection = self.collection or self._search(COLLECTION_PATTERN, html) or "liquidation"
        if not site_id:
            raise RuntimeError("Impossible de déterminer l'identifiant Searchspring (siteId)")
        self.site_id = site_id
        self.collection = collection
        return {"site_id": site_id, "domain": domain, "collection": collection}

    def scrape(self) -> List[Product]:
        config = self.discover_config()
        api_url = self._build_api_url(config["site_id"])
        products: List[Product] = []
        page = 1
        total_pages: Optional[int] = None
        while True:
            payload = self._fetch_page(api_url, config, page)
            page_products = payload.get("results", [])
            for item in page_products:
                products.append(self._convert_product(config["domain"], item))
            pagination = payload.get("pagination", {})
            total_pages = pagination.get("totalPages") or total_pages
            if total_pages is None:
                if not page_products:
                    break
            if total_pages is not None and page >= total_pages:
                break
            page += 1
        return products

    def _fetch_page(self, api_url: str, config: Dict[str, str], page: int) -> Dict[str, object]:
        params = {
            "siteId": config["site_id"],
            "page": page,
            "resultsPerPage": self.results_per_page,
            "resultsFormat": "native",
            "domain": config["domain"],
            "bgfilter.collection": config["collection"],
        }
        response = self.http.get(api_url, params=params)
        if response.status_code >= 400:
            raise RuntimeError(f"Erreur {response.status_code} lors du chargement de la page {page}")
        return json.loads(response.text)

    def _convert_product(self, domain: str, payload: Dict[str, object]) -> Product:
        raw_url = payload.get("url") or ""
        url = urljoin(domain, str(raw_url))
        price = self._coerce_price(payload.get("price"))
        sale_price = self._coerce_price(payload.get("sale_price") or payload.get("salePrice"))
        image = payload.get("thumbnail_image") or payload.get("thumbnailImage")
        return Product(
            name=str(payload.get("name") or payload.get("title") or ""),
            url=url,
            price=price,
            sale_price=sale_price,
            image=str(image) if image else None,
            raw=payload,
        )

    @staticmethod
    def _coerce_price(value: Optional[object]) -> Optional[float]:
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _search(pattern: re.Pattern[str], text: str) -> Optional[str]:
        match = pattern.search(text)
        return match.group(1) if match else None

    def _build_api_url(self, site_id: str) -> str:
        return f"https://{site_id}.a.searchspring.io/api/search/search.json"


def scrape_liquidation(**kwargs: object) -> List[Product]:
    scraper = SportingLifeScraper(**kwargs)
    return scraper.scrape()
