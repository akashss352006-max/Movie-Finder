// --- Shared config, OMDb API client, watchlist store, movie cards & details modal ---
const API_KEY = "d8b70023"; // Working demo key. Replace with your key from omdbapi.com if required.
const BASE_URL = "https://www.omdbapi.com/";

// Inline SVG placeholder (no external service needed, so it can never fail to load)
const PLACEHOLDER_IMG = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
        <rect width="300" height="450" fill="#262626"/>
        <rect x="105" y="150" width="90" height="70" rx="8" fill="none" stroke="#555" stroke-width="6"/>
        <circle cx="130" cy="140" r="16" fill="none" stroke="#555" stroke-width="6"/>
        <circle cx="172" cy="140" r="16" fill="none" stroke="#555" stroke-width="6"/>
        <path d="M195 175 L222 160 L222 210 L195 195 Z" fill="#555"/>
        <text x="150" y="270" fill="#888" font-family="Segoe UI, Arial, sans-serif" font-size="20" text-anchor="middle">No Poster Available</text>
    </svg>`
);

// Any <img> that fails to load (dead poster URL, 404, blocked) falls back to the placeholder
document.addEventListener("error", function (e) {
    const img = e.target;
    if (img && img.tagName === "IMG" && img.dataset.fallback !== "done") {
        img.dataset.fallback = "done";
        img.src = PLACEHOLDER_IMG;
    }
}, true);

// --- Helpers ---
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function hasValue(value) {
    return value !== undefined && value !== null && value !== "" && value !== "N/A";
}

function posterUrl(poster) {
    if (!hasValue(poster)) return PLACEHOLDER_IMG;
    return poster.replace(/^http:\/\//, "https://");
}

function typeLabel(type) {
    return { movie: "Movie", series: "Series", episode: "Episode", game: "Game" }[type] || (type || "Title");
}

function friendlyApiError(error) {
    if (!error) return "Something went wrong. Please try again.";
    if (/too many results/i.test(error)) return "Too many results. Please type a more specific title.";
    if (/not found/i.test(error)) return "No results found. Try a different title or remove filters.";
    if (/limit/i.test(error)) return "The daily OMDb API request limit has been reached. Please try again later.";
    if (/invalid api key/i.test(error)) return "The OMDb API key is invalid. Update API_KEY in js/common.js.";
    return error;
}

function getCurrentUser() {
    return sessionStorage.getItem("currentUser");
}

function isLoggedIn() {
    return sessionStorage.getItem("isLoggedIn") === "true";
}

// --- OMDb API client (with in-memory + session cache to save API quota) ---
const apiCache = new Map();

async function omdb(params) {
    const query = new URLSearchParams({ apikey: API_KEY, ...params }).toString();

    if (apiCache.has(query)) return apiCache.get(query);
    try {
        const stored = sessionStorage.getItem("omdb:" + query);
        if (stored) {
            const data = JSON.parse(stored);
            apiCache.set(query, data);
            return data;
        }
    } catch (e) { /* storage unavailable or corrupt: just refetch */ }

    const response = await fetch(`${BASE_URL}?${query}`);
    // OMDb sends JSON error bodies even on 401 (bad key / limit reached)
    const data = await response.json().catch(() => ({ Response: "False", Error: `HTTP ${response.status}` }));

    if (data.Response === "True") {
        apiCache.set(query, data);
        try { sessionStorage.setItem("omdb:" + query, JSON.stringify(data)); } catch (e) { /* quota full */ }
    }
    return data;
}

// --- Toast notifications (replaces blocking alert() popups) ---
function showToast(message, type = "info") {
    let stack = document.getElementById("toastStack");
    if (!stack) {
        stack = document.createElement("div");
        stack.id = "toastStack";
        stack.className = "toast-stack";
        document.body.appendChild(stack);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => toast.classList.add("hide"), 2600);
    setTimeout(() => toast.remove(), 3000);
}

// --- Watchlist store (saved per user in LocalStorage) ---
function watchlistKey() {
    const user = getCurrentUser();
    return user ? `watchlist:${user}` : "watchlist";
}

function getWatchlist() {
    const key = watchlistKey();
    let raw = localStorage.getItem(key);

    // Migrate the old shared "watchlist" key to the logged-in user's list
    if (raw === null && key !== "watchlist") {
        raw = localStorage.getItem("watchlist");
        if (raw !== null) {
            localStorage.setItem(key, raw);
            localStorage.removeItem("watchlist");
        }
    }

    try {
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

function saveWatchlist(list) {
    localStorage.setItem(watchlistKey(), JSON.stringify(list));
    document.dispatchEvent(new CustomEvent("watchlist:change"));
}

function isInWatchlist(imdbID) {
    return getWatchlist().some(item => item.imdbID === imdbID);
}

function addToWatchlist(movie) {
    if (!isLoggedIn()) {
        showToast("Please log in to build your watchlist.", "error");
        return false;
    }
    const watchlist = getWatchlist();
    if (watchlist.some(item => item.imdbID === movie.imdbID)) {
        showToast(`${movie.Title} is already in your watchlist.`);
        return false;
    }
    watchlist.push({
        imdbID: movie.imdbID,
        Title: movie.Title,
        Year: movie.Year,
        Type: movie.Type,
        Poster: movie.Poster,
        addedAt: Date.now(),
        watched: false
    });
    saveWatchlist(watchlist);
    showToast(`${movie.Title} added to your watchlist!`, "success");
    return true;
}

function removeFromWatchlist(imdbID) {
    const watchlist = getWatchlist();
    const movie = watchlist.find(item => item.imdbID === imdbID);
    saveWatchlist(watchlist.filter(item => item.imdbID !== imdbID));
    if (movie) showToast(`${movie.Title} removed from your watchlist.`);
}

function toggleWatchlist(movie) {
    if (isInWatchlist(movie.imdbID)) {
        removeFromWatchlist(movie.imdbID);
    } else {
        addToWatchlist(movie);
    }
}

function setWatched(imdbID, watched) {
    const watchlist = getWatchlist();
    const movie = watchlist.find(item => item.imdbID === imdbID);
    if (!movie) return;
    movie.watched = watched;
    saveWatchlist(watchlist);
}

// Keep every "+ Watchlist" button on the page in sync with the store
function updateWatchButton(button) {
    const inList = isInWatchlist(button.dataset.watchId);
    button.textContent = inList ? "✓ In Watchlist" : "+ Watchlist";
    button.classList.toggle("in-list", inList);
}

document.addEventListener("watchlist:change", function () {
    document.querySelectorAll("[data-watch-id]").forEach(updateWatchButton);
});

// Sync across browser tabs
window.addEventListener("storage", function (e) {
    if (e.key === watchlistKey()) document.dispatchEvent(new CustomEvent("watchlist:change"));
});

// --- Movie card builder (no inline JS, so titles with quotes can't break anything) ---
function createMovieCard(movie) {
    const card = document.createElement("div");
    card.className = "movie-card";

    card.innerHTML = `
        <div class="poster-wrap" role="button" tabindex="0" title="View details">
            <img src="${escapeHtml(posterUrl(movie.Poster))}" alt="${escapeHtml(movie.Title)} poster" loading="lazy" referrerpolicy="no-referrer">
            <span class="type-badge">${escapeHtml(typeLabel(movie.Type))}</span>
        </div>
        <div class="movie-card-info">
            <div class="movie-card-title" title="${escapeHtml(movie.Title)}">${escapeHtml(movie.Title)}</div>
            <div class="movie-card-meta">${escapeHtml(movie.Year)}</div>
            <div class="movie-card-actions">
                <button class="btn" data-action="details">View Details</button>
                <button class="btn btn-secondary" data-watch-id="${escapeHtml(movie.imdbID)}"></button>
            </div>
        </div>
    `;

    const poster = card.querySelector(".poster-wrap");
    poster.addEventListener("click", () => showMovieDetails(movie.imdbID));
    poster.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            showMovieDetails(movie.imdbID);
        }
    });
    card.querySelector('[data-action="details"]').addEventListener("click", () => showMovieDetails(movie.imdbID));

    const watchBtn = card.querySelector("[data-watch-id]");
    updateWatchButton(watchBtn);
    watchBtn.addEventListener("click", () => toggleWatchlist(movie));

    return card;
}

function renderMovieList(movies, container, append = false) {
    if (!append) container.innerHTML = "";
    const seen = new Set(Array.from(container.querySelectorAll("[data-watch-id]")).map(b => b.dataset.watchId));
    movies.forEach(movie => {
        if (seen.has(movie.imdbID)) return; // OMDb sometimes repeats titles across pages
        seen.add(movie.imdbID);
        container.appendChild(createMovieCard(movie));
    });
}

// --- Details modal ---
let modalHistory = [];
let modalRequestId = 0;

function ensureModal() {
    let modal = document.getElementById("movieModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "movieModal";
    modal.className = "modal";
    modal.innerHTML = `
        <div class="modal-content" role="dialog" aria-modal="true" aria-label="Movie details">
            <button class="close-btn" aria-label="Close">&times;</button>
            <div id="modalBody"></div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector(".close-btn").addEventListener("click", closeModal);
    modal.addEventListener("click", e => {
        if (e.target === modal) closeModal();
    });
    return modal;
}

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
});

