/* ===========================================================
Aurelia · Company Directory — behavior
Data: jsonplaceholder.typicode.com (users + todos)
=========================================================== */

const USERS_URL = "https://jsonplaceholder.typicode.com/users";
const TODOS_URL = "https://jsonplaceholder.typicode.com/todos";

const AUTO_SLIDE_MS = 6000;

let users = []; // all 10 users, each carrying its own edited copy
let todosByUser = {}; // { [userId]: [ {id, title, completed, priority, due}, ... ] }
let currentIndex = 0;
let isEditing = false;
let autoSlideTimer = null;
let nextLocalTaskId = 900000; // safe range above real todo ids

const el = (id) => document.getElementById(id);

const profileCard = el("profile-card");
const avatarEl = el("avatar");
const nameEl = el("profile-name");
const roleEl = el("profile-role");
const tagCompanyEl = el("tag-company");
const tagCityEl = el("tag-city");
const editBtn = el("edit-btn");
const dotsContainer = el("dots-container");
const pageCounter = el("page-counter");
const prevBtn = el("prev-btn");
const nextBtn = el("next-btn");

const tasksTitle = el("tasks-title");
const statCompleted = el("stat-completed");
const statOpen = el("stat-open");
const statTotal = el("stat-total");
const tasksBody = el("tasks-body");
const addTaskForm = el("add-task-form");
const newTaskInput = el("new-task-input");

/* ---------------- Date in the top bar ---------------- */
(function setToday() {
  const d = new Date();
  const opts = { weekday: "long", month: "short", day: "numeric" };
  el("today-date").textContent = d.toLocaleDateString("en-US", opts);
})();

/* ---------------- Deterministic priority / due date ----------------
   jsonplaceholder todos don't include priority/due fields, so we
   derive stable, repeatable values from each todo's id.
--------------------------------------------------------------------*/
function priorityForId(id) {
  const options = ["high", "medium", "low"];
  return options[id % 3];
}

function dueDateForId(id) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = (id % 28) + 1;
  const month = months[Math.floor(id / 7) % 12];
  return `${month} ${day}`;
}

function defaultDueForNewTask() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];
return `${months[d.getMonth()]} ${d.getDate()}`;
}

/* ---------------- Fetch data ---------------- */
async function loadData() {
try {
    const [usersRes, todosRes] = await Promise.all([
    fetch(USERS_URL),
    fetch(TODOS_URL),
    ]);
    const usersJson = await usersRes.json();
    console.log("Fetched users:", usersJson);
    const todosJson = await todosRes.json();

    users = usersJson.map((u) => ({ ...u })); // local editable copies

    todosByUser = {};
    todosJson.forEach((t) => {
      if (!todosByUser[t.userId]) todosByUser[t.userId] = [];
      todosByUser[t.userId].push({
        id: t.id,
        title: t.title,
        completed: t.completed,
        priority: priorityForId(t.id),
        due: dueDateForId(t.id),
      });
    });

    buildDots();
    renderProfile(0);
    startAutoSlide();
  } catch (err) {
    tasksBody.innerHTML = `<tr><td colspan="5" class="tasks-loading">Couldn't load data — check your connection and reload.</td></tr>`;
    console.error("Failed to load Aurelia data:", err);
  }
}

/* ---------------- Carousel: dots ---------------- */
function buildDots() {
  dotsContainer.innerHTML = "";
  users.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.className = "dot" + (i === 0 ? " active" : "");
    dot.addEventListener("click", () => goToIndex(i, true));
    dotsContainer.appendChild(dot);
  });
}

function updateDots() {
  [...dotsContainer.children].forEach((dot, i) => {
    dot.classList.toggle("active", i === currentIndex);
  });
}

