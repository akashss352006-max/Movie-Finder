// Watchlist page: filter by watched status, sort, mark watched, remove, clear all
let watchFilter = "all";

document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".filter-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            watchFilter = tab.dataset.filter;
            document.querySelectorAll(".filter-tab").forEach(t => t.classList.toggle("active", t === tab));
            displayWatchlist();
        });
    });
    document.getElementById("sortSelect").addEventListener("change", displayWatchlist);
    document.getElementById("clearAllBtn").addEventListener("click", () => {
        if (getWatchlist().length && confirm("Remove every title from your watchlist?")) {
            saveWatchlist([]);
            showToast("Watchlist cleared.");
        }
    });

    displayWatchlist();
});

// Re-render whenever the list changes (e.g. from the details modal or another tab)
document.addEventListener("watchlist:change", displayWatchlist);

function sortWatchlist(list, mode) {
    const year = m => parseInt(m.Year, 10) || 0;
    const sorted = list.map((movie, index) => ({ movie, index }));
    const byAdded = (a, b) => (b.movie.addedAt || b.index) - (a.movie.addedAt || a.index);

    switch (mode) {
        case "title": sorted.sort((a, b) => a.movie.Title.localeCompare(b.movie.Title)); break;
        case "year-desc": sorted.sort((a, b) => year(b.movie) - year(a.movie)); break;
        case "year-asc": sorted.sort((a, b) => year(a.movie) - year(b.movie)); break;
        case "oldest": sorted.sort((a, b) => -byAdded(a, b)); break;
        default: sorted.sort(byAdded);
    }
    return sorted.map(entry => entry.movie);
}

function displayWatchlist() {
    const container = document.getElementById("watchlistGrid");
    const stats = document.getElementById("watchlistStats");
    if (!container) return;

    const watchlist = getWatchlist();
    const watchedCount = watchlist.filter(m => m.watched).length;
    stats.textContent = `${watchlist.length} title${watchlist.length === 1 ? "" : "s"} · ${watchedCount} watched · ${watchlist.length - watchedCount} to watch`;
    document.getElementById("clearAllBtn").disabled = watchlist.length === 0;

    if (watchlist.length === 0) {
        container.innerHTML = `
            <p class="message">
                Your watchlist is empty.<br>
                <a href="search.html">Start searching</a> for movies and add your favorites!
            </p>
        `;
        return;
    }

    const filtered = watchlist.filter(m =>
        watchFilter === "all" || (watchFilter === "watched" ? m.watched : !m.watched));

    if (filtered.length === 0) {
        container.innerHTML = `<p class="message">No titles in this view.</p>`;
        return;
    }

    container.innerHTML = "";
    sortWatchlist(filtered, document.getElementById("sortSelect").value).forEach(movie => {
        const card = document.createElement("div");
        card.className = "movie-card" + (movie.watched ? " is-watched" : "");

        card.innerHTML = `
            <div class="poster-wrap" role="button" tabindex="0" title="View details">
                <img src="${escapeHtml(posterUrl(movie.Poster))}" alt="${escapeHtml(movie.Title)} poster" loading="lazy" referrerpolicy="no-referrer">
                <span class="type-badge">${escapeHtml(typeLabel(movie.Type))}</span>
                ${movie.watched ? `<span class="watched-badge">✓ Watched</span>` : ""}
            </div>
            <div class="movie-card-info">
                <div class="movie-card-title" title="${escapeHtml(movie.Title)}">${escapeHtml(movie.Title)}</div>
                <div class="movie-card-meta">${escapeHtml(movie.Year)}</div>
                <div class="movie-card-actions">
                    <button class="btn" data-action="details">View Details</button>
                    <button class="btn btn-secondary" data-action="watched">${movie.watched ? "Mark Unwatched" : "Mark Watched"}</button>
                    <button class="btn btn-danger" data-action="remove">Remove</button>
                </div>
            </div>
        `;

        const open = () => showMovieDetails(movie.imdbID);
        const poster = card.querySelector(".poster-wrap");
        poster.addEventListener("click", open);
        poster.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
            }
        });
        card.querySelector('[data-action="details"]').addEventListener("click", open);
        card.querySelector('[data-action="watched"]').addEventListener("click", () => setWatched(movie.imdbID, !movie.watched));
        card.querySelector('[data-action="remove"]').addEventListener("click", () => removeFromWatchlist(movie.imdbID));

        container.appendChild(card);
    });
}
