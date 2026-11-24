
/* SMART LIB — ADMIN DASHBOARD */

"use strict";

const API = "/api/admin";

let currentBookPage = 1;
const booksPerPage = 12;
let bookSearchTimer = null;

const elements = {
  layout: document.querySelector(".dashboard-layout"),
  sidebar: document.getElementById("dashboardSidebar"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  logoutBtn: document.getElementById("logoutBtn"),
  themeSelect: document.getElementById("themeSelect"),
  pageTitle: document.getElementById("pageTitle"),

  navButtons: document.querySelectorAll(".dashboard-nav-btn"),
  sections: document.querySelectorAll(".dashboard-panel"),

  totalStudents: document.getElementById("totalStudents"),
  totalBooks: document.getElementById("totalBooks"),
  totalCategories: document.getElementById("totalCategories"),
  pendingRequests: document.getElementById("pendingRequests"),
  activeLoans: document.getElementById("activeLoans"),
  overdueLoans: document.getElementById("overdueLoans"),
  pendingRequestBadge: document.getElementById("pendingRequestBadge"),

  refreshDashboardBtn: document.getElementById("refreshDashboardBtn"),

  booksTableBody: document.getElementById("booksTableBody"),
  bookSearch: document.getElementById("bookSearch"),
  includeArchived: document.getElementById("includeArchived"),
  booksPagination: document.getElementById("booksPagination"),
  addBookBtn: document.getElementById("addBookBtn"),

  bookModal: document.getElementById("bookModal"),
  bookForm: document.getElementById("bookForm"),
  bookId: document.getElementById("bookId"),
  bookTitle: document.getElementById("bookTitle"),
  bookAuthor: document.getElementById("bookAuthor"),
  bookIsbn: document.getElementById("bookIsbn"),
  bookCategory: document.getElementById("bookCategory"),
  bookTotalCopies: document.getElementById("bookTotalCopies"),
  bookDescription: document.getElementById("bookDescription"),
  saveBookBtn: document.getElementById("saveBookBtn"),

  categoriesTableBody: document.getElementById("categoriesTableBody"),
  addCategoryBtn: document.getElementById("addCategoryBtn"),
  categoryModal: document.getElementById("categoryModal"),
  categoryForm: document.getElementById("categoryForm"),
  categoryId: document.getElementById("categoryId"),
  categoryName: document.getElementById("categoryName"),
  categoryDescription: document.getElementById("categoryDescription"),
  saveCategoryBtn: document.getElementById("saveCategoryBtn"),

  requestStatusFilter: document.getElementById("requestStatusFilter"),
  requestsTableBody: document.getElementById("requestsTableBody"),
  requestModal: document.getElementById("requestModal"),
  requestReviewForm: document.getElementById("requestReviewForm"),
  reviewRequestId: document.getElementById("reviewRequestId"),
  reviewDecision: document.getElementById("reviewDecision"),
  reviewRequestDetails: document.getElementById("reviewRequestDetails"),
  decisionNote: document.getElementById("decisionNote"),
  confirmReviewBtn: document.getElementById("confirmReviewBtn"),

  loanStatusFilter: document.getElementById("loanStatusFilter"),
  loansTableBody: document.getElementById("loansTableBody"),

  message: document.getElementById("dashboardMessage")
};

/* ================= HELPERS ================= */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function showMessage(message, type = "success") {
  if (!elements.message) {
    alert(message);
    return;
  }

  elements.message.textContent = message;
  elements.message.className = `dashboard-message ${type}`;

  window.clearTimeout(showMessage.timer);

  showMessage.timer = window.setTimeout(() => {
    elements.message.className = "dashboard-message";
    elements.message.textContent = "";
  }, 4000);
}

async function apiRequest(endpoint, options = {}) {
  const config = {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  };

  let response;

  try {
    response = await fetch(endpoint, config);
  } catch {
    throw new Error("Unable to connect to the server. Check your connection.");
  }

  let result = {};

  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (response.status === 401 || response.status === 403) {
    showMessage(
      "Your session has expired or you do not have admin access.",
      "error"
    );

    window.setTimeout(() => {
      window.location.href = "/";
    }, 1200);

    throw new Error("Authentication required.");
  }

  if (!response.ok) {
    throw new Error(
      result.error || result.message || "Something went wrong."
    );
  }

  return result;
}

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

function formatStatus(status) {
  const safeStatus = String(status || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  const label = escapeHTML(safeStatus.replaceAll("_", " "));

  return `
    <span class="status-badge status-${safeStatus}">
      ${label}
    </span>
  `;
}

function showLoading(tableBody, columns, message = "Loading...") {
  if (!tableBody) return;

  tableBody.innerHTML = `
    <tr>
      <td colspan="${columns}" class="table-placeholder">
        ${escapeHTML(message)}
      </td>
    </tr>
  `;
}

function showEmpty(tableBody, columns, message = "No records found.") {
  if (!tableBody) return;

  tableBody.innerHTML = `
    <tr>
      <td colspan="${columns}" class="table-placeholder">
        ${escapeHTML(message)}
      </td>
    </tr>
  `;
}

function setButtonLoading(button, loading, loadingText = "Please wait...") {
  if (!button) return;

  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }

    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    delete button.dataset.originalText;
    button.disabled = false;
  }
}

