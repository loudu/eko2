// Affiche les médias d'une page thème ou support à partir de medias.json
// (fichier modifié depuis le back office admin.html).
// La page indique ce qu'elle affiche : <div id="medias" data-theme="politique"> ou data-support="presse".

(function () {
    const conteneur = document.getElementById("medias");
    if (!conteneur) return;
    const [champ, valeur] = conteneur.dataset.theme
        ? ["themes", conteneur.dataset.theme]
        : ["supports", conteneur.dataset.support];

    const RESEAUX = [
        ["youtube", "img/Youtube.png", "YouTube"],
        ["x", "img/Twitter.png", "X (Twitter)"],
        ["instagram", "img/Instagram.png", "Instagram"],
    ];

    function urlSure(u) {
        return typeof u === "string" && /^https?:\/\//.test(u) ? u : null;
    }

    // Logo : image du site (img/...) ou adresse web
    function logoSur(u) {
        if (typeof u !== "string") return "img/E.png";
        return urlSure(u) || (/^img\/[^:]+$/.test(u) ? u : "img/E.png");
    }

    function el(tag, classe, texte) {
        const e = document.createElement(tag);
        if (classe) e.className = classe;
        if (texte) e.textContent = texte;
        return e;
    }

    function lien(href, enfant, label) {
        const a = el("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener";
        if (label) a.setAttribute("aria-label", label);
        a.append(enfant);
        return a;
    }

    function image(src, alt) {
        const i = el("img");
        i.src = src;
        i.alt = alt || "";
        return i;
    }

    function bloc(m) {
        const site = urlSure(m.site);
        const media = el("div", "media");
        const prez = el("div", "prez");
        const gauche = el("div", "prez__left");
        const droite = el("div", "prez__right");

        const logo = image(logoSur(m.logo), m.nom);
        gauche.append(site ? lien(site, logo, m.nom + " (nouvel onglet)") : logo);

        droite.append(el("p", "descripiton", m.description || ""));

        const boutons = el("div", "button-more");
        if (site) {
            const b = el("button");
            b.type = "button";
            b.append(lien(site, document.createTextNode("+ d'infos")));
            boutons.append(b);
        }
        if (Array.isArray(m.tags) && m.tags.length) {
            const tags = el("div", "tags");
            tags.append(el("span", "", "TAGS : "));
            m.tags.forEach((t) => {
                const b = el("button", "", t);
                b.type = "button";
                tags.append(b, " ");
            });
            boutons.append(tags);
        }
        droite.append(boutons);

        const rs = el("div", "rs");
        const reseaux = RESEAUX.filter(([cle]) => urlSure((m.reseaux || {})[cle]));
        if (reseaux.length) {
            const col = el("div", "column");
            const liens = el("div");
            reseaux.forEach(([cle, icone, nom]) => liens.append(lien(m.reseaux[cle], image(icone, nom), nom + " de " + m.nom), " "));
            col.append(el("span", "", "Réseaux sociaux : "), liens);
            rs.append(col);
        }
        const soutenir = urlSure(m.soutenir);
        if (soutenir) {
            const col = el("div", "column align-center");
            col.append(el("span", "", "Soutenir :"), lien(soutenir, image("img/Soutenir.png", "Soutenir " + m.nom)));
            rs.append(col);
        }
        droite.append(rs);

        prez.append(gauche, droite);
        media.append(prez);
        return media;
    }

    function vide() {
        conteneur.replaceChildren(el("p", "empty", "Aucun média pour l'instant"));
    }

    fetch("medias.json", { cache: "no-cache" })
        .then((r) => r.json())
        .then((d) => {
            const liste = (d.medias || []).filter((m) => (m[champ] || []).includes(valeur));
            if (!liste.length) return vide();
            conteneur.replaceChildren(...liste.map(bloc));
        })
        .catch(vide);
})();
