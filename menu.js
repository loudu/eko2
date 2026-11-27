const hamburger = document.querySelector(".hamburger");
const navMenu = document.querySelector(".nav-menu");

function setMenuOpen(open) {
    hamburger.classList.toggle("active", open);
    navMenu.classList.toggle("active", open);
    hamburger.setAttribute("aria-expanded", open);
    hamburger.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
}

hamburger.addEventListener("click", () => {
    setMenuOpen(!navMenu.classList.contains("active"));
});

// Ferme le menu quand on choisit un lien, qu'on clique à côté ou qu'on appuie sur Échap
document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
});

document.addEventListener("click", (event) => {
    if (navMenu.classList.contains("active") &&
        !navMenu.contains(event.target) &&
        !hamburger.contains(event.target)) {
        setMenuOpen(false);
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenuOpen(false);
});

// Souligne la page en cours dans le menu
const currentPage = location.pathname.split("/").pop() || "index.html";
document.querySelectorAll(".nav-link").forEach((link) => {
    // "Thèmes" et "Support" restent soulignés sur toutes les pages de leur section
    const section = link.dataset.section;
    if (currentPage === link.getAttribute("href") || (section && currentPage.startsWith(section))) {
        link.setAttribute("aria-current", "page");
    }
});
