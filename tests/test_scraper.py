from __future__ import annotations

import json
import unittest
from typing import Dict, List

from sporting_life_scraper.scraper import SportingLifeScraper
from sporting_life_scraper.http_client import HttpResponse


class FakeHttpClient:
    def __init__(self, responses: Dict[str, List[HttpResponse]]):
        self.responses = responses
        self.calls: List[str] = []

    def get(self, url: str, params=None) -> HttpResponse:  # type: ignore[override]
        key = url
        if params:
            key = f"{url}?{json.dumps(params, sort_keys=True)}"
        self.calls.append(key)
        try:
            return self.responses[key].pop(0)
        except (KeyError, IndexError):
            raise AssertionError(f"Unexpected request for {key}")


class SportingLifeScraperTests(unittest.TestCase):
    def test_discovers_config_from_listing_page(self) -> None:
        html = '<script>var config = {"siteId":"sc-test","domain":"https://www.sportinglife.ca","collection":"liquidation"};</script>'
        responses = {
            "https://www.sportinglife.ca/fr-CA/liquidation/": [
                HttpResponse(status_code=200, text=html, url="https://www.sportinglife.ca/fr-CA/liquidation/")
            ],
            "https://sc-test.a.searchspring.io/api/search/search.json?{\"bgfilter.collection\": \"liquidation\", \"domain\": \"https://www.sportinglife.ca\", \"page\": 1, \"resultsFormat\": \"native\", \"resultsPerPage\": 2, \"siteId\": \"sc-test\"}": [
                HttpResponse(
                    status_code=200,
                    text=json.dumps(
                        {
                            "pagination": {"totalPages": 1},
                            "results": [
                                {"name": "Veste", "url": "/p/1", "price": "100", "sale_price": "50"},
                                {"name": "Bottes", "url": "/p/2", "price": "80", "sale_price": "40"},
                            ],
                        }
                    ),
                    url="",
                )
            ],
        }
        scraper = SportingLifeScraper(results_per_page=2, http_client=FakeHttpClient(responses))
        products = scraper.scrape()

        self.assertEqual(len(products), 2)
        self.assertEqual(products[0].name, "Veste")
        self.assertEqual(products[0].sale_price, 50.0)
        self.assertIn("sc-test", scraper._build_api_url("sc-test"))

    def test_paginates_until_no_results(self) -> None:
        html = '<script>var config = {"siteId":"sc-test","domain":"https://www.sportinglife.ca","collection":"liquidation"};</script>'
        base_listing = "https://www.sportinglife.ca/fr-CA/liquidation/"
        api = "https://sc-test.a.searchspring.io/api/search/search.json"
        responses = {
            base_listing: [HttpResponse(status_code=200, text=html, url=base_listing)],
            f"{api}?{json.dumps({'bgfilter.collection': 'liquidation', 'domain': 'https://www.sportinglife.ca', 'page': 1, 'resultsFormat': 'native', 'resultsPerPage': 1, 'siteId': 'sc-test'}, sort_keys=True)}": [
                HttpResponse(
                    status_code=200,
                    text=json.dumps({"pagination": {"totalPages": 2}, "results": [{"name": "A", "url": "/p/1"}]}),
                    url=api,
                )
            ],
            f"{api}?{json.dumps({'bgfilter.collection': 'liquidation', 'domain': 'https://www.sportinglife.ca', 'page': 2, 'resultsFormat': 'native', 'resultsPerPage': 1, 'siteId': 'sc-test'}, sort_keys=True)}": [
                HttpResponse(status_code=200, text=json.dumps({"results": []}), url=api)
            ],
        }
        scraper = SportingLifeScraper(results_per_page=1, http_client=FakeHttpClient(responses))

        products = scraper.scrape()

        self.assertEqual(len(products), 1)
        self.assertEqual(products[0].name, "A")


if __name__ == "__main__":
    unittest.main()
