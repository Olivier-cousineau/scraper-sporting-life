from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import List

from .scraper import SportingLifeScraper, Product


def export_json(products: List[Product], output: Path) -> None:
    data = [product.__dict__ for product in products]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def export_csv(products: List[Product], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(
            csvfile,
            fieldnames=["name", "url", "price", "sale_price", "image"],
        )
        writer.writeheader()
        for product in products:
            writer.writerow(
                {
                    "name": product.name,
                    "url": product.url,
                    "price": product.price,
                    "sale_price": product.sale_price,
                    "image": product.image,
                }
            )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Scraper Sporting Life - Liquidation",
    )
    parser.add_argument(
        "--output",
        default="data/liquidation.json",
        help="Chemin du fichier de sortie (json ou csv)",
    )
    parser.add_argument(
        "--format",
        choices=["json", "csv"],
        default="json",
        help="Format de sortie",
    )
    parser.add_argument(
        "--results-per-page",
        type=int,
        default=48,
        help="Nombre d'articles par page pour les appels API",
    )
    parser.add_argument(
        "--site-id",
        dest="site_id",
        help="Identifiant Searchspring (détection automatique par défaut)",
    )
    parser.add_argument(
        "--collection",
        default="liquidation",
        help="Filtre de collection Searchspring",
    )
    parser.add_argument(
        "--base-url",
        default="https://www.sportinglife.ca/fr-CA/liquidation/",
        help="URL de la page liquidation",
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    scraper = SportingLifeScraper(
        base_url=args.base_url,
        site_id=args.site_id,
        collection=args.collection,
        results_per_page=args.results_per_page,
    )
    products = scraper.scrape()

    output = Path(args.output)
    if args.format == "json":
        export_json(products, output)
    else:
        export_csv(products, output)

    print(f"{len(products)} produits sauvegardés dans {output}")


if __name__ == "__main__":
    main()
