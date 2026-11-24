
/* SMART LIB — STUDENT DASHBOARD + INTERACTIVE GRAPH */

"use strict";

const API = "/api/student";

let currentPage = 1;
const pageLimit = 9;
let totalPages = 1;
let searchTimer = null;

const loadedSections = new Set();

const elements = {
  studentName: document.getElementById("studentName"),
  totalRequests: document.getElementById("totalRequests"),
  pendingRequests: document.getElementById("pendingRequests"),
  activeLoans: document.getElementById("activeLoans"),
  returnedBooks: document.getElementById("returnedBooks"),

  bookGrid: document.getElementById("bookGrid"),
  bookSearch: document.getElementById("bookSearch"),
  categoryFilter: document.getElementById("categoryFilter"),
  bookCount: document.getElementById("bookCount"),
  pagination: document.getElementById("pagination"),

  requestsTable: document.getElementById("requestsTable"),
  loansTable: document.getElementById("loansTable"),

  profileName: document.getElementById("profileName"),
  profileEmail: document.getElementById("profileEmail"),
  profileRole: document.getElementById("profileRole"),
  profileJoined: document.getElementById("profileJoined"),

  recommendationContent: document.getElementById("recommendationContent"),
  graphRecommendationContent: document.getElementById("graphRecommendationContent"),

  message: document.getElementById("dashboardMessage"),

  sidebar: document.getElementById("dashboardSidebar"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  dashboardLayout: document.querySelector(".dashboard-layout")
};

/* GRAPH STATE */

const graphState = {
  data: null,
  nodes: [],
  edges: [],
  canvas: null,
  context: null,
  animationFrame: null,
  width: 0,
  height: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  selectedNode: null,
  hoveredNode: null,
  draggedNode: null,
  pointerDown: false,
  moved: false,
  lastPointer: null,
  filter: "all",
  search: "",
  resizeObserver: null,
  destroyed: false,
  reducedMotion: false
};

/* API HELPER */

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.error || data.message || "Something went wrong."
    );

    error.status = response.status;
    throw error;
  }

  return data;
}

/* SAFE HTML */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

/* DATE FORMAT */

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHTML(value);
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/* MESSAGE */

function showMessage(message, isError = false) {
  if (!elements.message) return;

  elements.message.textContent = message;
  elements.message.className = "dashboard-message show";

  if (isError) {
    elements.message.classList.add("error");
  }

  setTimeout(() => {
    elements.message.classList.remove("show", "error");
  }, 3500);
}

/* THEME SYSTEM */

function initializeTheme() {
  const themeSelect = document.getElementById("themeSelect");

  if (!themeSelect) return;

  const savedTheme = localStorage.getItem("smartlib-theme") || "ocean";
  const validThemes = ["ocean", "emerald", "dark"];

  const theme = validThemes.includes(savedTheme)
    ? savedTheme
    : "ocean";

  applyTheme(theme);
  themeSelect.value = theme;

  themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
  });
}

function applyTheme(theme) {
  const validThemes = ["ocean", "emerald", "dark"];

  if (!validThemes.includes(theme)) {
    theme = "ocean";
  }

  document.documentElement.dataset.theme = theme;
  localStorage.setItem("smartlib-theme", theme);

  if (graphState.canvas) {
    drawGraph();
  }
}

/* PROFILE */

async function loadProfile() {
  const result = await apiRequest(`${API}/profile`);
  const student = result.student;

  elements.studentName.textContent = student.name;
  elements.profileName.textContent = student.name;
  elements.profileEmail.textContent = student.email;
  elements.profileRole.textContent = student.role;
  elements.profileJoined.textContent = formatDate(student.created_at);

  const stats = student.stats || {};

  elements.totalRequests.textContent = stats.total_requests ?? 0;
  elements.pendingRequests.textContent = stats.pending_requests ?? 0;
  elements.activeLoans.textContent = stats.active_loans ?? 0;
  elements.returnedBooks.textContent = stats.returned_books ?? 0;
}

/* CATEGORIES */

async function loadCategories() {
  const result = await apiRequest(`${API}/categories`);

  if (!elements.categoryFilter) return;

  elements.categoryFilter.innerHTML =
    '<option value="">All Categories</option>';

  (result.categories || []).forEach(category => {
    const option = document.createElement("option");

    option.value = category.id;
    option.textContent = `${category.name} (${category.book_count})`;

    elements.categoryFilter.appendChild(option);
  });
}

/* BOOKS */

async function loadBooks() {
  if (!elements.bookGrid) return;

  elements.bookGrid.innerHTML =
    '<p class="loading-message">Loading books...</p>';

  const search = elements.bookSearch?.value.trim() || "";
  const categoryId = elements.categoryFilter?.value || "";

  const params = new URLSearchParams({
    page: currentPage,
    limit: pageLimit
  });

  if (search) params.set("search", search);
  if (categoryId) params.set("categoryId", categoryId);

  try {
    const result = await apiRequest(`${API}/books?${params}`);

    const books = result.books || [];
    const pagination = result.pagination || {};

    totalPages = pagination.totalPages || 1;

    if (elements.bookCount) {
      elements.bookCount.textContent =
        `${pagination.total || 0} books`;
    }

    renderBooks(books);
    renderPagination();
  } catch (error) {
    elements.bookGrid.innerHTML =
      '<p class="empty-message">Unable to load books.</p>';

    showMessage(error.message, true);
  }
}

function renderBooks(books) {
  if (!elements.bookGrid) return;

  if (!books.length) {
    elements.bookGrid.innerHTML =
      '<p class="empty-message">No books found. Try another search.</p>';

    return;
  }

  elements.bookGrid.innerHTML = books.map(book => {
    const available = Number(book.available_copies) > 0;

    return `
      <article class="book-card">
        <div class="book-card-icon">
          <i class="fas fa-book"></i>
        </div>

        <h3>${escapeHTML(book.title)}</h3>

        <p class="book-author">
          By ${escapeHTML(book.author)}
        </p>

        <p class="book-description">
          ${escapeHTML(book.description || "No description available.")}
        </p>

        <div class="book-meta">
          <span>${escapeHTML(book.category_name)}</span>

          <span class="availability ${available ? "" : "unavailable"}">
            ${available
              ? `${Number(book.available_copies)} available`
              : "Unavailable"}
          </span>
        </div>

        <div class="book-meta">
          <span>ISBN: ${escapeHTML(book.isbn || "N/A")}</span>
          <span>Total: ${Number(book.total_copies) || 0}</span>
        </div>

        <button
          class="request-button"
          data-book-id="${Number(book.id)}"
          ${available ? "" : "disabled"}
        >
          ${available ? "Request This Book" : "Currently Unavailable"}
        </button>
      </article>
    `;
  }).join("");
}

