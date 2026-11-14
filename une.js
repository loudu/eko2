// Section « À la une » : affiche les derniers articles (articles.json, mis à jour
// par scripts/fetch_articles.py) dans un carrousel. Les flèches de chaque côté
// de la section font défiler les articles d'une carte à la fois.

(function () {
    const section = document.querySelector(".une");
    const piste = document.getElementById("une");
    if (!section || !piste) return;
    const fenetre = section.querySelector(".une__fenetre");
    const prec = section.querySelector(".une__fleche--prec");
    const suiv = section.querySelector(".une__fleche--suiv");

    // Exemple affiché tant qu'aucun article n'a été récupéré
    const EXEMPLE = { titre: "Titre de l'article", media: "Nom du média", image: "img/social-media-3758364_1920.jpg" };

    let cartes = [];
    let index = 0;

    function urlSure(u) {
        return typeof u === "string" && /^https?:\/\//.test(u) ? u : null;
    }

    function element(tag, classe) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        return el;
    }

    function creerCarte(article) {
        const carte = element("a", "une__carte");
        const image = element("img", "une__image");
        const titre = element("span", "une__titre");
        const media = element("span", "une__media");
        titre.textContent = article.titre;
        media.textContent = article.media;
        if (article.date) titre.title = new Date(article.date).toLocaleDateString("fr-FR", { dateStyle: "long" });

        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        const logo = () => {
            image.onerror = null;
            image.src = article.logo || "img/E.png";
            image.classList.add("une__image--logo");
        };
        const src = article.image && (article.image.startsWith("img/") ? article.image : urlSure(article.image));
        if (src) {
            image.onerror = logo;
            image.src = src;
        } else {
            logo();
        }

        const lien = urlSure(article.lien);
        if (lien) {
            carte.href = lien;
            carte.target = "_blank";
            carte.rel = "noopener";
            carte.setAttribute("aria-label", article.titre + " — " + article.media + " (nouvel onglet)");
        }
        carte.append(image, titre, media);
        return carte;
    }

    function visibles() {
        return parseInt(getComputedStyle(section).getPropertyValue("--visibles"), 10) || 1;
    }

    function maxIndex() {
        return Math.max(0, cartes.length - visibles());
    }

    function afficher() {
        index = Math.min(index, maxIndex());
        const pas = cartes.length > 1 ? cartes[1].offsetLeft - cartes[0].offsetLeft : 0;
        piste.style.transform = "translateX(" + (-index * pas) + "px)";

        // Les cartes hors de l'écran ne doivent pas être atteintes au clavier
        const n = visibles();
        cartes.forEach((c, i) => {
            const cachee = i < index || i >= index + n;
            c.tabIndex = cachee ? -1 : 0;
            c.setAttribute("aria-hidden", cachee ? "true" : "false");
        });
        prec.hidden = suiv.hidden = maxIndex() === 0;
    }

    // Défilement en boucle : après le dernier article, on revient au premier
    function aller(sens) {
        const max = maxIndex();
        index = sens > 0 ? (index >= max ? 0 : index + 1) : (index <= 0 ? max : index - 1);
        afficher();
    }

    prec.addEventListener("click", () => aller(-1));
    suiv.addEventListener("click", () => aller(1));
    window.addEventListener("resize", afficher);

    // Balayage au doigt sur mobile
    let departX = null;
    fenetre.addEventListener("touchstart", (e) => { departX = e.touches[0].clientX; }, { passive: true });
    fenetre.addEventListener("touchend", (e) => {
        if (departX === null) return;
        const dx = e.changedTouches[0].clientX - departX;
        if (Math.abs(dx) > 40) aller(dx < 0 ? 1 : -1);
        departX = null;
    });

    function rendre(articles) {
        if (!articles.length) articles = Array(6).fill(EXEMPLE);
        cartes = articles.map(creerCarte);
        piste.append(...cartes);
        afficher();
    }

    fetch("articles.json", { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : { articles: [] }))
        .then((d) => rendre(Array.isArray(d.articles) ? d.articles : []))
        .catch(() => rendre([]));
})();
