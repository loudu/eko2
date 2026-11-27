// Back office EKO : ajoute, modifie et supprime les médias de medias.json
// en enregistrant directement dans le dépôt GitHub (API « contents »).

(function () {
    "use strict";

    const API = "https://api.github.com";
    const FICHIER = "medias.json";
    const DOSSIER_LOGOS = "img/medias";
    const TAILLE_MAX_LOGO = 1024 * 1024;
    const CLE_STOCKAGE = "eko-admin";

    const $ = (sel) => document.querySelector(sel);

    let config = null;   // { depot, branche, jeton }
    let donnees = null;  // contenu de medias.json
    let sha = null;      // version de medias.json sur GitHub
    let enEdition = null; // id du média modifié (null = ajout)
    let tags = [];       // tags du formulaire
    let urlApercu = null;

    // ---------- Utilitaires ----------

    function versBase64(octets) {
        let binaire = "";
        for (let i = 0; i < octets.length; i += 0x8000) {
            binaire += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
        }
        return btoa(binaire);
    }

    function texteVersBase64(texte) {
        return versBase64(new TextEncoder().encode(texte));
    }

    function base64VersTexte(b64) {
        const binaire = atob(b64.replace(/\s/g, ""));
        const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(octets);
    }

    function identifiant(nom) {
        const base = nom.normalize("NFD").replace(/[̀-ͯ]/g, "")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "media";
        let id = base;
        let n = 2;
        while (donnees.medias.some((m) => m.id === id && m.id !== enEdition)) id = base + "-" + n++;
        return id;
    }

    function urlValide(u) {
        return u === "" || /^https?:\/\/[^\s]+\.[^\s]+$/.test(u);
    }

    function element(tag, classe, texte) {
        const e = document.createElement(tag);
        if (classe) e.className = classe;
        if (texte !== undefined) e.textContent = texte;
        return e;
    }

    let minuteur = null;
    function message(texte, erreur) {
        const m = $("#message");
        m.textContent = texte;
        m.classList.toggle("erreur-msg", !!erreur);
        m.classList.add("visible");
        clearTimeout(minuteur);
        minuteur = setTimeout(() => m.classList.remove("visible"), erreur ? 7000 : 4000);
    }

    function stockage(persistant) {
        try {
            return persistant ? localStorage : sessionStorage;
        } catch (e) {
            return null;
        }
    }

    // ---------- API GitHub ----------

    async function github(chemin, options) {
        const reponse = await fetch(API + "/repos/" + config.depot + "/contents/" + encodeURI(chemin) + (options ? "" : "?ref=" + encodeURIComponent(config.branche) + "&t=" + Date.now()), {
            method: options ? options.method : "GET",
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: "Bearer " + config.jeton,
                "X-GitHub-Api-Version": "2022-11-28",
            },
            body: options ? JSON.stringify(options.corps) : undefined,
        });
        if (!reponse.ok) {
            const err = new Error("GitHub " + reponse.status);
            err.statut = reponse.status;
            throw err;
        }
        return reponse.json();
    }

    function explication(err) {
        switch (err.statut) {
            case 401: return "Clé d'accès refusée : vérifiez qu'elle est correcte et n'a pas expiré.";
            case 403: return "Accès refusé : la clé doit avoir la permission « Contents : Read and write » sur ce dépôt.";
            case 404: return "Dépôt, branche ou fichier medias.json introuvable. Vérifiez le dépôt et la branche.";
            case 409:
            case 422: return "Le fichier a été modifié entre-temps. La liste a été rechargée : refaites votre modification.";
            default: return "Impossible de joindre GitHub. Vérifiez votre connexion et réessayez.";
        }
    }

    async function charger() {
        const fichier = await github(FICHIER);
        donnees = JSON.parse(base64VersTexte(fichier.content));
        donnees.medias = donnees.medias || [];
        sha = fichier.sha;
    }

    async function enregistrer(nouvellesDonnees, resume) {
        try {
            const res = await github(FICHIER, {
                method: "PUT",
                corps: {
                    message: resume + " (back office)",
                    content: texteVersBase64(JSON.stringify(nouvellesDonnees, null, 2) + "\n"),
                    sha: sha,
                    branch: config.branche,
                },
            });
            sha = res.content.sha;
            donnees = nouvellesDonnees;
        } catch (err) {
            if (err.statut === 409 || err.statut === 422) {
                await charger();
                afficherListe();
            }
            throw err;
        }
    }

    async function envoyerLogo(fichier, id) {
        const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" }[fichier.type];
        const chemin = DOSSIER_LOGOS + "/" + id + "-" + Date.now() + "." + ext;
        const octets = new Uint8Array(await fichier.arrayBuffer());
        await github(chemin, {
            method: "PUT",
            corps: { message: "Logo de " + id + " (back office)", content: versBase64(octets), branch: config.branche },
        });
        return chemin;
    }

    async function supprimerLogo(chemin) {
        if (!chemin || !chemin.startsWith(DOSSIER_LOGOS + "/")) return; // on ne touche pas aux images d'origine
        try {
            const f = await github(chemin);
            await github(chemin, {
                method: "DELETE",
                corps: { message: "Suppression du logo " + chemin + " (back office)", sha: f.sha, branch: config.branche },
            });
        } catch (e) {
            // le logo inutilisé reste dans le dépôt : sans conséquence pour le site
        }
    }

    // ---------- Connexion ----------

    function configParDefaut() {
        const hote = location.hostname.match(/^([\w-]+)\.github\.io$/);
        const depot = hote ? hote[1] + "/" + (location.pathname.split("/")[1] || hote[1] + ".github.io") : "loudu/eko2";
        return { depot: depot, branche: "main" };
    }

    function lireConfig() {
        for (const persistant of [true, false]) {
            try {
                const s = stockage(persistant);
                const c = s && JSON.parse(s.getItem(CLE_STOCKAGE));
                if (c && c.jeton) return c;
            } catch (e) { /* ignoré */ }
        }
        return null;
    }

    async function connecter(c, persistant) {
        config = c;
        const bouton = $("#form-connexion button[type=submit]");
        bouton.disabled = true;
        try {
            await charger();
            if (persistant !== undefined) {
                const s = stockage(persistant);
                try { if (s) s.setItem(CLE_STOCKAGE, JSON.stringify(c)); } catch (e) { /* ignoré */ }
            }
            $("#message").classList.remove("visible");
            $("#ecran-connexion").hidden = true;
            $("#ecran-liste").hidden = false;
            $("#deconnexion").hidden = false;
            afficherListe();
        } catch (err) {
            config = null;
            message(explication(err), true);
        } finally {
            bouton.disabled = false;
        }
    }

    function deconnecter() {
        for (const p of [true, false]) {
            try { const s = stockage(p); if (s) s.removeItem(CLE_STOCKAGE); } catch (e) { /* ignoré */ }
        }
        location.reload();
    }

    // ---------- Liste ----------

    function nomDe(liste, id) {
        const t = (donnees[liste] || []).find((x) => x.id === id);
        return t ? t.nom : id;
    }

    function logoSrc(logo) {
        if (typeof logo !== "string") return "img/E.png";
        if (/^https?:\/\//.test(logo)) return logo;
        // Logo tout juste envoyé : on l'affiche depuis GitHub en attendant la mise à jour du site
        if (logo.startsWith(DOSSIER_LOGOS + "/")) return "https://raw.githubusercontent.com/" + config.depot + "/" + config.branche + "/" + encodeURI(logo);
        return /^img\/[^:]+$/.test(logo) ? logo : "img/E.png";
    }

    function afficherListe() {
        const liste = $("#liste");
        const filtre = $("#recherche").value.trim().toLowerCase();
        const medias = donnees.medias.filter((m) => !filtre ||
            m.nom.toLowerCase().includes(filtre) || (m.tags || []).some((t) => t.toLowerCase().includes(filtre)));
        $("#compteur").textContent = "(" + donnees.medias.length + ")";
        liste.replaceChildren();

        if (!medias.length) {
            liste.append(element("li", "vide", filtre ? "Aucun média ne correspond à la recherche." : "Aucun média pour l'instant."));
            return;
        }

        medias.forEach((m) => {
            const li = element("li", "media-ligne");
            const img = element("img", "media-ligne__logo");
            img.src = logoSrc(m.logo);
            img.alt = "";
            const infos = element("div", "media-ligne__infos");
            infos.append(element("p", "media-ligne__nom", m.nom));

            const pastilles = element("div", "media-ligne__pastilles");
            (m.themes || []).forEach((t) => pastilles.append(element("span", "pastille pastille--discrete", nomDe("themes", t))));
            (m.supports || []).forEach((s) => pastilles.append(element("span", "pastille pastille--discrete", nomDe("supports", s))));
            (m.tags || []).forEach((t) => pastilles.append(element("span", "pastille", t)));
            infos.append(pastilles);
            if (!(m.themes || []).length && !(m.supports || []).length) {
                infos.append(element("p", "media-ligne__alerte", "N'apparaît sur aucune page : choisissez au moins un thème ou un support."));
            }

            const actions = element("div", "media-ligne__actions");
            const modifier = element("button", "bouton bouton--petit bouton--discret", "Modifier");
            const supprimer = element("button", "bouton bouton--petit bouton--discret", "Supprimer");
            modifier.type = supprimer.type = "button";
            modifier.setAttribute("aria-label", "Modifier " + m.nom);
            supprimer.setAttribute("aria-label", "Supprimer " + m.nom);
            modifier.addEventListener("click", () => ouvrirFormulaire(m));
            supprimer.addEventListener("click", () => demanderSuppression(m));
            actions.append(modifier, supprimer);

            li.append(img, infos, actions);
            liste.append(li);
        });
    }

    // ---------- Formulaire ----------

    function cases(conteneur, liste, nom, coches) {
        conteneur.replaceChildren();
        liste.forEach((item) => {
            const label = element("label", "case");
            const input = element("input");
            input.type = "checkbox";
            input.name = nom;
            input.value = item.id;
            input.checked = coches.includes(item.id);
            label.append(input, document.createTextNode(item.nom));
            conteneur.append(label);
        });
    }

    function afficherTags() {
        const ul = $("#tags-liste");
        ul.replaceChildren();
        tags.forEach((t, i) => {
            const li = element("li", "pastille", t);
            const x = element("button", "", "×");
            x.type = "button";
            x.setAttribute("aria-label", "Retirer le tag " + t);
            x.addEventListener("click", () => {
                tags.splice(i, 1);
                afficherTags();
                $("#tag-saisie").focus();
            });
            li.append(x);
            ul.append(li);
        });
    }

    function ajouterTag(valeur) {
        const t = valeur.trim().replace(/\s+/g, " ");
        if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
            tags.push(t);
            afficherTags();
        }
        $("#tag-saisie").value = "";
    }

    function apercuLogo(src) {
        const img = $("#apercu-logo");
        if (urlApercu) URL.revokeObjectURL(urlApercu);
        urlApercu = null;
        img.hidden = !src;
        if (src) img.src = src;
    }

    function ouvrirFormulaire(m) {
        enEdition = m ? m.id : null;
        const f = $("#form-media");
        f.reset();
        $("#titre-form").textContent = m ? "Modifier « " + m.nom + " »" : "Ajouter un média";
        $("#erreur-form").textContent = "";
        f.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));

        const r = (m && m.reseaux) || {};
        f.nom.value = m ? m.nom : "";
        f.site.value = (m && m.site) || "";
        f.description.value = (m && m.description) || "";
        f.youtube.value = r.youtube || "";
        f.x.value = r.x || "";
        f.instagram.value = r.instagram || "";
        f.soutenir.value = (m && m.soutenir) || "";
        f.rss.value = (m && m.rss) || "";
        cases($("#choix-themes"), donnees.themes || [], "themes", (m && m.themes) || []);
        cases($("#choix-supports"), donnees.supports || [], "supports", (m && m.supports) || []);
        tags = m ? (m.tags || []).slice() : [];
        afficherTags();
        apercuLogo(m ? logoSrc(m.logo) : null);

        const connus = new Set();
        donnees.medias.forEach((x) => (x.tags || []).forEach((t) => connus.add(t)));
        $("#tags-connus").replaceChildren(...[...connus].sort().map((t) => { const o = element("option"); o.value = t; return o; }));

        $("#dialogue-media").showModal();
        f.nom.focus();
    }

    function verifier(f) {
        const erreurs = [];
        f.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
        if (!f.nom.value.trim()) {
            erreurs.push("Le nom est obligatoire.");
            f.nom.setAttribute("aria-invalid", "true");
        }
        ["site", "youtube", "x", "instagram", "soutenir", "rss"].forEach((n) => {
            if (!urlValide(f[n].value.trim())) {
                erreurs.push("Adresse invalide : elle doit commencer par https://");
                f[n].setAttribute("aria-invalid", "true");
            }
        });
        const logo = f.logo.files[0];
        if (logo && logo.size > TAILLE_MAX_LOGO) erreurs.push("Le logo dépasse 1 Mo.");
        if (!enEdition && !logo) erreurs.push("Ajoutez un logo pour ce média.");
        return [...new Set(erreurs)];
    }

    async function soumettre(e) {
        e.preventDefault();
        const f = $("#form-media");
        if ($("#tag-saisie").value.trim()) ajouterTag($("#tag-saisie").value);
        const erreurs = verifier(f);
        $("#erreur-form").textContent = erreurs.join(" ");
        if (erreurs.length) {
            const premier = f.querySelector("[aria-invalid]");
            if (premier) premier.focus();
            return;
        }

        const ancien = enEdition ? donnees.medias.find((m) => m.id === enEdition) : null;
        const id = ancien ? ancien.id : identifiant(f.nom.value);
        const bouton = $("#enregistrer");
        bouton.disabled = true;
        bouton.textContent = "Enregistrement…";

        try {
            let logo = ancien ? ancien.logo : null;
            const fichierLogo = f.logo.files[0];
            if (fichierLogo) logo = await envoyerLogo(fichierLogo, id);

            const val = (n) => f[n].value.trim();
            const reseaux = {};
            ["youtube", "x", "instagram"].forEach((n) => { if (val(n)) reseaux[n] = val(n); });
            const media = {
                id: id,
                nom: val("nom"),
                logo: logo,
                site: val("site") || null,
                description: val("description"),
                themes: [...f.querySelectorAll("input[name=themes]:checked")].map((c) => c.value),
                supports: [...f.querySelectorAll("input[name=supports]:checked")].map((c) => c.value),
                tags: tags.slice(),
                reseaux: reseaux,
                soutenir: val("soutenir") || null,
                rss: val("rss") || null,
            };

            const nouvelles = JSON.parse(JSON.stringify(donnees));
            if (ancien) {
                nouvelles.medias[nouvelles.medias.findIndex((m) => m.id === ancien.id)] = media;
            } else {
                nouvelles.medias.push(media);
            }
            await enregistrer(nouvelles, (ancien ? "Modification de " : "Ajout de ") + media.nom);
            if (ancien && fichierLogo && ancien.logo !== logo) supprimerLogo(ancien.logo);

            $("#dialogue-media").close();
            afficherListe();
            message("« " + media.nom + " » est enregistré. Le site sera à jour d'ici une à deux minutes.");
        } catch (err) {
            $("#erreur-form").textContent = explication(err);
        } finally {
            bouton.disabled = false;
            bouton.textContent = "Enregistrer";
        }
    }

    // ---------- Suppression ----------

    function demanderSuppression(m) {
        const d = $("#dialogue-suppression");
        $("#texte-suppression").textContent = "« " + m.nom + " » sera retiré de toutes les pages du site. Cette action ne peut pas être annulée depuis le back office.";
        d.returnValue = "";
        d.showModal();
        d.addEventListener("close", async function surFermeture() {
            d.removeEventListener("close", surFermeture);
            if (d.returnValue !== "oui") return;
            try {
                const nouvelles = JSON.parse(JSON.stringify(donnees));
                nouvelles.medias = nouvelles.medias.filter((x) => x.id !== m.id);
                await enregistrer(nouvelles, "Suppression de " + m.nom);
                supprimerLogo(m.logo);
                afficherListe();
                message("« " + m.nom + " » a été supprimé.");
            } catch (err) {
                message(explication(err), true);
            }
        });
    }

    // ---------- Démarrage ----------

    const defaut = configParDefaut();
    const formConnexion = $("#form-connexion");
    formConnexion.depot.value = defaut.depot;
    formConnexion.branche.value = defaut.branche;

    formConnexion.addEventListener("submit", (e) => {
        e.preventDefault();
        connecter({
            depot: formConnexion.depot.value.trim(),
            branche: formConnexion.branche.value.trim(),
            jeton: formConnexion.jeton.value.trim(),
        }, formConnexion.souvenir.checked);
    });

    $("#deconnexion").addEventListener("click", deconnecter);
    $("#ajouter").addEventListener("click", () => ouvrirFormulaire(null));
    $("#recherche").addEventListener("input", afficherListe);
    $("#form-media").addEventListener("submit", soumettre);
    $("#annuler").addEventListener("click", () => $("#dialogue-media").close());

    $("#tag-saisie").addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            ajouterTag(e.target.value);
        } else if (e.key === "Backspace" && !e.target.value && tags.length) {
            tags.pop();
            afficherTags();
        }
    });

    $("#form-media").logo.addEventListener("change", (e) => {
        const f = e.target.files[0];
        if (!f) return;
        apercuLogo(null);
        urlApercu = URL.createObjectURL(f);
        $("#apercu-logo").src = urlApercu;
        $("#apercu-logo").hidden = false;
    });

    const memorise = lireConfig();
    if (memorise) connecter(memorise);
})();