/* PAGINATION */

function renderPagination() {
  if (!elements.pagination) return;

  if (totalPages <= 1) {
    elements.pagination.innerHTML = "";
    return;
  }

  let html = `
    <button
      data-page="${currentPage - 1}"
      ${currentPage === 1 ? "disabled" : ""}
    >
      <i class="fas fa-chevron-left"></i>
    </button>
  `;

  for (let page = 1; page <= totalPages; page++) {
    html += `
      <button
        data-page="${page}"
        class="${page === currentPage ? "active" : ""}"
      >
        ${page}
      </button>
    `;
  }

  html += `
    <button
      data-page="${currentPage + 1}"
      ${currentPage === totalPages ? "disabled" : ""}
    >
      <i class="fas fa-chevron-right"></i>
    </button>
  `;

  elements.pagination.innerHTML = html;
}

/* BORROWING REQUEST */

async function requestBook(bookId) {
  const button = document.querySelector(
    `.request-button[data-book-id="${bookId}"]`
  );

  if (button) {
    button.disabled = true;
    button.textContent = "Submitting...";
  }

  try {
    const result = await apiRequest(`${API}/requests`, {
      method: "POST",
      body: JSON.stringify({
        bookId: Number(bookId)
      })
    });

    showMessage(
      result.message || "Borrowing request submitted successfully."
    );

    await Promise.all([
      loadBooks(),
      loadRequests(),
      loadProfile()
    ]);

    loadedSections.delete("recommendationsSection");
    loadedSections.delete("graphRecommendationsSection");

    if (
      document.getElementById("graphRecommendationsSection") &&
      !document.getElementById("graphRecommendationsSection").hidden
    ) {
      await loadGraphRecommendations(true);
    }
  } catch (error) {
    showMessage(error.message, true);

    if (button) {
      button.disabled = false;
      button.textContent = "Request This Book";
    }
  }
}

/* MY REQUESTS */

async function loadRequests() {
  if (!elements.requestsTable) return;

  try {
    const result = await apiRequest(`${API}/requests`);
    const requests = result.requests || [];

    if (!requests.length) {
      elements.requestsTable.innerHTML =
        '<tr><td colspan="4">You have not submitted any requests.</td></tr>';

      return;
    }

    elements.requestsTable.innerHTML = requests.map(request => `
      <tr>
        <td>${escapeHTML(request.book_title)}</td>
        <td>${formatDate(request.requested_at)}</td>
        <td>
          <span class="status-badge ${escapeHTML(request.status)}">
            ${escapeHTML(request.status)}
          </span>
        </td>
        <td>${escapeHTML(request.decision_note || "—")}</td>
      </tr>
    `).join("");
  } catch (error) {
    elements.requestsTable.innerHTML =
      '<tr><td colspan="4">Unable to load requests.</td></tr>';

    showMessage(error.message, true);
  }
}

/* MY LOANS */

async function loadLoans() {
  if (!elements.loansTable) return;

  try {
    const result = await apiRequest(`${API}/loans`);
    const loans = result.loans || [];

    if (!loans.length) {
      elements.loansTable.innerHTML =
        '<tr><td colspan="5">You have no borrowing history yet.</td></tr>';

      return;
    }

    elements.loansTable.innerHTML = loans.map(loan => {
      const status = loan.is_overdue
        ? "overdue"
        : loan.status;

      return `
        <tr>
          <td>${escapeHTML(loan.book_title)}</td>
          <td>${formatDate(loan.issue_date)}</td>
          <td>${formatDate(loan.due_date)}</td>
          <td>${formatDate(loan.return_date)}</td>
          <td>
            <span class="status-badge ${escapeHTML(status)}">
              ${escapeHTML(status)}
            </span>
          </td>
        </tr>
      `;
    }).join("");
  } catch (error) {
    elements.loansTable.innerHTML =
      '<tr><td colspan="5">Unable to load loans.</td></tr>';

    showMessage(error.message, true);
  }
}

/* RECOMMENDATION CARD RENDERER */

function renderRecommendationCards(recommendations, type) {
  if (!recommendations.length) {
    return `
      <div class="empty-message">
        <i class="fas fa-lightbulb"></i>
        <p>No recommendations available yet.</p>
        <small>
          ${type === "graph"
            ? "Graph recommendations improve as more students build reading histories."
            : "Explore and borrow books to improve your personalized recommendations."}
        </small>
      </div>
    `;
  }

  return recommendations.map(book => {
    const similarStudents = Number(
      book.similar_student_count ??
      book.similar_students ??
      0
    );

    return `
      <article class="book-card recommendation-card">
        <div class="book-card-icon">
          <i class="fas ${type === "graph"
            ? "fa-project-diagram"
            : "fa-wand-magic-sparkles"}"></i>
        </div>

        <h3>${escapeHTML(book.title)}</h3>

        <p class="book-author">
          By ${escapeHTML(book.author)}
        </p>

        <p class="book-description">
          ${escapeHTML(book.description || "A recommended book selected for you.")}
        </p>

        <div class="book-meta">
          <span>${escapeHTML(book.category_name || "General")}</span>

          <span class="availability ${
            Number(book.available_copies) > 0 ? "" : "unavailable"
          }">
            ${Number(book.available_copies) > 0
              ? `${Number(book.available_copies)} available`
              : "Unavailable"}
          </span>
        </div>

        ${type === "graph" ? `
          <div class="recommendation-reason">
            <i class="fas fa-users"></i>
            Recommended using reading patterns from
            ${similarStudents} similar reader${similarStudents === 1 ? "" : "s"}.
          </div>
        ` : `
          <div class="recommendation-reason">
            <i class="fas fa-star"></i>
            Selected using your reading interests.
          </div>
        `}

        <button
          class="request-button"
          data-book-id="${Number(book.id)}"
          ${Number(book.available_copies) > 0 ? "" : "disabled"}
        >
          ${Number(book.available_copies) > 0
            ? "Request This Book"
            : "Currently Unavailable"}
        </button>
      </article>
    `;
  }).join("");
}