function closeModal() {
    const modal = document.getElementById("movieModal");
    if (!modal || !modal.classList.contains("active")) return;
    modal.classList.remove("active");
    document.body.classList.remove("modal-open");
    modalHistory = [];
    modalRequestId++; // ignore any request still in flight
}

function ratingBadge(source, value) {
    const labels = {
        "Internet Movie Database": "IMDb",
        "Rotten Tomatoes": "Rotten Tomatoes",
        "Metacritic": "Metacritic"
    };
    const cls = {
        "Internet Movie Database": "rating-imdb",
        "Rotten Tomatoes": "rating-rt",
        "Metacritic": "rating-mc"
    };
    return `
        <div class="rating-badge ${cls[source] || ""}">
            <span class="rating-value">${escapeHtml(value)}</span>
            <span class="rating-source">${escapeHtml(labels[source] || source)}</span>
        </div>
    `;
}

async function showMovieDetails(imdbID, fromId) {
    const modal = ensureModal();
    const modalBody = document.getElementById("modalBody");
    const requestId = ++modalRequestId;

    if (fromId) modalHistory.push(fromId);

    modalBody.innerHTML = `<div class="loader"></div><p class="message">Loading details...</p>`;
    modal.classList.add("active");
    document.body.classList.add("modal-open");
    modal.querySelector(".modal-content").scrollTop = 0;

    let movie;
    try {
        movie = await omdb({ i: imdbID, plot: "full" });
    } catch (err) {
        console.error("Error fetching details:", err);
        if (requestId !== modalRequestId) return;
        modalBody.innerHTML = `<p class="message">Failed to load details. Please check your internet connection.</p>`;
        return;
    }
    if (requestId !== modalRequestId) return;

    if (movie.Response !== "True") {
        modalBody.innerHTML = `<p class="message">${escapeHtml(friendlyApiError(movie.Error))}</p>`;
        return;
    }

    const ratings = (movie.Ratings || []).map(r => ratingBadge(r.Source, r.Value)).join("");
    const genres = hasValue(movie.Genre)
        ? movie.Genre.split(",").map(g => `<span class="chip">${escapeHtml(g.trim())}</span>`).join("")
        : "";

    const metaParts = [movie.Year, movie.Rated, movie.Runtime, typeLabel(movie.Type)]
        .filter(hasValue).map(escapeHtml).join(" &bull; ");

    const facts = [
        ["Director", movie.Director],
        ["Writer", movie.Writer],
        ["Cast", movie.Actors],
        ["Released", movie.Released],
        ["Seasons", movie.totalSeasons],
        ["Season / Episode", movie.Type === "episode" ? `S${movie.Season} · E${movie.Episode}` : null],
        ["Language", movie.Language],
        ["Country", movie.Country],
        ["Awards", movie.Awards],
        ["Box Office", movie.BoxOffice],
        ["Metascore", movie.Metascore],
        ["IMDb Votes", movie.imdbVotes],
        ["Production", movie.Production],
        ["DVD Release", movie.DVD]
    ].filter(([, value]) => hasValue(value))
     .map(([label, value]) => `<div class="fact"><span class="fact-label">${label}</span><span>${escapeHtml(value)}</span></div>`)
     .join("");

    const backButton = modalHistory.length
        ? `<button class="btn btn-secondary btn-inline back-btn" data-action="back">&larr; Back</button>` : "";

    const seriesLink = movie.Type === "episode" && hasValue(movie.seriesID)
        ? `<button class="btn btn-secondary btn-inline" data-action="series">View Series</button>` : "";

    const website = hasValue(movie.Website)
        ? `<a class="btn btn-secondary btn-inline" href="${escapeHtml(movie.Website)}" target="_blank" rel="noopener">Official Site</a>` : "";

    modalBody.innerHTML = `
        ${backButton}
        <div class="modal-body">
            <img src="${escapeHtml(posterUrl(movie.Poster))}" alt="${escapeHtml(movie.Title)} poster" referrerpolicy="no-referrer">
            <div class="modal-details">
                <h2>${escapeHtml(movie.Title)}</h2>
                <p class="modal-meta">${metaParts}</p>
                ${genres ? `<div class="chips">${genres}</div>` : ""}
                ${ratings ? `<div class="ratings">${ratings}</div>` : ""}
                ${hasValue(movie.Plot) ? `<p class="plot">${escapeHtml(movie.Plot)}</p>` : ""}
                <div class="modal-actions">
                    <button class="btn btn-inline" data-watch-id="${escapeHtml(movie.imdbID)}"></button>
                    <a class="btn btn-secondary btn-inline" href="https://www.imdb.com/title/${encodeURIComponent(movie.imdbID)}/" target="_blank" rel="noopener">Open on IMDb</a>
                    ${seriesLink}
                    ${website}
                </div>
            </div>
        </div>
        ${facts ? `<div class="facts">${facts}</div>` : ""}
        ${movie.Type === "series" ? `<div id="episodesSection" class="episodes-section"></div>` : ""}
    `;

    const watchBtn = modalBody.querySelector("[data-watch-id]");
    updateWatchButton(watchBtn);
    watchBtn.addEventListener("click", () => toggleWatchlist(movie));

    const back = modalBody.querySelector('[data-action="back"]');
    if (back) back.addEventListener("click", () => showMovieDetails(modalHistory.pop()));

    const series = modalBody.querySelector('[data-action="series"]');
    if (series) series.addEventListener("click", () => showMovieDetails(movie.seriesID, movie.imdbID));

    if (movie.Type === "series") {
        const total = parseInt(movie.totalSeasons, 10);
        if (total > 0) renderSeasonPicker(movie, total);
    }
}

