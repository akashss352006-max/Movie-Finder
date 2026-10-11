// Search with type / year filters, pagination and recent-search history
const RESULTS_PER_PAGE = 10; // fixed by OMDb
const RECENT_KEY = "recentSearches";

let searchState = { query: "", type: "", year: "", page: 1, total: 0 };
let searchRequestId = 0;

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("searchForm");
    const loadMoreBtn = document.getElementById("loadMoreBtn");

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        performSearch();
    });
    document.getElementById("typeFilter").addEventListener("change", () => {
        if (document.getElementById("searchInput").value.trim()) performSearch();
    });
    loadMoreBtn.addEventListener("click", loadMore);

    // Support links like search.html?q=batman&type=movie&y=2008
    const params = new URLSearchParams(window.location.search);
    if (params.get("q")) {
        document.getElementById("searchInput").value = params.get("q");
        document.getElementById("typeFilter").value = params.get("type") || "";
        document.getElementById("yearFilter").value = params.get("y") || "";
        performSearch();
    }

    renderRecentSearches();
});

function performSearch() {
    const query = document.getElementById("searchInput").value.trim();
    const type = document.getElementById("typeFilter").value;
    const year = document.getElementById("yearFilter").value.trim();
    const resultsContainer = document.getElementById("searchResults");
    const summary = document.getElementById("searchSummary");

    document.getElementById("loadMoreBtn").hidden = true;
    summary.textContent = "";

    if (!query) {
        resultsContainer.innerHTML = `<p class="message">Please enter a movie name.</p>`;
        return;
    }
    if (year && !/^\d{4}$/.test(year)) {
        resultsContainer.innerHTML = `<p class="message">Year must be 4 digits, e.g. 2010.</p>`;
        return;
    }

    searchState = { query, type, year, page: 1, total: 0 };

    // Keep the URL shareable / refresh-safe
    const urlParams = new URLSearchParams({ q: query });
    if (type) urlParams.set("type", type);
    if (year) urlParams.set("y", year);
    history.replaceState(null, "", `?${urlParams}`);

    saveRecentSearch(query);
    resultsContainer.innerHTML = `<div class="loader"></div><p class="message">Searching for "${escapeHtml(query)}"...</p>`;
    fetchPage(true);
}

function loadMore() {
    searchState.page++;
    fetchPage(false);
}

async function fetchPage(isNewSearch) {
    const resultsContainer = document.getElementById("searchResults");
    const summary = document.getElementById("searchSummary");
    const loadMoreBtn = document.getElementById("loadMoreBtn");
    const requestId = ++searchRequestId;

    const params = { s: searchState.query, page: searchState.page };
    if (searchState.type) params.type = searchState.type;
    if (searchState.year) params.y = searchState.year;

    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Loading...";

    try {
        const data = await omdb(params);
        if (requestId !== searchRequestId) return; // a newer search was started

        if (data.Response === "True") {
            searchState.total = parseInt(data.totalResults, 10) || 0;
            renderMovieList(data.Search, resultsContainer, !isNewSearch);
            summary.textContent = `${searchState.total.toLocaleString()} result${searchState.total === 1 ? "" : "s"} for "${searchState.query}"`;
            loadMoreBtn.hidden = searchState.page * RESULTS_PER_PAGE >= searchState.total;
        } else if (isNewSearch) {
            resultsContainer.innerHTML = `<p class="message">${escapeHtml(friendlyApiError(data.Error))}</p>`;
        } else {
            showToast(friendlyApiError(data.Error), "error");
            searchState.page--;
        }
    } catch (error) {
        console.error("Search error:", error);
        if (requestId !== searchRequestId) return;
        if (isNewSearch) {
            resultsContainer.innerHTML = `<p class="message">Error fetching search results. Please check your connection.</p>`;
        } else {
            showToast("Could not load more results.", "error");
            searchState.page--;
        }
    } finally {
        if (requestId === searchRequestId) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = "Load More";
        }
    }
}

// --- Recent searches ---
function getRecentSearches() {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY));
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

function saveRecentSearch(query) {
    const list = getRecentSearches().filter(q => q.toLowerCase() !== query.toLowerCase());
    list.unshift(query);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
    renderRecentSearches();
}

function renderRecentSearches() {
    const box = document.getElementById("recentSearches");
    const list = getRecentSearches();
    box.innerHTML = "";
    if (!list.length) return;

    const label = document.createElement("span");
    label.className = "recent-label";
    label.textContent = "Recent:";
    box.appendChild(label);

    list.forEach(query => {
        const chip = document.createElement("button");
        chip.className = "chip chip-button";
        chip.textContent = query;
        chip.addEventListener("click", () => {
            document.getElementById("searchInput").value = query;
            performSearch();
        });
        box.appendChild(chip);
    });

    const clear = document.createElement("button");
    clear.className = "link-button";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => {
        localStorage.removeItem(RECENT_KEY);
        renderRecentSearches();
    });
    box.appendChild(clear);
}
