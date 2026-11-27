"""Récupère les derniers articles des médias listés sur EKO via leurs flux RSS publics
et les écrit dans articles.json (lu par la section « À la une » de la page d'accueil).

On ne garde que le titre, le lien, le nom du média, la date et l'adresse de l'image
fournie par le flux : aucun extrait de texte n'est repris, et l'image n'est pas copiée
(elle reste hébergée chez le média).

Usage : python scripts/fetch_articles.py
"""
import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from xml.etree import ElementTree as ET

RACINE = Path(__file__).resolve().parent.parent
# Les flux viennent de medias.json (champ « rss »), modifiable depuis le back office admin.html.


def lire_flux():
    donnees = json.loads((RACINE / "medias.json").read_text(encoding="utf-8"))
    return [{"media": m["nom"], "url": m["rss"], "logo": m.get("logo")}
            for m in donnees.get("medias", []) if m.get("rss")]


PAR_MEDIA = 3      # articles gardés par média
TOTAL = 18         # articles gardés au total
SORTIE = RACINE / "articles.json"
USER_AGENT = "EKO-agregateur/1.0 (lecteur de flux RSS)"

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "media": "http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
    "dc": "http://purl.org/dc/elements/1.1/",
}
IMG_RE = re.compile(r"""<img[^>]+src=["']([^"']+)["']""", re.I)
TAG_RE = re.compile(r"<[^>]+>")


def texte(el):
    return (el.text or "").strip() if el is not None else ""


def nettoyer(s):
    return " ".join(html.unescape(TAG_RE.sub("", s)).split())


def url_sure(u):
    u = html.unescape((u or "").strip())
    return u if u.startswith(("https://", "http://")) else None


def lire_date(s):
    s = (s or "").strip()
    if not s:
        return None
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def image_item(item):
    for chemin in ("media:content", "media:thumbnail", "media:group/media:content"):
        for el in item.findall(chemin, NS):
            if el.get("url") and el.get("medium", "image") == "image":
                return url_sure(el.get("url"))
    for el in item.findall("enclosure"):
        if (el.get("type") or "").startswith("image/"):
            return url_sure(el.get("url"))
    for chemin in ("content:encoded", "description", "atom:content", "atom:summary"):
        m = IMG_RE.search(texte(item.find(chemin, NS)))
        if m:
            return url_sure(m.group(1))
    return None


def analyser(xml_bytes, flux):
    racine = ET.fromstring(xml_bytes)
    articles = []
    items = racine.findall("./channel/item") or racine.findall(".//item")
    if items:
        for it in items:
            articles.append({
                "titre": nettoyer(texte(it.find("title"))),
                "lien": url_sure(texte(it.find("link"))),
                "date": lire_date(texte(it.find("pubDate")) or texte(it.find("dc:date", NS))),
                "image": image_item(it),
            })
    else:  # Atom
        for e in racine.findall("atom:entry", NS):
            lien = next((l.get("href") for l in e.findall("atom:link", NS)
                         if l.get("rel", "alternate") == "alternate"), None)
            articles.append({
                "titre": nettoyer(texte(e.find("atom:title", NS))),
                "lien": url_sure(lien),
                "date": lire_date(texte(e.find("atom:published", NS)) or texte(e.find("atom:updated", NS))),
                "image": image_item(e),
            })
    resultat = []
    for a in articles:
        if not (a["titre"] and a["lien"]):
            continue
        a.update(media=flux["media"], logo=flux["logo"])
        resultat.append(a)
    resultat.sort(key=lambda a: a["date"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return resultat[:PAR_MEDIA]


def telecharger(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def main():
    tous, erreurs = [], 0
    for flux in lire_flux():
        try:
            arts = analyser(telecharger(flux["url"]), flux)
            print(f"OK   {flux['media']}: {len(arts)} article(s)")
            tous += arts
        except Exception as exc:  # un flux en panne ne doit pas bloquer les autres
            erreurs += 1
            print(f"ERR  {flux['media']}: {exc}", file=sys.stderr)

    if not tous:
        print("Aucun article récupéré : articles.json n'est pas modifié.", file=sys.stderr)
        return 1

    tous.sort(key=lambda a: a["date"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    tous = tous[:TOTAL]
    for a in tous:
        a["date"] = a["date"].isoformat() if a["date"] else None

    # On ne réécrit le fichier que si la liste d'articles a changé (évite un commit par heure).
    try:
        ancien = json.loads(SORTIE.read_text(encoding="utf-8")).get("articles")
    except (OSError, ValueError):
        ancien = None
    if ancien == tous:
        print("Aucun nouvel article.")
        return 0
    donnees = {"mis_a_jour": datetime.now(timezone.utc).isoformat(timespec="seconds"), "articles": tous}
    SORTIE.write_text(json.dumps(donnees, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(tous)} article(s) écrits dans {SORTIE.name} ({erreurs} flux en erreur).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
