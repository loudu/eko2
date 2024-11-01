let tabs = document.querySelectorAll(".theme img");
let tabContents = document.querySelectorAll(".categorie .media");

tabs.forEach((theme, index) => {
    theme.addEventListener("click", () => {
        tabContents.forEach((content) => {
            content.classList.remove("active");
        });
        tabs.forEach((theme) => {
            theme.classList.remove("active");
        });
        tabContents[index].classList.add("active");
        tabs[index].classList.add("active");
    });
});