// --- Series: season & episode browser (OMDb "Season" parameter) ---
function renderSeasonPicker(series, totalSeasons) {
    const section = document.getElementById("episodesSection");
    if (!section) return;

    const options = Array.from({ length: totalSeasons }, (_, i) =>
        `<option value="${i + 1}">Season ${i + 1}</option>`).join("");

    section.innerHTML = `
        <div class="episodes-header">
            <h3>Episodes</h3>
            <select id="seasonSelect" class="select">${options}</select>
        </div>
        <div id="episodeList" class="episode-list"></div>
    `;

    const select = section.querySelector("#seasonSelect");
    select.addEventListener("change", () => loadSeason(series, select.value));
    loadSeason(series, 1);
}

async function loadSeason(series, season) {
    const list = document.getElementById("episodeList");
    if (!list) return;
    const requestId = modalRequestId;

    list.innerHTML = `<p class="message small">Loading season ${season}...</p>`;

    let data;
    try {
        data = await omdb({ i: series.imdbID, Season: season });
    } catch (err) {
        if (requestId === modalRequestId) list.innerHTML = `<p class="message small">Could not load episodes.</p>`;
        return;
    }
    if (requestId !== modalRequestId || !document.getElementById("episodeList")) return;

    if (data.Response !== "True" || !data.Episodes || !data.Episodes.length) {
        list.innerHTML = `<p class="message small">${escapeHtml(friendlyApiError(data.Error || "No episodes found."))}</p>`;
        return;
    }

    list.innerHTML = "";
    data.Episodes.forEach(ep => {
        const row = document.createElement("button");
        row.className = "episode-row";
        row.innerHTML = `
            <span class="episode-num">E${escapeHtml(ep.Episode)}</span>
            <span class="episode-title">${escapeHtml(ep.Title)}</span>
            <span class="episode-date">${hasValue(ep.Released) ? escapeHtml(ep.Released) : ""}</span>
            <span class="episode-rating">${hasValue(ep.imdbRating) ? "⭐ " + escapeHtml(ep.imdbRating) : ""}</span>
        `;
        row.addEventListener("click", () => showMovieDetails(ep.imdbID, series.imdbID));
        list.appendChild(row);
    });
}

// --- Navbar: show the logged-in user's name ---
document.addEventListener("DOMContentLoaded", function () {
    const links = document.querySelector(".nav-links");
    const user = sessionStorage.getItem("currentName") || getCurrentUser();
    if (links && user && isLoggedIn()) {
        const li = document.createElement("li");
        li.className = "nav-user";
        li.textContent = `Hi, ${user}`;
        links.insertBefore(li, links.lastElementChild);
    }
});
