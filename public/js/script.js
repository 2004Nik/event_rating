document.addEventListener("DOMContentLoaded", function() {
    const dropdown = document.querySelector(".dropdown-content");
    const dropbtn = document.querySelector(".dropbtn");

    dropbtn.addEventListener("click", function(event) {
        event.stopPropagation();
        dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", function() {
        dropdown.style.display = "none";
    });
});