/* CONTENT-BASED RECOMMENDATIONS */

async function loadContentRecommendations() {
  if (!elements.recommendationContent) return;

  elements.recommendationContent.innerHTML =
    '<p class="loading-message">Finding books based on your interests...</p>';

  try {
    const result = await apiRequest(
      `${API}/recommendations/content`
    );

    const recommendations = result.recommendations || [];

    elements.recommendationContent.innerHTML =
      renderRecommendationCards(recommendations, "content");

    loadedSections.add("recommendationsSection");
  } catch (error) {
    elements.recommendationContent.innerHTML = `
      <p class="empty-message">
        Unable to load content-based recommendations.
      </p>
    `;

    showMessage(error.message, true);
  }
}

/* GRAPH THEME */

function getGraphColors() {
  const styles = getComputedStyle(document.documentElement);

  const theme = document.documentElement.dataset.theme || "ocean";

  return {
    background: styles.getPropertyValue("--surface").trim() || (
      theme === "dark" ? "#171b27" :
      theme === "emerald" ? "#ffffff" : "#ffffff"
    ),

    text: styles.getPropertyValue("--text").trim() || (
      theme === "dark" ? "#f0f2f7" : "#172033"
    ),

    muted: styles.getPropertyValue("--muted").trim() || "#8290a5",

    border: styles.getPropertyValue("--border").trim() || "#dbe3eb",

    primary: styles.getPropertyValue("--primary").trim() || "#3478f6",

    student: "#367df5",
    reader: "#9b72e8",
    book: "#14a98b",
    recommended: "#f0a63b",
    reading: "#6b8fc9",
    similarity: "#a78bfa",
    recommendation: "#e6a23c"
  };
}

/* GRAPH STYLES */

function injectGraphStyles() {
  if (document.getElementById("smartlib-graph-styles")) return;

  const style = document.createElement("style");
  style.id = "smartlib-graph-styles";

  style.textContent = `
    #graphRecommendationContent {
      padding: 0 !important;
      border: none !important;
      background: transparent !important;
      min-height: 400px;
    }

    .sl-graph {
      color: var(--text, #172033);
      display: flex;
      flex-direction: column;
      gap: 18px;
      width: 100%;
    }

    .sl-graph-intro {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 15px;
      flex-wrap: wrap;
    }

    .sl-graph-intro h3 {
      margin: 0 0 6px;
      font-size: 19px;
    }

    .sl-graph-intro p {
      margin: 0;
      color: var(--muted, #8290a5);
      font-size: 13px;
      line-height: 1.6;
    }

    .sl-graph-live {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 8px 12px;
      border-radius: 30px;
      font-size: 11px;
      font-weight: 700;
      color: #138b68;
      background: rgba(20, 169, 139, .10);
    }

    .sl-graph-live::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #14a98b;
      box-shadow: 0 0 0 4px rgba(20, 169, 139, .12);
    }

    .sl-graph-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }

    .sl-graph-stat {
      padding: 15px;
      border-radius: 13px;
      background: var(--surface, #fff);
      border: 1px solid var(--border, #dbe3eb);
      min-width: 0;
    }

    .sl-graph-stat small {
      display: block;
      font-size: 11px;
      color: var(--muted, #8290a5);
      margin-bottom: 8px;
    }

    .sl-graph-stat strong {
      font-size: 24px;
      font-weight: 800;
      display: block;
    }

    .sl-graph-stat span {
      font-size: 10px;
      color: var(--muted, #8290a5);
    }

    .sl-graph-toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .sl-graph-filters {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .sl-graph-filter {
      border: 1px solid var(--border, #dbe3eb);
      background: var(--surface, #fff);
      color: var(--text, #172033);
      border-radius: 9px;
      padding: 9px 12px;
      font-size: 12px;
      cursor: pointer;
      transition: .2s ease;
    }

    .sl-graph-filter:hover {
      border-color: var(--primary, #3478f6);
    }

    .sl-graph-filter.active {
      color: #fff;
      background: var(--primary, #3478f6);
      border-color: var(--primary, #3478f6);
    }

    .sl-graph-search {
      flex: 1;
      min-width: 180px;
      max-width: 280px;
      border: 1px solid var(--border, #dbe3eb);
      border-radius: 9px;
      background: var(--surface, #fff);
      color: var(--text, #172033);
      padding: 10px 12px;
      outline: none;
      font-size: 12px;
    }

    .sl-graph-search:focus {
      border-color: var(--primary, #3478f6);
    }

    .sl-graph-workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 260px;
      gap: 14px;
      align-items: stretch;
    }

    .sl-graph-stage {
      position: relative;
      min-width: 0;
      height: 510px;
      overflow: hidden;
      border: 1px solid var(--border, #dbe3eb);
      border-radius: 15px;
      background:
        radial-gradient(circle at 50% 50%, rgba(70, 130, 220, .07), transparent 65%),
        var(--surface, #fff);
    }

    .sl-graph-canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
      cursor: grab;
    }

    .sl-graph-canvas:active {
      cursor: grabbing;
    }

    .sl-graph-controls {
      position: absolute;
      right: 12px;
      bottom: 12px;
      display: flex;
      gap: 5px;
    }

    .sl-graph-controls button {
      width: 34px;
      height: 34px;
      border-radius: 9px;
      border: 1px solid var(--border, #dbe3eb);
      color: var(--text, #172033);
      background: var(--surface, #fff);
      cursor: pointer;
      font-size: 16px;
    }

    .sl-graph-controls button:hover {
      border-color: var(--primary, #3478f6);
    }

    .sl-graph-legend {
      position: absolute;
      left: 12px;
      bottom: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 9px 11px;
      background: var(--surface, #fff);
      border: 1px solid var(--border, #dbe3eb);
      border-radius: 9px;
      font-size: 10px;
      color: var(--muted, #8290a5);
      pointer-events: none;
    }

    .sl-legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .sl-legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .sl-graph-details {
      min-width: 0;
      border: 1px solid var(--border, #dbe3eb);
      border-radius: 15px;
      background: var(--surface, #fff);
      padding: 17px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sl-graph-details h4 {
      margin: 0;
      font-size: 14px;
    }

    .sl-graph-details p {
      margin: 0;
      color: var(--muted, #8290a5);
      font-size: 12px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }

    .sl-node-type {
      display: inline-flex;
      align-self: flex-start;
      padding: 5px 9px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 700;
      background: rgba(54, 125, 245, .10);
      color: #367df5;
    }

    .sl-detail-line {
      padding: 10px;
      border-radius: 9px;
      background: rgba(120, 130, 150, .07);
      font-size: 11px;
    }

    .sl-detail-line span {
      display: block;
      color: var(--muted, #8290a5);
      margin-bottom: 4px;
    }

    .sl-detail-line strong {
      display: block;
      overflow-wrap: anywhere;
    }

    .sl-graph-details .request-button {
      margin-top: auto;
      width: 100%;
    }

    .sl-graph-note {
      padding: 13px 15px;
      border-radius: 11px;
      border: 1px solid rgba(54, 125, 245, .18);
      background: rgba(54, 125, 245, .06);
      font-size: 12px;
      line-height: 1.6;
      color: var(--text, #172033);
    }

    .sl-graph-note strong {
      display: block;
      margin-bottom: 3px;
    }

    .sl-graph-recommendations {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sl-graph-section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .sl-graph-section-heading h3 {
      font-size: 16px;
      margin: 0;
    }

    .sl-graph-section-heading span {
      color: var(--muted, #8290a5);
      font-size: 11px;
    }

    .sl-graph-book-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .sl-graph-book-grid .book-card {
      min-width: 0;
    }

    .sl-graph-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      text-align: center;
      min-height: 300px;
      padding: 25px;
      color: var(--muted, #8290a5);
    }

    .sl-graph-empty i {
      font-size: 35px;
      margin-bottom: 15px;
      color: var(--primary, #3478f6);
    }

    .sl-graph-empty strong {
      color: var(--text, #172033);
      margin-bottom: 7px;
    }

    @media (max-width: 1000px) {
      .sl-graph-workspace {
        grid-template-columns: minmax(0, 1fr);
      }

      .sl-graph-details {
        min-height: 180px;
      }

      .sl-graph-book-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 700px) {
      .sl-graph-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .sl-graph-stage {
        height: 420px;
      }

      .sl-graph-search {
        max-width: none;
        width: 100%;
      }
    }

    @media (max-width: 480px) {
      .sl-graph-book-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .sl-graph-stage {
        height: 370px;
      }

      .sl-graph-legend {
        gap: 7px;
        font-size: 9px;
      }
    }
  `;

  document.head.appendChild(style);
}