/* ---------------- Render current profile + tasks ---------------- */
function initials(name) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function renderProfile(index) {
  const user = users[index];
  if (!user) return;

  avatarEl.textContent = initials(user.name);
  nameEl.textContent = user.name;
  roleEl.textContent =
    user.company && user.company.bs
      ? user.company.bs.split(" ").slice(0, 2).join(" ").toUpperCase()
      : "TEAM MEMBER";
  tagCompanyEl.textContent = user.company ? user.company.name : "—";
  tagCityEl.textContent = user.address ? user.address.city : "—";

  setField("username", user.username);
  setField("email", user.email);
  setField("phone", user.phone);
  setField("website", user.website);
  setField(
    "street",
    user.address ? `${user.address.street}, ${user.address.suite}` : "",
  );
  setField("city", user.address ? user.address.city : "");
  setField("zip", user.address ? user.address.zipcode : "");
  setField("company", user.company ? user.company.name : "");

  el("catchphrase").textContent = user.company
    ? `"${user.company.catchPhrase}"`
    : "";

  tasksTitle.textContent = `${user.name.split(" ")[0]}'s Tasks`;

  pageCounter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(users.length).padStart(2, "0")}`;
  updateDots();
  renderTasks(user.id);
}

function setField(fieldName, value) {
  const target = document.querySelector(`[data-field="${fieldName}"]`);
  if (target) target.textContent = value || "";
}

function renderTasks(userId) {
  const tasks = todosByUser[userId] || [];

  const completed = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  statCompleted.textContent = completed;
  statOpen.textContent = total - completed;
  statTotal.textContent = total;

  if (total === 0) {
    tasksBody.innerHTML = `<tr><td colspan="5" class="tasks-loading">No tasks yet — add the first one above.</td></tr>`;
    return;
  }

  tasksBody.innerHTML = tasks
    .map(
      (t) => `
    <tr data-task-id="${t.id}">
      <td>
        <span class="task-checkbox ${t.completed ? "checked" : ""}" data-action="toggle" data-id="${t.id}">
          ${t.completed ? "&#10003;" : ""}
        </span>
      </td>
      <td><span class="task-title ${t.completed ? "done" : ""}">${escapeHtml(t.title)}</span></td>
      <td><span class="priority-pill priority-${t.priority}">${t.priority}</span></td>
      <td><span class="task-due">${t.due}</span></td>
      <td><button class="task-remove" data-action="remove" data-id="${t.id}" aria-label="Remove task">&times;</button></td>
    </tr>
  `,
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------- Task interactions (event delegation) ---------------- */
tasksBody.addEventListener("click", (e) => {
  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;

  const id = Number(actionEl.dataset.id);
  const user = users[currentIndex];
  const tasks = todosByUser[user.id] || [];
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  if (actionEl.dataset.action === "toggle") {
    task.completed = !task.completed;
    renderTasks(user.id);
  }

  if (actionEl.dataset.action === "remove") {
    todosByUser[user.id] = tasks.filter((t) => t.id !== id);
    renderTasks(user.id);
  }
});

addTaskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = newTaskInput.value.trim();
  if (!title) return;

  const user = users[currentIndex];
  if (!todosByUser[user.id]) todosByUser[user.id] = [];

  todosByUser[user.id].unshift({
    id: nextLocalTaskId++,
    title,
    completed: false,
    priority: "medium",
    due: defaultDueForNewTask(),
  });

  newTaskInput.value = "";
  renderTasks(user.id);

  // Best-effort sync — jsonplaceholder is a mock API and won't persist this,
  // but this is where a real backend call would go.
  fetch(TODOS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, completed: false, userId: user.id }),
  }).catch(() => {});
});

/* ---------------- Carousel navigation ---------------- */
function goToIndex(index, userInitiated) {
  if (index === currentIndex) return;
  currentIndex = (index + users.length) % users.length;

  profileCard.classList.add("is-switching");
  setTimeout(() => {
    renderProfile(currentIndex);
    profileCard.classList.remove("is-switching");
  }, 180);

  if (userInitiated) restartAutoSlide();
}

prevBtn.addEventListener("click", () => goToIndex(currentIndex - 1, true));
nextBtn.addEventListener("click", () => goToIndex(currentIndex + 1, true));

function startAutoSlide() {
  stopAutoSlide();
  autoSlideTimer = setInterval(() => {
    goToIndex(currentIndex + 1, false);
  }, AUTO_SLIDE_MS);
}
function stopAutoSlide() {
  if (autoSlideTimer) clearInterval(autoSlideTimer);
}
function restartAutoSlide() {
  startAutoSlide();
}

// Pause auto-slide while the user is interacting with the card
profileCard.addEventListener("mouseenter", stopAutoSlide);
profileCard.addEventListener("mouseleave", () => {
  if (!isEditing) startAutoSlide();
});

/* ---------------- Edit profile ---------------- */
editBtn.addEventListener("click", () => {
  isEditing = !isEditing;
  const editableFields = document.querySelectorAll('[data-editable="true"]');

  if (isEditing) {
    stopAutoSlide();
    editBtn.textContent = "Save Profile";
    editBtn.classList.add("is-editing");
    editableFields.forEach((f) => f.setAttribute("contenteditable", "true"));
    editableFields[0] && editableFields[0].focus();
  } else {
    editBtn.textContent = "Edit Profile";
    editBtn.classList.remove("is-editing");
    editableFields.forEach((f) => f.setAttribute("contenteditable", "false"));
    saveEditsToUser();
    startAutoSlide();
  }
});

function saveEditsToUser() {
  const user = users[currentIndex];
  if (!user) return;

  user.username = getFieldText("username");
  user.email = getFieldText("email");
  user.phone = getFieldText("phone");
  user.website = getFieldText("website");

  if (!user.address) user.address = {};
  const streetRaw = getFieldText("street");
  const [street, suite] = streetRaw.split(",").map((s) => s && s.trim());
  user.address.street = street || streetRaw;
  user.address.suite = suite || user.address.suite || "";
  user.address.city = getFieldText("city");
  user.address.zipcode = getFieldText("zip");

  if (!user.company) user.company = {};
  user.company.name = getFieldText("company");

  const catchphraseText = el("catchphrase").textContent.replace(/^"|"$/g, "");
  user.company.catchPhrase = catchphraseText;

  // Reflect edits immediately in tags/labels without a full re-fetch
  tagCompanyEl.textContent = user.company.name;
  tagCityEl.textContent = user.address.city;

  // Best-effort sync (mock API — won't persist, but shows the intended call)
  fetch(`${USERS_URL}/${user.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  }).catch(() => {});
}

function getFieldText(fieldName) {
  const target = document.querySelector(`[data-field="${fieldName}"]`);
  return target ? target.textContent.trim() : "";
}

/* ---------------- Go ---------------- */
loadData();
