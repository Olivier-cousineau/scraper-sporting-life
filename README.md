# Sporting Life - Scraper Liquidation

Ce dépôt fournit un petit scraper Python pour récupérer toutes les offres de la page liquidation de Sporting Life (magasin de Laval incluse) en simulant les clics sur « Voir plus / Load more ». Le scraper s'appuie sur l'API Searchspring utilisée par le site pour paginer les résultats.

## Fonctionnement

1. Le scraper charge la page `https://www.sportinglife.ca/fr-CA/liquidation/` et extrait automatiquement l'identifiant Searchspring (`siteId`) et le domaine nécessaires aux appels API.
2. Il enchaîne ensuite les requêtes API successives (`page=1,2,…`) jusqu'à ce qu'il n'y ait plus de résultats.
3. Les produits collectés peuvent être exportés en JSON ou en CSV.

## Utilisation rapide

```bash
python -m sporting_life_scraper.cli --output data/liquidation.json --format json
# ou en CSV
python -m sporting_life_scraper.cli --output data/liquidation.csv --format csv
```

### Localisation des magasins Sporting Life

Le dépôt contient également un petit script Node/Playwright permettant de récupérer les informations des magasins (nom, adresse,
 téléphone, heures d'ouverture). Il tente d'extraire les données depuis la page officielle du localisateur et retombe sur la
 liste fournie ci-dessous en cas de blocage réseau.

```bash
npm run scrape:locations
# ou
node scrape_sportinglife_locations.mjs
```

Les données normalisées sont sauvegardées dans `data/sportinglife_locations.json`.

Options disponibles :

- `--results-per-page` : nombre de produits par page lors des appels à l'API (48 par défaut).
- `--site-id` : forcer un `siteId` Searchspring si la détection automatique échoue.
- `--collection` : filtre de collection à utiliser (par défaut `liquidation`).
- `--base-url` : URL de la page liquidation si elle change.

Les fichiers sont écrits dans `data/` par défaut. Aucune dépendance externe n'est requise : le scraper utilise uniquement la bibliothèque standard Python.

## Tests

Lancer la suite de tests unitaires (elles utilisent un client HTTP fictif, pas d'appels réseau) :

```bash
python -m unittest
```

## Workflow GitHub Actions

Le workflow `.github/workflows/scrape.yml` déclenche le scraper manuellement ou chaque jour à 6h UTC. Il sauvegarde les résultats JSON en tant qu'artefact de build.