/* GRAPH FILTERING */

function getVisibleGraph() {
  const nodes = graphState.nodes;
  const edges = graphState.edges;

  const filter = graphState.filter;
  const search = graphState.search.trim().toLowerCase();

  let allowed = new Set();

  if (filter === "all") {
    nodes.forEach(node => allowed.add(node.id));
  }

  if (filter === "history") {
    nodes.forEach(node => {
      if (
        node.id === "student-self" ||
        node.isInReadingHistory
      ) {
        allowed.add(node.id);
      }
    });
  }

  if (filter === "readers") {
    nodes.forEach(node => {
      if (
        node.id === "student-self" ||
        node.type === "reader"
      ) {
        allowed.add(node.id);
      }
    });

    edges.forEach(edge => {
      if (
        edge.type === "peer-reading" ||
        edge.type === "shared-reading"
      ) {
        allowed.add(edge.target);
      }
    });
  }

  if (filter === "recommendations") {
    nodes.forEach(node => {
      if (
        node.id === "student-self" ||
        node.isRecommended
      ) {
        allowed.add(node.id);
      }
    });
  }

  if (search) {
    const matches = nodes.filter(node =>
      node.type === "book" &&
      `${node.title} ${node.author} ${node.category}`
        .toLowerCase()
        .includes(search)
    );

    const matchingIds = new Set(matches.map(node => node.id));

    edges.forEach(edge => {
      if (
        matchingIds.has(edge.source) ||
        matchingIds.has(edge.target)
      ) {
        matchingIds.add(edge.source);
        matchingIds.add(edge.target);
      }
    });

    allowed = new Set(
      [...allowed].filter(id => matchingIds.has(id))
    );

    allowed.add("student-self");

    // Search can find books even if the selected filter hides them.
    matches.forEach(node => allowed.add(node.id));
  }

  const visibleNodes = nodes.filter(node => allowed.has(node.id));

  const visibleIds = new Set(visibleNodes.map(node => node.id));

  const visibleEdges = edges.filter(edge =>
    visibleIds.has(edge.source) &&
    visibleIds.has(edge.target)
  );

  return {
    nodes: visibleNodes,
    edges: visibleEdges
  };
}

/* GRAPH INITIAL POSITIONS */

function initializeGraphPositions() {
  const width = graphState.width || 800;
  const height = graphState.height || 500;

  const centerX = width / 2;
  const centerY = height / 2;

  const nodes = graphState.nodes;

  nodes.forEach((node, index) => {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
      return;
    }

    if (node.type === "student") {
      node.x = centerX;
      node.y = centerY;
    } else {
      const angle = index * 2.39996;
      const radius = 75 + Math.sqrt(index + 1) * 35;

      node.x = centerX + Math.cos(angle) * radius;
      node.y = centerY + Math.sin(angle) * radius;
    }

    node.vx = 0;
    node.vy = 0;
    node.radius = node.type === "student" ? 22 :
      node.type === "reader" ? 15 : 11;
  });
}

/* GRAPH PHYSICS */