/* ================= NAVIGATION ================= */

function openSection(sectionId) {
  if (!sectionId) return;

  const targetSection = document.getElementById(sectionId);

  if (!targetSection || !targetSection.classList.contains("dashboard-panel")) {
    return;
  }

  // Activate the selected navigation button.
  elements.navButtons.forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.section === sectionId
    );
  });

  // Display the selected dashboard panel.
  elements.sections.forEach(section => {
    section.classList.toggle("active", section.id === sectionId);
  });

  // Update the page heading.
  if (elements.pageTitle) {
    const activeButton = [...elements.navButtons].find(
      button => button.dataset.section === sectionId
    );

    if (activeButton) {
      const label = activeButton.querySelector(
        "span:not(.nav-icon):not(.nav-count)"
      );

      elements.pageTitle.textContent = label
        ? label.textContent.trim()
        : activeButton.textContent.trim();
    }
  }

  // Close mobile sidebar after navigation.
  if (window.innerWidth <= 700 && elements.layout) {
    elements.layout.classList.remove("sidebar-open");
  }

  // Load the data needed by the selected page.
  switch (sectionId) {
    case "overviewSection":
      loadDashboard();
      break;

    case "booksSection":
      loadBooks();
      loadCategories();
      break;

    case "categoriesSection":
      loadCategories();
      break;

    case "requestsSection":
      loadRequests();
      break;

    case "loansSection":
      loadLoans();
      break;
  }
}

/* ================= MODALS ================= */

