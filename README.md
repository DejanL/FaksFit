# FaksFit

Angular aplikacija za iskanje študijskih programov slovenskih visokošolskih zavodov po programih, zavodih, fakultetah, učiteljih in predmetih.

Objavljena aplikacija: [dejanl.github.io/FaksFit](https://dejanl.github.io/FaksFit/)

## Zagon

```bash
npm install
npm start
```

Aplikacija je nato na `http://localhost:4200`.

Za produkcijsko gradnjo uporabi:

```bash
npm run build
```

Vsebinske teste priporočilnega sistema za osem različnih študijskih profilov
zaženeš z:

```bash
npm test
```

Natančni odgovori in pričakovanja za ročni preizkus so opisani v
[`docs/testni-profili-priporocil.md`](docs/testni-profili-priporocil.md).

Za lokalni preizkus različice z GitHub Pages podpotjo uporabi:

```bash
npm run build:pages
npx http-server dist/faksfit/browser
```

Podatkovni vir je `data/slovenia-higher-education.json` in se ob gradnji samodejno kopira v izhodno mapo.

## Osvežitev podatkov

```bash
npm run refresh-data
```

Uvoz iz javnega API-ja NAKVIS ustvari tri datoteke:

- `data/slovenia-higher-education.json` z zavodi in študijskimi programi;
- `data/programme-teachers.json` z učitelji in njihovimi predmeti, indeksiranimi po ID-ju programa;
- `data/programme-performer-search.json` s kompaktnimi podatki za iskanje po učiteljih in predmetih v brskalniku.

Kompaktni iskalni vir lahko iz obstoječe datoteke z učitelji ponovno ustvariš z:

```bash
npm run build-search-data
```

Če NAKVIS za posamezen program ne ponuja seznama učiteljev, je program v drugi datoteki označen z `available: false`.

## Objava na GitHub Pages

Workflow `.github/workflows/pages.yml` ob vsakem pushu na vejo `main`:

1. namesti zaklenjene odvisnosti z `npm ci`;
2. zgradi aplikacijo z osnovno potjo `/FaksFit/`;
3. objavi vsebino mape `dist/faksfit/browser` na GitHub Pages.

V repozitoriju na GitHubu mora biti v `Settings → Pages → Build and deployment` kot vir izbran **GitHub Actions**.

## Podatki in pripis vira

Vir podatkov so javne evidence [NAKVIS](https://portal.nakvis.si/). Podatki so objavljeni pod pogoji licence CC BY 4.0; pripis vira je prikazan tudi v aplikaciji.