function updateGraphPhysics() {
  const nodes = graphState.nodes;
  const edges = graphState.edges;

  if (nodes.length < 2) return;

  const centerX = graphState.width / 2;
  const centerY = graphState.height / 2;

  const repulsion = 1800;
  const springStrength = 0.012;
  const damping = 0.88;

  for (const node of nodes) {
    if (node === graphState.draggedNode) continue;

    node.fx = 0;
    node.fy = 0;
  }

  // Repulsion between nodes.
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];

    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];

      let dx = b.x - a.x;
      let dy = b.y - a.y;

      const distanceSquared = dx * dx + dy * dy + 0.1;
      const distance = Math.sqrt(distanceSquared);

      const force = Math.min(1.5, repulsion / distanceSquared);

      dx /= distance;
      dy /= distance;

      const fx = dx * force;
      const fy = dy * force;

      if (a !== graphState.draggedNode) {
        a.fx -= fx;
        a.fy -= fy;
      }

      if (b !== graphState.draggedNode) {
        b.fx += fx;
        b.fy += fy;
      }
    }
  }

  // Attraction between connected nodes.
  const nodeMap = new Map(nodes.map(node => [node.id, node]));

  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);

    if (!source || !target) continue;

    const dx = target.x - source.x;
    const dy = target.y - source.y;

    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

    const desiredDistance = edge.type === "similarity" ? 125 : 105;

    const force =
      (distance - desiredDistance) * springStrength;

    const fx = dx / distance * force;
    const fy = dy / distance * force;

    if (source !== graphState.draggedNode) {
      source.fx += fx;
      source.fy += fy;
    }

    if (target !== graphState.draggedNode) {
      target.fx -= fx;
      target.fy -= fy;
    }
  }

  // Keep the network near the center.
  for (const node of nodes) {
    if (node === graphState.draggedNode) continue;

    node.fx += (centerX - node.x) * 0.0007;
    node.fy += (centerY - node.y) * 0.0007;

    node.vx = (node.vx + node.fx) * damping;
    node.vy = (node.vy + node.fy) * damping;

    node.x += node.vx;
    node.y += node.vy;

    const padding = 35;

    node.x = Math.max(
      padding,
      Math.min(graphState.width - padding, node.x)
    );

    node.y = Math.max(
      padding,
      Math.min(graphState.height - padding, node.y)
    );
  }
}

/* GRAPH CANVAS */

function resizeGraphCanvas() {
  const canvas = graphState.canvas;

  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  graphState.width = rect.width;
  graphState.height = rect.height;

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  const context = canvas.getContext("2d");

  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  graphState.context = context;

  drawGraph();
}

function drawGraph() {
  const context = graphState.context;

  if (!context) return;

  const width = graphState.width;
  const height = graphState.height;

  const colors = getGraphColors();

  context.clearRect(0, 0, width, height);

  // Subtle background grid.
  context.save();

  context.fillStyle = colors.background;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = colors.border;
  context.globalAlpha = 0.22;
  context.lineWidth = 0.6;

  const gridSize = 35;

  for (let x = 0; x < width; x += gridSize) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  for (let y = 0; y < height; y += gridSize) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.restore();

  const visible = getVisibleGraph();

  const nodeMap = new Map(
    visible.nodes.map(node => [node.id, node])
  );

  context.save();

  context.translate(graphState.offsetX, graphState.offsetY);
  context.scale(graphState.scale, graphState.scale);

  // Draw connections.
  for (const edge of visible.edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);

    if (!source || !target) continue;

    let color = colors.reading;

    if (edge.type === "similarity") color = colors.similarity;
    if (edge.type === "recommendation") color = colors.recommendation;
    if (edge.type === "peer-reading") color = colors.book;

    const isSelected =
      graphState.selectedNode &&
      (
        graphState.selectedNode.id === source.id ||
        graphState.selectedNode.id === target.id
      );

    context.beginPath();
    context.moveTo(source.x, source.y);
    context.lineTo(target.x, target.y);

    context.strokeStyle = color;
    context.globalAlpha = isSelected ? 0.9 : 0.38;
    context.lineWidth = isSelected ? 2.4 : 1.2;

    if (edge.type === "recommendation") {
      context.setLineDash([5, 5]);
    } else {
      context.setLineDash([]);
    }

    context.stroke();
  }

  context.setLineDash([]);
  context.globalAlpha = 1;

  // Draw nodes.
  for (const node of visible.nodes) {
    const isSelected =
      graphState.selectedNode?.id === node.id;

    const isHovered =
      graphState.hoveredNode?.id === node.id;

    let color = colors.book;

    if (node.type === "student") color = colors.student;
    if (node.type === "reader") color = colors.reader;
    if (node.isRecommended) color = colors.recommended;

    const radius = node.radius || 11;

    // Glow.
    if (isSelected || isHovered || node.isRecommended) {
      context.beginPath();
      context.arc(
        node.x,
        node.y,
        radius + (isSelected ? 12 : 8),
        0,
        Math.PI * 2
      );

      context.fillStyle = color;
      context.globalAlpha = isSelected ? 0.19 : 0.10;
      context.fill();
      context.globalAlpha = 1;
    }

    // Main node.
    context.beginPath();
    context.arc(node.x, node.y, radius, 0, Math.PI * 2);

    context.fillStyle = color;
    context.fill();

    context.lineWidth = isSelected ? 3 : 1.5;
    context.strokeStyle = colors.background;
    context.stroke();

    // Node label.
    const label = String(node.label || node.title || "");

    context.font = node.type === "student"
      ? "700 12px system-ui"
      : "500 10px system-ui";

    context.textAlign = "center";
    context.textBaseline = "top";

    context.fillStyle = colors.text;
    context.globalAlpha = 0.95;

    const maxLength = node.type === "book" ? 22 : 24;
    const displayLabel = label.length > maxLength
      ? `${label.slice(0, maxLength - 1)}…`
      : label;

    context.fillText(
      displayLabel,
      node.x,
      node.y + radius + 7
    );

    context.globalAlpha = 1;
  }

  context.restore();

  if (visible.nodes.length === 0) {
    context.fillStyle = colors.muted;
    context.font = "13px system-ui";
    context.textAlign = "center";
    context.fillText(
      "No matching graph connections found.",
      width / 2,
      height / 2
    );
  }
}