function openModal(modal) {
  if (!modal) return;

  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal(modal) {
  if (!modal) return;

  modal.hidden = true;

  const openModals = document.querySelectorAll(
    ".admin-modal:not([hidden])"
  );

  if (!openModals.length) {
    document.body.style.overflow = "";
  }
}

function closeAllModals() {
  document.querySelectorAll(".admin-modal").forEach(closeModal);
}

/* ================= THEME ================= */

function initializeTheme() {
  const savedTheme = localStorage.getItem("smartlib-theme") || "ocean";

  document.documentElement.dataset.theme = savedTheme;

  if (elements.themeSelect) {
    elements.themeSelect.value = savedTheme;
  }
}

function changeTheme(theme) {
  if (!["ocean", "emerald", "dark"].includes(theme)) return;

  document.documentElement.dataset.theme = theme;
  localStorage.setItem("smartlib-theme", theme);
}

/* ================= DASHBOARD STATS ================= */

async function loadDashboard() {
  try {
    const result = await apiRequest(`${API}/dashboard`);
    const stats = result.data || {};

    if (elements.totalStudents) {
      elements.totalStudents.textContent = stats.totalStudents ?? 0;
    }

    if (elements.totalBooks) {
      elements.totalBooks.textContent = stats.totalBooks ?? 0;
    }

    if (elements.totalCategories) {
      elements.totalCategories.textContent = stats.totalCategories ?? 0;
    }

    if (elements.pendingRequests) {
      elements.pendingRequests.textContent = stats.pendingRequests ?? 0;
    }

    if (elements.activeLoans) {
      elements.activeLoans.textContent = stats.activeLoans ?? 0;
    }

    if (elements.overdueLoans) {
      elements.overdueLoans.textContent = stats.overdueLoans ?? 0;
    }

    if (elements.pendingRequestBadge) {
      elements.pendingRequestBadge.textContent = stats.pendingRequests ?? 0;
      elements.pendingRequestBadge.hidden = !(stats.pendingRequests > 0);
    }
  } catch (error) {
    showMessage(error.message, "error");
  }
}

/* ================= BOOKS ================= */

async function loadBooks(page = currentBookPage) {
  if (!elements.booksTableBody) return;

  currentBookPage = page;
  showLoading(elements.booksTableBody, 7);

  const params = new URLSearchParams({
    page: String(page),
    limit: String(booksPerPage),
    search: elements.bookSearch?.value.trim() || "",
    includeArchived: String(Boolean(elements.includeArchived?.checked))
  });

  try {
    const result = await apiRequest(`${API}/books?${params}`);
    const data = result.data || {};
    const books = data.books || [];

    if (!books.length) {
      showEmpty(elements.booksTableBody, 7, "No books found.");
      renderPagination(data.pagination);
      return;
    }

    elements.booksTableBody.innerHTML = books.map(book => {
      const archived = Boolean(book.is_archived ?? book.archived);

      return `
        <tr>
          <td>
            <span class="table-primary-text">
              ${escapeHTML(book.title)}
            </span>
          </td>

          <td>${escapeHTML(book.isbn || "—")}</td>

          <td>${escapeHTML(book.category_name || "Uncategorized")}</td>

          <td>${escapeHTML(book.total_copies ?? 0)}</td>

          <td>${escapeHTML(book.available_copies ?? 0)}</td>

          <td>
            ${archived ? formatStatus("archived") : formatStatus("active")}
          </td>

          <td>
            <div class="table-actions">
              <button
                class="table-action-btn"
                data-action="edit-book"
                data-id="${escapeHTML(book.id)}"
              >
                Edit
              </button>

              ${
                archived
                  ? `
                    <button
                      class="table-action-btn success"
                      data-action="restore-book"
                      data-id="${escapeHTML(book.id)}"
                    >
                      Restore
                    </button>
                  `
                  : `
                    <button
                      class="table-action-btn danger"
                      data-action="archive-book"
                      data-id="${escapeHTML(book.id)}"
                    >
                      Archive
                    </button>
                  `
              }
            </div>
          </td>
        </tr>
      `;
    }).join("");

    renderPagination(data.pagination);
  } catch (error) {
    showEmpty(elements.booksTableBody, 7, error.message);
    showMessage(error.message, "error");
  }
}

function renderPagination(pagination = {}) {
  if (!elements.booksPagination) return;

  const totalPages = Math.max(1, Number(pagination.totalPages || 1));
  const currentPage = Number(pagination.page || currentBookPage);

  if (totalPages <= 1) {
    elements.booksPagination.innerHTML = "";
    return;
  }

  let html = `
    <button
      data-page="${currentPage - 1}"
      ${currentPage <= 1 ? "disabled" : ""}
    >
      Prev
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
      ${currentPage >= totalPages ? "disabled" : ""}
    >
      Next
    </button>
  `;

  elements.booksPagination.innerHTML = html;
}

function openBookModal(book = null) {
  if (!elements.bookForm) return;

  elements.bookForm.reset();

  elements.bookId.value = book?.id || "";

  if (book) {
    elements.bookTitle.value = book.title || "";
    elements.bookAuthor.value = book.author || "";
    elements.bookIsbn.value = book.isbn || "";
    elements.bookCategory.value = book.category_id ?? book.categoryId ?? "";
    elements.bookTotalCopies.value =
      book.total_copies ?? book.totalCopies ?? 1;
    elements.bookDescription.value = book.description || "";
  }

  const heading = elements.bookModal?.querySelector(".modal-header h2");

  if (heading) {
    heading.textContent = book ? "Edit Book" : "Add New Book";
  }

  openModal(elements.bookModal);
}

async function saveBook(event) {
  event.preventDefault();

  const id = elements.bookId.value;

  const payload = {
    title: elements.bookTitle.value.trim(),
    author: elements.bookAuthor.value.trim(),
    isbn: elements.bookIsbn.value.trim(),
    categoryId: Number(elements.bookCategory.value),
    totalCopies: Number(elements.bookTotalCopies.value),
    description: elements.bookDescription.value.trim()
  };

  if (
    !payload.title ||
    !payload.author ||
    !payload.categoryId ||
    !payload.totalCopies
  ) {
    showMessage("Please complete all required book fields.", "error");
    return;
  }

  setButtonLoading(elements.saveBookBtn, true);

  try {
    if (id) {
      await apiRequest(`${API}/books/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });

      showMessage("Book updated successfully.");
    } else {
      await apiRequest(`${API}/books`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showMessage("Book added successfully.");
    }

    closeModal(elements.bookModal);

    await Promise.all([
      loadBooks(1),
      loadDashboard()
    ]);
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setButtonLoading(elements.saveBookBtn, false, "Save Book");
  }
}

async function editBook(id) {
  try {
    const result = await apiRequest(
      `${API}/books?limit=50&includeArchived=true`
    );

    const books = result.data?.books || [];

    const book = books.find(
      item => String(item.id) === String(id)
    );

    if (!book) {
      showMessage(
        "Book not found. Refresh the list and try again.",
        "error"
      );
      return;
    }

    await loadCategories();
    openBookModal(book);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function changeBookArchiveStatus(id, archived) {
  const action = archived ? "archive" : "restore";

  if (!window.confirm(`Are you sure you want to ${action} this book?`)) {
    return;
  }

  try {
    await apiRequest(
      `${API}/books/${encodeURIComponent(id)}/${action}`,
      { method: "PATCH" }
    );

    showMessage(
      `Book ${archived ? "archived" : "restored"} successfully.`
    );

    await Promise.all([
      loadBooks(),
      loadDashboard()
    ]);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

/* ================= CATEGORIES ================= */

async function loadCategories() {
  if (!elements.categoriesTableBody && !elements.bookCategory) return;

  if (elements.categoriesTableBody) {
    showLoading(elements.categoriesTableBody, 4);
  }

  try {
    const result = await apiRequest(`${API}/categories`);
    const categories = result.data || [];

    if (elements.categoriesTableBody) {
      if (!categories.length) {
        showEmpty(
          elements.categoriesTableBody,
          4,
          "No categories found."
        );
      } else {
        elements.categoriesTableBody.innerHTML = categories.map(category => `
          <tr>
            <td>
              <span class="table-primary-text">
                ${escapeHTML(category.name)}
              </span>
            </td>

            <td>${escapeHTML(category.description || "—")}</td>

            <td>${escapeHTML(category.book_count ?? 0)}</td>

            <td>
              <div class="table-actions">
                <button
                  class="table-action-btn"
                  data-action="edit-category"
                  data-id="${escapeHTML(category.id)}"
                >
                  Edit
                </button>

                <button
                  class="table-action-btn danger"
                  data-action="delete-category"
                  data-id="${escapeHTML(category.id)}"
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        `).join("");
      }
    }

    if (elements.bookCategory) {
      const selected = elements.bookCategory.value;

      elements.bookCategory.innerHTML = `
        <option value="">Select category</option>

        ${categories.map(category => `
          <option value="${escapeHTML(category.id)}">
            ${escapeHTML(category.name)}
          </option>
        `).join("")}
      `;

      elements.bookCategory.value = selected;
    }

    return categories;
  } catch (error) {
    if (elements.categoriesTableBody) {
      showEmpty(elements.categoriesTableBody, 4, error.message);
    }

    showMessage(error.message, "error");
    return [];
  }
}

function openCategoryModal(category = null) {
  elements.categoryForm?.reset();

  elements.categoryId.value = category?.id || "";
  elements.categoryName.value = category?.name || "";
  elements.categoryDescription.value = category?.description || "";

  const heading = elements.categoryModal?.querySelector(
    ".modal-header h2"
  );

  if (heading) {
    heading.textContent = category ? "Edit Category" : "Add Category";
  }

  openModal(elements.categoryModal);
}

async function saveCategory(event) {
  event.preventDefault();

  const id = elements.categoryId.value;

  const payload = {
    name: elements.categoryName.value.trim(),
    description: elements.categoryDescription.value.trim()
  };

  if (!payload.name) {
    showMessage("Category name is required.", "error");
    return;
  }

  setButtonLoading(elements.saveCategoryBtn, true);

  try {
    if (id) {
      await apiRequest(`${API}/categories/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });

      showMessage("Category updated successfully.");
    } else {
      await apiRequest(`${API}/categories`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showMessage("Category created successfully.");
    }

    closeModal(elements.categoryModal);

    await Promise.all([
      loadCategories(),
      loadDashboard(),
      loadBooks()
    ]);
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setButtonLoading(elements.saveCategoryBtn, false, "Save Category");
  }
}

async function deleteCategory(id) {
  if (!window.confirm("Are you sure you want to delete this category?")) {
    return;
  }

  try {
    await apiRequest(`${API}/categories/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });

    showMessage("Category deleted successfully.");

    await Promise.all([
      loadCategories(),
      loadDashboard()
    ]);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

/* ================= REQUESTS ================= */

// The existing HTML has a hidden reviewDecision input.
// Convert it into a visible dropdown so the admin can choose a decision.
function initializeReviewDecisionField() {
  const field = elements.reviewDecision;

  if (!field || field.tagName === "SELECT") return;

  if (field.type === "hidden") {
    const select = document.createElement("select");

    select.id = "reviewDecision";
    select.name = field.name || "decision";
    select.required = true;
    select.className = field.className || "";

    select.innerHTML = `
      <option value="">Choose decision</option>
      <option value="approved">Approve Request</option>
      <option value="rejected">Reject Request</option>
    `;

    field.replaceWith(select);
    elements.reviewDecision = select;
  }
}

async function loadRequests() {
  if (!elements.requestsTableBody) return;

  showLoading(elements.requestsTableBody, 6);

  const status = elements.requestStatusFilter?.value || "";
  const params = new URLSearchParams();

  if (status) {
    params.set("status", status);
  }

  try {
    const result = await apiRequest(`${API}/requests?${params}`);
    const requests = result.data || [];

    if (!requests.length) {
      showEmpty(elements.requestsTableBody, 6, "No requests found.");
      return;
    }

    elements.requestsTableBody.innerHTML = requests.map(request => `
      <tr>
        <td>
          <span class="table-primary-text">
            ${escapeHTML(request.student_name)}
          </span>

          <span class="table-secondary-text">
            ${escapeHTML(request.student_email)}
          </span>
        </td>

        <td>
          <span class="table-primary-text">
            ${escapeHTML(request.book_title)}
          </span>

          <span class="table-secondary-text">
            ${escapeHTML(request.book_author)}
          </span>
        </td>

        <td>${formatDate(request.requested_at)}</td>

        <td>${formatStatus(request.status)}</td>

        <td>
          ${escapeHTML(request.decision_note || request.reviewer_name || "—")}
        </td>

        <td>
          ${
            request.status === "pending"
              ? `
                <button
                  class="table-action-btn"
                  data-action="review-request"
                  data-id="${escapeHTML(request.id)}"
                >
                  Review
                </button>
              `
              : `<span class="table-secondary-text">Reviewed</span>`
          }
        </td>
      </tr>
    `).join("");
  } catch (error) {
    showEmpty(elements.requestsTableBody, 6, error.message);
    showMessage(error.message, "error");
  }
}

function openReviewModal(request) {
  elements.requestReviewForm?.reset();

  elements.reviewRequestId.value = request.id;

  if (elements.reviewDecision) {
    elements.reviewDecision.value = "";
  }

  elements.reviewRequestDetails.innerHTML = `
    <strong>Student:</strong> ${escapeHTML(request.student_name)}<br>
    <strong>Email:</strong> ${escapeHTML(request.student_email)}<br>
    <strong>Book:</strong> ${escapeHTML(request.book_title)}<br>
    <strong>Author:</strong> ${escapeHTML(request.book_author)}
  `;

  openModal(elements.requestModal);
}

async function reviewRequest(event) {
  event.preventDefault();

  const id = elements.reviewRequestId.value;

  const payload = {
    decision: elements.reviewDecision?.value || "",
    decisionNote: elements.decisionNote.value.trim()
  };

  if (!["approved", "rejected"].includes(payload.decision)) {
    showMessage("Choose a valid request decision.", "error");
    return;
  }

  setButtonLoading(elements.confirmReviewBtn, true);

  try {
    await apiRequest(
      `${API}/requests/${encodeURIComponent(id)}/review`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );

    showMessage(`Request ${payload.decision} successfully.`);

    closeModal(elements.requestModal);

    await Promise.all([
      loadRequests(),
      loadDashboard(),
      loadBooks(),
      loadLoans()
    ]);
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    setButtonLoading(
      elements.confirmReviewBtn,
      false,
      "Submit Review"
    );
  }
}

/* ================= LOANS ================= */

async function loadLoans() {
  if (!elements.loansTableBody) return;

  showLoading(elements.loansTableBody, 7);

  const status = elements.loanStatusFilter?.value || "";
  const params = new URLSearchParams();

  if (status) {
    params.set("status", status);
  }

  try {
    const result = await apiRequest(`${API}/loans?${params}`);
    const loans = result.data || [];

    if (!loans.length) {
      showEmpty(elements.loansTableBody, 7, "No loans found.");
      return;
    }

    elements.loansTableBody.innerHTML = loans.map(loan => {
      const overdue = Boolean(loan.is_overdue);

      return `
        <tr>
          <td>
            <span class="table-primary-text">
              ${escapeHTML(loan.student_name)}
            </span>

            <span class="table-secondary-text">
              ${escapeHTML(loan.student_email)}
            </span>
          </td>

          <td>
            <span class="table-primary-text">
              ${escapeHTML(loan.book_title)}
            </span>

            <span class="table-secondary-text">
              ${escapeHTML(loan.book_author)}
            </span>
          </td>

          <td>${formatDate(loan.issue_date)}</td>

          <td>${formatDate(loan.due_date)}</td>

          <td>${formatDate(loan.return_date)}</td>

          <td>
            ${
              loan.status === "active" && overdue
                ? formatStatus("overdue")
                : formatStatus(loan.status)
            }
          </td>

          <td>
            ${
              loan.status === "active"
                ? `
                  <button
                    class="table-action-btn success"
                    data-action="return-loan"
                    data-id="${escapeHTML(loan.id)}"
                  >
                    Return
                  </button>
                `
                : `<span class="table-secondary-text">Completed</span>`
            }
          </td>
        </tr>
      `;
    }).join("");
  } catch (error) {
    showEmpty(elements.loansTableBody, 7, error.message);
    showMessage(error.message, "error");
  }
}

async function returnLoan(id) {
  if (!window.confirm("Confirm that this book has been returned?")) {
    return;
  }

  try {
    await apiRequest(
      `${API}/loans/${encodeURIComponent(id)}/return`,
      { method: "POST" }
    );

    showMessage("Book returned successfully.");

    await Promise.all([
      loadLoans(),
      loadDashboard(),
      loadBooks()
    ]);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

/* ================= EVENT LISTENERS ================= */

function initializeEventListeners() {
  // Sidebar navigation.
  elements.navButtons.forEach(button => {
    button.addEventListener("click", () => {
      openSection(button.dataset.section);
    });
  });

  // Quick action buttons.
  document.querySelectorAll("[data-open-section]").forEach(button => {
    button.addEventListener("click", () => {
      openSection(button.dataset.openSection);
    });
  });

  // Sidebar toggle.
  elements.sidebarToggle?.addEventListener("click", () => {
    if (!elements.layout) return;

    if (window.innerWidth <= 700) {
      elements.layout.classList.toggle("sidebar-open");
    } else {
      elements.layout.classList.toggle("sidebar-collapsed");
    }
  });

  // Theme selection.
  elements.themeSelect?.addEventListener("change", event => {
    changeTheme(event.target.value);
  });

  // Logout.
  elements.logoutBtn?.addEventListener("click", async () => {
    if (!window.confirm("Are you sure you want to log out?")) return;

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
    } finally {
      window.location.href = "/";
    }
  });

  // Refresh dashboard data.
  elements.refreshDashboardBtn?.addEventListener("click", async () => {
    await Promise.all([
      loadDashboard(),
      loadBooks(),
      loadCategories(),
      loadRequests(),
      loadLoans()
    ]);

    showMessage("Dashboard refreshed.");
  });

  /* BOOKS */

  elements.addBookBtn?.addEventListener("click", async () => {
    await loadCategories();
    openBookModal();
  });

  elements.bookForm?.addEventListener("submit", saveBook);

  elements.bookSearch?.addEventListener("input", () => {
    window.clearTimeout(bookSearchTimer);

    bookSearchTimer = window.setTimeout(() => {
      loadBooks(1);
    }, 350);
  });

  elements.includeArchived?.addEventListener("change", () => {
    loadBooks(1);
  });

  elements.booksPagination?.addEventListener("click", event => {
    const button = event.target.closest("[data-page]");

    if (!button || button.disabled) return;

    loadBooks(Number(button.dataset.page));
  });

  elements.booksTableBody?.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");

    if (!button) return;

    const { action, id } = button.dataset;

    if (action === "edit-book") {
      await editBook(id);
    } else if (action === "archive-book") {
      await changeBookArchiveStatus(id, true);
    } else if (action === "restore-book") {
      await changeBookArchiveStatus(id, false);
    }
  });

  /* CATEGORIES */

  elements.addCategoryBtn?.addEventListener("click", () => {
    openCategoryModal();
  });

  elements.categoryForm?.addEventListener("submit", saveCategory);

  elements.categoriesTableBody?.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");

    if (!button) return;

    const { action, id } = button.dataset;

    if (action === "delete-category") {
      await deleteCategory(id);
    } else if (action === "edit-category") {
      try {
        const result = await apiRequest(`${API}/categories`);

        const category = (result.data || []).find(
          item => String(item.id) === String(id)
        );

        if (category) {
          openCategoryModal(category);
        }
      } catch (error) {
        showMessage(error.message, "error");
      }
    }
  });

  /* REQUESTS */

  elements.requestStatusFilter?.addEventListener(
    "change",
    loadRequests
  );

  elements.requestReviewForm?.addEventListener(
    "submit",
    reviewRequest
  );

  elements.requestsTableBody?.addEventListener("click", async event => {
    const button = event.target.closest(
      '[data-action="review-request"]'
    );

    if (!button) return;

    try {
      const result = await apiRequest(`${API}/requests`);

      const request = (result.data || []).find(
        item => String(item.id) === String(button.dataset.id)
      );

      if (request) {
        openReviewModal(request);
      }
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  /* LOANS */

  elements.loanStatusFilter?.addEventListener(
    "change",
    loadLoans
  );

  elements.loansTableBody?.addEventListener("click", async event => {
    const button = event.target.closest(
      '[data-action="return-loan"]'
    );

    if (!button) return;

    await returnLoan(button.dataset.id);
  });

  /* MODAL CLOSING */

  document.querySelectorAll("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => {
      const modal = document.getElementById(
        button.dataset.closeModal
      );

      closeModal(modal);
    });
  });

  document.querySelectorAll(".admin-modal").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target.classList.contains("modal-backdrop")) {
        closeModal(modal);
      }
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeAllModals();
    }
  });
}

/* ================= INITIALIZATION ================= */

async function initializeAdminDashboard() {
  initializeTheme();

  // Make the request decision field usable before attaching listeners.
  initializeReviewDecisionField();

  initializeEventListeners();

  // Load the initial dashboard data.
  await Promise.all([
    loadDashboard(),
    loadBooks(),
    loadCategories(),
    loadRequests(),
    loadLoans()
  ]);

  // Start on the Overview section.
  openSection("overviewSection");
}

document.addEventListener(
  "DOMContentLoaded",
  initializeAdminDashboard
);
