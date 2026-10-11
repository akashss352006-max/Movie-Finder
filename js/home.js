// Curated titles for the "Featured" spotlight (one is picked at random on each visit)
const FEATURED_IDS = [
    "tt0468569", // The Dark Knight
    "tt1375666", // Inception
    "tt0816692", // Interstellar
    "tt0133093", // The Matrix
    "tt0903747", // Breaking Bad
    "tt0111161", // The Shawshank Redemption
    "tt4154796", // Avengers: Endgame
    "tt0110912", // Pulp Fiction
    "tt4574334", // Stranger Things
    "tt6751668"  // Parasite
];

const HOME_SECTIONS = [
    { title: "Popular Movies", params: { s: "avengers", type: "movie" } },
    { title: "Superhero Hits", params: { s: "batman", type: "movie" } },
    { title: "Sci-Fi Adventures", params: { s: "star wars", type: "movie" } },
    { title: "Binge-Worthy Series", params: { s: "star trek", type: "series" } },
    { title: "Magical Worlds", params: { s: "harry potter", type: "movie" } }
];

document.addEventListener("DOMContentLoaded", function () {
    const heroSearch = document.getElementById("heroSearch");
    if (heroSearch) {
        heroSearch.addEventListener("submit", function (e) {
            e.preventDefault();
            const query = document.getElementById("heroSearchInput").value.trim();
            if (query) window.location.href = `search.html?q=${encodeURIComponent(query)}`;
        });
    }

    loadFeatured();
    loadSections();
});

async function loadFeatured() {
    const container = document.getElementById("featured");
    if (!container) return;

    const id = FEATURED_IDS[Math.floor(Math.random() * FEATURED_IDS.length)];
    try {
        const movie = await omdb({ i: id });
        if (movie.Response !== "True") {
            container.remove();
            return;
        }
        const poster = escapeHtml(posterUrl(movie.Poster));
        container.innerHTML = `
            <div class="featured-bg" style="background-image: url('${poster}')"></div>
            <div class="featured-inner">
                <img src="${poster}" alt="${escapeHtml(movie.Title)} poster" referrerpolicy="no-referrer">
                <div class="featured-text">
                    <span class="featured-label">Featured ${escapeHtml(typeLabel(movie.Type))}</span>
                    <h2>${escapeHtml(movie.Title)}</h2>
                    <p class="modal-meta">${[movie.Year, movie.Rated, movie.Runtime, movie.Genre].filter(hasValue).map(escapeHtml).join(" &bull; ")}</p>
                    ${hasValue(movie.imdbRating) ? `<p class="featured-rating">⭐ ${escapeHtml(movie.imdbRating)} / 10 <span>(${escapeHtml(movie.imdbVotes)} votes)</span></p>` : ""}
                    <p class="featured-plot">${escapeHtml(movie.Plot)}</p>
                    <div class="modal-actions">
                        <button class="btn btn-inline" data-action="details">View Details</button>
                        <button class="btn btn-secondary btn-inline" data-watch-id="${escapeHtml(movie.imdbID)}"></button>
                    </div>
                </div>
            </div>
        `;
        container.querySelector('[data-action="details"]').addEventListener("click", () => showMovieDetails(movie.imdbID));
        const watchBtn = container.querySelector("[data-watch-id]");
        updateWatchButton(watchBtn);
        watchBtn.addEventListener("click", () => toggleWatchlist(movie));
    } catch (err) {
        console.error("Error loading featured title:", err);
        container.remove();
    }
}

function loadSections() {
    const wrapper = document.getElementById("homeSections");
    if (!wrapper) return;

    HOME_SECTIONS.forEach(section => {
        const block = document.createElement("section");
        block.className = "home-section";
        block.innerHTML = `
            <div class="row-header">
                <h2 class="section-title">${escapeHtml(section.title)}</h2>
                <a class="see-all" href="search.html?q=${encodeURIComponent(section.params.s)}&type=${encodeURIComponent(section.params.type || "")}">See all &rarr;</a>
            </div>
            <div class="movie-row"><p class="message">Loading...</p></div>
        `;
        wrapper.appendChild(block);
        loadRow(section.params, block.querySelector(".movie-row"));
    });
}

async function loadRow(params, container) {
    try {
        const data = await omdb(params);
        if (data.Response === "True") {
            renderMovieList(data.Search, container);
        } else {
            container.innerHTML = `<p class="message">${escapeHtml(friendlyApiError(data.Error))}</p>`;
        }
    } catch (error) {
        console.error("Error fetching movies:", error);
        container.innerHTML = `<p class="message">Error loading movies. Please check your internet connection.</p>`;
    }
}