/* GRAPH ANIMATION */

function animateGraph() {
  if (graphState.destroyed || !graphState.canvas) return;

  if (!graphState.reducedMotion) {
    updateGraphPhysics();
  }

  drawGraph();

  graphState.animationFrame =
    requestAnimationFrame(animateGraph);
}

function stopGraphAnimation() {
  if (graphState.animationFrame) {
    cancelAnimationFrame(graphState.animationFrame);
    graphState.animationFrame = null;
  }
}

/* GRAPH COORDINATES */

function screenToGraph(clientX, clientY) {
  const rect = graphState.canvas.getBoundingClientRect();

  return {
    x: (clientX - rect.left - graphState.offsetX) / graphState.scale,
    y: (clientY - rect.top - graphState.offsetY) / graphState.scale
  };
}

function findGraphNode(x, y) {
  const visible = getVisibleGraph();

  for (let i = visible.nodes.length - 1; i >= 0; i--) {
    const node = visible.nodes[i];

    const dx = x - node.x;
    const dy = y - node.y;

    const radius = (node.radius || 11) + 7;

    if (dx * dx + dy * dy <= radius * radius) {
      return node;
    }
  }

  return null;
}

/* GRAPH NODE DETAILS */

function showGraphNodeDetails(node) {
  const panel = document.getElementById("slGraphDetails");

  if (!panel) return;

  if (!node) {
    panel.innerHTML = `
      <span class="sl-node-type">NETWORK OVERVIEW</span>
      <h4>Select a node</h4>
      <p>
        Select any student, reader or book node to explore its
        relationships and details.
      </p>
      <div class="sl-detail-line">
        <span>How to interact</span>
        <strong>Drag nodes, zoom and explore connections.</strong>
      </div>
    `;

    return;
  }

  const typeLabels = {
    student: "YOUR PROFILE",
    reader: "SIMILAR READER",
    book: "BOOK"
  };

  let details = "";

  if (node.type === "student") {
    details = `
      <div class="sl-detail-line">
        <span>Reading history</span>
        <strong>${Number(node.readingCount) || 0} books</strong>
      </div>
    `;
  }

  if (node.type === "reader") {
    details = `
      <div class="sl-detail-line">
        <span>Shared reading connections</span>
        <strong>${Number(node.sharedBooks) || 0} books</strong>
      </div>
      <p>
        This reader is anonymized. Their personal identity is not displayed.
      </p>
    `;
  }

  if (node.type === "book") {
    details = `
      <div class="sl-detail-line">
        <span>Author</span>
        <strong>${escapeHTML(node.author)}</strong>
      </div>

      <div class="sl-detail-line">
        <span>Category</span>
        <strong>${escapeHTML(node.category)}</strong>
      </div>

      <div class="sl-detail-line">
        <span>Available copies</span>
        <strong>${Number(node.availableCopies) || 0}</strong>
      </div>

      ${node.isInReadingHistory ? `
        <div class="sl-detail-line">
          <span>Relationship</span>
          <strong>In your reading history</strong>
        </div>
      ` : ""}

      ${node.isRecommended ? `
        <div class="sl-detail-line">
          <span>Recommendation</span>
          <strong>${escapeHTML(node.recommendationReason || "Recommended for you.")}</strong>
        </div>
      ` : ""}

      ${node.description ? `
        <p>${escapeHTML(node.description)}</p>
      ` : ""}

      ${Number(node.availableCopies) > 0 ? `
        <button
          class="request-button"
          data-book-id="${Number(node.id.replace("book-", ""))}"
        >
          Request This Book
        </button>
      ` : `
        <button class="request-button" disabled>
          Currently Unavailable
        </button>
      `}
    `;
  }

  panel.innerHTML = `
    <span class="sl-node-type">
      ${typeLabels[node.type] || "NETWORK NODE"}
    </span>

    <h4>${escapeHTML(node.title || node.label)}</h4>

    ${details}
  `;
}

/* GRAPH INTERACTION */

function initializeGraphInteractions(canvas) {
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;

    const point = screenToGraph(event.clientX, event.clientY);
    const node = findGraphNode(point.x, point.y);

    graphState.pointerDown = true;
    graphState.moved = false;

    graphState.lastPointer = {
      x: event.clientX,
      y: event.clientY
    };

    if (node) {
      graphState.draggedNode = node;
      graphState.selectedNode = node;
      node.vx = 0;
      node.vy = 0;

      canvas.setPointerCapture(event.pointerId);
      showGraphNodeDetails(node);
    } else {
      graphState.draggedNode = null;
      canvas.setPointerCapture(event.pointerId);
    }

    drawGraph();
  });

  canvas.addEventListener("pointermove", event => {
    if (!graphState.pointerDown) {
      const point = screenToGraph(event.clientX, event.clientY);
      graphState.hoveredNode = findGraphNode(point.x, point.y);

      canvas.style.cursor = graphState.hoveredNode
        ? "pointer"
        : "grab";

      drawGraph();
      return;
    }

    const dx = event.clientX - graphState.lastPointer.x;
    const dy = event.clientY - graphState.lastPointer.y;

    if (Math.abs(dx) + Math.abs(dy) > 2) {
      graphState.moved = true;
    }

    if (graphState.draggedNode) {
      const point = screenToGraph(event.clientX, event.clientY);

      graphState.draggedNode.x = point.x;
      graphState.draggedNode.y = point.y;
      graphState.draggedNode.vx = 0;
      graphState.draggedNode.vy = 0;
    } else {
      graphState.offsetX += dx;
      graphState.offsetY += dy;
    }

    graphState.lastPointer = {
      x: event.clientX,
      y: event.clientY
    };

    drawGraph();
  });

  function releasePointer(event) {
    graphState.pointerDown = false;
    graphState.draggedNode = null;

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);

  canvas.addEventListener("wheel", event => {
    event.preventDefault();

    const rect = canvas.getBoundingClientRect();

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const previousScale = graphState.scale;

    const factor = event.deltaY < 0 ? 1.12 : 0.89;

    graphState.scale = Math.max(
      0.35,
      Math.min(2.8, graphState.scale * factor)
    );

    const ratio = graphState.scale / previousScale;

    graphState.offsetX =
      mouseX - (mouseX - graphState.offsetX) * ratio;

    graphState.offsetY =
      mouseY - (mouseY - graphState.offsetY) * ratio;

    drawGraph();
  }, { passive: false });

  canvas.addEventListener("click", event => {
    if (graphState.moved) return;

    const point = screenToGraph(event.clientX, event.clientY);
    const node = findGraphNode(point.x, point.y);

    if (!node) {
      graphState.selectedNode = null;
      showGraphNodeDetails(null);
      drawGraph();
      return;
    }

    graphState.selectedNode = node;
    showGraphNodeDetails(node);
    drawGraph();
  });
}

