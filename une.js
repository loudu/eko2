// Section « À la une » : affiche les derniers articles (articles.json, mis à jour
// par scripts/fetch_articles.py) dans 3 cartes, chacune avec ses flèches.

(function () {
    const NB_CARTES = 3;
    const conteneur = document.getElementById("une");
    if (!conteneur) return;

    const CHEVRON = {
        prec: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        suiv: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4 8 8-8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    };

    // Exemple affiché tant qu'aucun article n'a été récupéré
    const EXEMPLE = { titre: "Titre de l'article", media: "Nom du média", image: "img/social-media-3758364_1920.jpg" };

    function urlSure(u) {
        return typeof u === "string" && /^https?:\/\//.test(u) ? u : null;
    }

    function element(tag, classe) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        return el;
    }

    function creerCarte(liste) {
        let index = 0;
        const slot = element("div", "une__slot");
        const carte = element("a", "une__carte");
        const image = element("img", "une__image");
        const titre = element("span", "une__titre");
        const media = element("span", "une__media");
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        carte.append(image, titre, media);

        const prec = element("button", "une__fleche une__fleche--prec");
        const suiv = element("button", "une__fleche une__fleche--suiv");
        prec.type = suiv.type = "button";
        prec.setAttribute("aria-label", "Article précédent");
        suiv.setAttribute("aria-label", "Article suivant");
        prec.innerHTML = CHEVRON.prec;
        suiv.innerHTML = CHEVRON.suiv;
        prec.hidden = suiv.hidden = liste.length < 2;

        function afficherLogo(article) {
            image.onerror = null;
            image.src = article.logo || "img/E.png";
            image.classList.add("une__image--logo");
        }

        function afficher() {
            const article = liste[index];
            titre.textContent = article.titre;
            media.textContent = article.media;
            if (article.date) titre.title = new Date(article.date).toLocaleDateString("fr-FR", { dateStyle: "long" });

            image.classList.remove("une__image--logo");
            const src = article.image && (article.image.startsWith("img/") ? article.image : urlSure(article.image));
            if (src) {
                image.onerror = () => afficherLogo(article);
                image.src = src;
            } else {
                afficherLogo(article);
            }

            const lien = urlSure(article.lien);
            if (lien) {
                carte.href = lien;
                carte.target = "_blank";
                carte.rel = "noopener";
                carte.setAttribute("aria-label", article.titre + " — " + article.media + " (nouvel onglet)");
            } else {
                carte.removeAttribute("href");
            }
        }

        prec.addEventListener("click", () => { index = (index - 1 + liste.length) % liste.length; afficher(); });
        suiv.addEventListener("click", () => { index = (index + 1) % liste.length; afficher(); });

        afficher();
        slot.append(carte, prec, suiv);
        return slot;
    }

    function rendre(articles) {
        if (!articles.length) articles = Array(NB_CARTES * 2).fill(EXEMPLE); // 2 par carte pour montrer les flèches
        for (let i = 0; i < NB_CARTES; i++) {
            // Carte 1 : articles 1, 4, 7… ; carte 2 : 2, 5, 8… ; carte 3 : 3, 6, 9…
            const liste = articles.filter((_, k) => k % NB_CARTES === i);
            if (liste.length) conteneur.appendChild(creerCarte(liste));
        }
    }

    fetch("articles.json", { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : { articles: [] }))
        .then((d) => rendre(Array.isArray(d.articles) ? d.articles : []))
        .catch(() => rendre([]));
})();