/* GRAPH CONTROLS */

function initializeGraphControls() {
  const container = elements.graphRecommendationContent;

  if (!container) return;

  container.querySelectorAll("[data-graph-filter]").forEach(button => {
    button.addEventListener("click", () => {
      graphState.filter = button.dataset.graphFilter;

      container.querySelectorAll("[data-graph-filter]").forEach(item => {
        item.classList.toggle(
          "active",
          item === button
        );
      });

      if (
        graphState.selectedNode &&
        !getVisibleGraph().nodes.some(
          node => node.id === graphState.selectedNode.id
        )
      ) {
        graphState.selectedNode = null;
        showGraphNodeDetails(null);
      }

      drawGraph();
    });
  });

  const searchInput = document.getElementById("slGraphSearch");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      graphState.search = searchInput.value;
      drawGraph();
    });
  }

  const zoomIn = document.getElementById("slGraphZoomIn");
  const zoomOut = document.getElementById("slGraphZoomOut");
  const reset = document.getElementById("slGraphReset");

  zoomIn?.addEventListener("click", () => {
    graphState.scale = Math.min(2.8, graphState.scale * 1.2);
    drawGraph();
  });

  zoomOut?.addEventListener("click", () => {
    graphState.scale = Math.max(0.35, graphState.scale / 1.2);
    drawGraph();
  });

  reset?.addEventListener("click", () => {
    graphState.scale = 1;
    graphState.offsetX = 0;
    graphState.offsetY = 0;

    initializeGraphPositions();
    drawGraph();
  });
}

/* GRAPH RENDER */

function renderInteractiveGraph(data) {
  injectGraphStyles();

  stopGraphAnimation();

  graphState.destroyed = false;
  graphState.data = data;
  graphState.nodes = (data.nodes || []).map(node => ({
    ...node,
    x: undefined,
    y: undefined,
    vx: 0,
    vy: 0
  }));

  graphState.edges = (data.edges || []).map(edge => ({
    ...edge
  }));

  graphState.scale = 1;
  graphState.offsetX = 0;
  graphState.offsetY = 0;
  graphState.filter = "all";
  graphState.search = "";
  graphState.selectedNode = null;
  graphState.hoveredNode = null;

  const stats = data.stats || {};

  const recommendations = data.recommendations || [];

  const modeLabel = data.mode === "collaborative"
    ? "COLLABORATIVE"
    : data.mode === "popular-fallback"
      ? "POPULAR DISCOVERY"
      : "INTEREST BASED";

  const content = elements.graphRecommendationContent;

  content.innerHTML = `
    <div class="sl-graph">

      <div class="sl-graph-intro">
        <div>
          <h3>Your Reading Universe</h3>
          <p>
            Explore how books, reading patterns and recommendations
            connect in your library network.
          </p>
        </div>

        <span class="sl-graph-live">
          ${modeLabel}
        </span>
      </div>

      <div class="sl-graph-stats">

        <div class="sl-graph-stat">
          <small>NETWORK NODES</small>
          <strong>${Number(stats.nodes) || 0}</strong>
          <span>Connected elements</span>
        </div>

        <div class="sl-graph-stat">
          <small>CONNECTIONS</small>
          <strong>${Number(stats.edges) || 0}</strong>
          <span>Reading relationships</span>
        </div>

        <div class="sl-graph-stat">
          <small>SIMILAR READERS</small>
          <strong>${Number(stats.similarReaders) || 0}</strong>
          <span>Anonymous readers</span>
        </div>

        <div class="sl-graph-stat">
          <small>RECOMMENDATIONS</small>
          <strong>${Number(stats.recommendedBooks) || 0}</strong>
          <span>Suggested books</span>
        </div>

      </div>

      <div class="sl-graph-note">
        <strong>Why these books?</strong>
        ${escapeHTML(data.message || "Your reading graph has been generated.")}
      </div>

      <div class="sl-graph-toolbar">

        <div class="sl-graph-filters">
          <button class="sl-graph-filter active" data-graph-filter="all">
            All
          </button>

          <button class="sl-graph-filter" data-graph-filter="history">
            My History
          </button>

          <button class="sl-graph-filter" data-graph-filter="readers">
            Similar Readers
          </button>

          <button class="sl-graph-filter" data-graph-filter="recommendations">
            Recommended
          </button>
        </div>

        <input
          id="slGraphSearch"
          class="sl-graph-search"
          type="search"
          placeholder="Search a book in the graph..."
          autocomplete="off"
        />

      </div>

      <div class="sl-graph-workspace">

        <div class="sl-graph-stage">
          <canvas
            id="slGraphCanvas"
            class="sl-graph-canvas"
            aria-label="Interactive graph showing your reading history, similar readers and book recommendations"
          >
            Interactive reading graph. Use the controls to explore books and connections.
          </canvas>

          <div class="sl-graph-legend">
            <span class="sl-legend-item">
              <i class="sl-legend-dot" style="background:#367df5"></i>
              You
            </span>

            <span class="sl-legend-item">
              <i class="sl-legend-dot" style="background:#9b72e8"></i>
              Readers
            </span>

            <span class="sl-legend-item">
              <i class="sl-legend-dot" style="background:#14a98b"></i>
              Books
            </span>

            <span class="sl-legend-item">
              <i class="sl-legend-dot" style="background:#f0a63b"></i>
              Recommended
            </span>
          </div>

          <div class="sl-graph-controls">
            <button id="slGraphZoomIn" title="Zoom in" aria-label="Zoom in">+</button>
            <button id="slGraphZoomOut" title="Zoom out" aria-label="Zoom out">−</button>
            <button id="slGraphReset" title="Reset graph" aria-label="Reset graph">↺</button>
          </div>
        </div>

        <aside class="sl-graph-details" id="slGraphDetails">
          <span class="sl-node-type">NETWORK OVERVIEW</span>

          <h4>Select a node</h4>

          <p>
            Select any student, reader or book node to explore
            its relationships and details.
          </p>

          <div class="sl-detail-line">
            <span>How to interact</span>
            <strong>Drag nodes, zoom and explore connections.</strong>
          </div>
        </aside>

      </div>

      <div class="sl-graph-recommendations">

        <div class="sl-graph-section-heading">
          <h3>Books discovered for you</h3>
          <span>${recommendations.length} suggestions</span>
        </div>

        <div class="sl-graph-book-grid">
          ${renderRecommendationCards(recommendations, "graph")}
        </div>

      </div>

    </div>
  `;

  const canvas = document.getElementById("slGraphCanvas");

  if (!canvas) return;

  graphState.canvas = canvas;

  graphState.reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  initializeGraphPositions();
  resizeGraphCanvas();
  initializeGraphInteractions(canvas);
  initializeGraphControls();

  if (typeof ResizeObserver !== "undefined") {
    graphState.resizeObserver?.disconnect();

    graphState.resizeObserver = new ResizeObserver(() => {
      resizeGraphCanvas();
    });

    graphState.resizeObserver.observe(canvas);
  } else {
    window.addEventListener("resize", resizeGraphCanvas);
  }

  showGraphNodeDetails(null);

  animateGraph();
}

/* GRAPH-BASED RECOMMENDATIONS */

async function loadGraphRecommendations(force = false) {
  if (!elements.graphRecommendationContent) return;

  if (
    loadedSections.has("graphRecommendationsSection") &&
    !force
  ) {
    return;
  }

  elements.graphRecommendationContent.innerHTML = `
    <p class="loading-message">
      Building your reading network...
    </p>
  `;

  try {
    const result = await apiRequest(
      `${API}/recommendations/graph-data?limit=8`
    );

    renderInteractiveGraph(result);

    loadedSections.add("graphRecommendationsSection");
  } catch (error) {
    elements.graphRecommendationContent.innerHTML = `
      <div class="empty-message">
        <i class="fas fa-triangle-exclamation"></i>
        <p>Unable to load the reading graph.</p>
        <small>${escapeHTML(error.message)}</small>
      </div>
    `;

    showMessage(error.message, true);
  }
}

/* SIDEBAR */

function initializeSidebar() {
  const layout = elements.dashboardLayout;
  const toggle = elements.sidebarToggle;

  if (!layout || !toggle) return;

  toggle.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 700px)").matches) {
      layout.classList.toggle("sidebar-open");
    } else {
      layout.classList.toggle("sidebar-collapsed");
    }
  });
}

/* DASHBOARD NAVIGATION */

function initializeNavigation() {
  const buttons = document.querySelectorAll(".dashboard-nav-btn");
  const panels = document.querySelectorAll(".dashboard-panel");

  buttons.forEach(button => {
    button.addEventListener("click", async () => {
      const targetId = button.dataset.section;

      buttons.forEach(item => item.classList.remove("active"));

      panels.forEach(panel => {
        panel.classList.remove("active");
        panel.hidden = true;
      });

      button.classList.add("active");

      const target = document.getElementById(targetId);

      if (!target) return;

      target.hidden = false;
      target.classList.add("active");

      if (
        window.matchMedia("(max-width: 700px)").matches &&
        elements.dashboardLayout
      ) {
        elements.dashboardLayout.classList.remove("sidebar-open");
      }

      if (targetId === "recommendationsSection") {
        if (!loadedSections.has(targetId)) {
          await loadContentRecommendations();
        }
      }

      if (targetId === "graphRecommendationsSection") {
        if (!loadedSections.has(targetId)) {
          await loadGraphRecommendations();
        } else if (graphState.canvas) {
          resizeGraphCanvas();
        }
      }
    });
  });
}

/* SEARCH AND FILTER */

function initializeFilters() {
  if (elements.bookSearch) {
    elements.bookSearch.addEventListener("input", () => {
      clearTimeout(searchTimer);

      searchTimer = setTimeout(() => {
        currentPage = 1;
        loadBooks();
      }, 350);
    });
  }

  if (elements.categoryFilter) {
    elements.categoryFilter.addEventListener("change", () => {
      currentPage = 1;
      loadBooks();
    });
  }

  if (elements.pagination) {
    elements.pagination.addEventListener("click", event => {
      const button = event.target.closest("button[data-page]");

      if (!button || button.disabled) return;

      const page = Number(button.dataset.page);

      if (page >= 1 && page <= totalPages) {
        currentPage = page;
        loadBooks();
      }
    });
  }

  // Request buttons across books and recommendation sections.
  document.addEventListener("click", event => {
    const button = event.target.closest(".request-button");

    if (!button || button.disabled) return;

    if (!button.dataset.bookId) return;

    requestBook(button.dataset.bookId);
  });
}

/* LOGOUT */

function initializeLogout() {
  const button = document.getElementById("logoutBtn");

  if (!button) return;

  button.addEventListener("click", async () => {
    button.disabled = true;

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error("Logout failed.");
      }

      window.location.href = "/";
    } catch (error) {
      button.disabled = false;

      showMessage(
        "Unable to log out. Please try again.",
        true
      );
    }
  });
}

/* INITIALIZE */

async function initializeDashboard() {
  initializeTheme();
  initializeSidebar();
  initializeNavigation();
  initializeFilters();
  initializeLogout();

  try {
    await loadProfile();

    await Promise.all([
      loadCategories(),
      loadBooks(),
      loadRequests(),
      loadLoans()
    ]);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      window.location.href = "/";
      return;
    }

    showMessage(error.message, true);
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initializeDashboard
);
