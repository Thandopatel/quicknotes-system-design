/* ============================================================
   QuickNotes API client
   Practice backend: JSONPlaceholder (https://jsonplaceholder.typicode.com)

   JSONPlaceholder accepts POST and DELETE requests but does not
   actually persist anything — POST returns a fake "created" object
   with id 101, and DELETE returns an empty 200. We therefore keep a
   local `notes` array in memory so the UI stays consistent during
   the session, and we document this behaviour in the code.
   ============================================================ */

const API_URL = "https://jsonplaceholder.typicode.com/posts";

/* ---------- DOM references ---------- */

const loadBtn     = document.getElementById("load-btn");
const statusEl    = document.getElementById("status");
const notesList   = document.getElementById("notes-list");
const noteForm    = document.getElementById("note-form");
const titleInput  = document.getElementById("title-input");
const bodyInput   = document.getElementById("body-input");
const submitBtn   = document.getElementById("submit-btn");
const titleError  = document.getElementById("title-error");

/* ---------- In-memory state ---------- */

let notes = [];

/* ---------- Status helper ---------- */

function setStatus(kind, message) {
  statusEl.className = kind || "";
  statusEl.textContent = message || "";
}

/* ---------- Reusable fetch wrapper ---------- */

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/* ---------- API calls ---------- */

async function fetchNotes() {
  return request(`${API_URL}?_limit=10`);
}

async function createNote(note) {
  return request(API_URL, {
    method: "POST",
    body: JSON.stringify({ ...note, userId: 1 }),
  });
}

async function deleteNote(id) {
  return request(`${API_URL}/${id}`, { method: "DELETE" });
}

/* ---------- Rendering ---------- */

function renderNotes() {
  notesList.innerHTML = "";

  if (notes.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = "No notes yet. Load some or create one above.";
    notesList.appendChild(li);
    return;
  }

  for (const note of notes) {
    const li = document.createElement("li");

    const title = document.createElement("p");
    title.className = "note-title";
    title.textContent = note.title;
    li.appendChild(title);

    if (note.body) {
      const body = document.createElement("p");
      body.className = "note-body";
      body.textContent = note.body;
      li.appendChild(body);
    }

    const meta = document.createElement("div");
    meta.className = "note-meta";

    const idLabel = document.createElement("span");
    idLabel.textContent = `id: ${note.id}`;
    meta.appendChild(idLabel);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "delete-btn";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => handleDelete(note.id, delBtn));
    meta.appendChild(delBtn);

    li.appendChild(meta);
    notesList.appendChild(li);
  }
}

/* ---------- Handlers ---------- */

async function handleLoad() {
  loadBtn.disabled = true;
  setStatus("loading", "Loading notes...");

  try {
    const data = await fetchNotes();
    notes = Array.isArray(data) ? data.map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
    })) : [];
    renderNotes();
    setStatus("success", `Loaded ${notes.length} notes from the server.`);
  } catch (err) {
    console.error(err);
    setStatus("error", "Sorry, we could not load notes. Please try again.");
  } finally {
    loadBtn.disabled = false;
  }
}

function validateTitle(value) {
  const trimmed = value.trim();
  if (!trimmed) return "Title is required.";
  if (trimmed.length > 100) return "Title must be 100 characters or fewer.";
  return "";
}

async function handleSubmit(event) {
  event.preventDefault();
  titleError.hidden = true;

  const title = titleInput.value.trim();
  const body  = bodyInput.value.trim();

  const problem = validateTitle(title);
  if (problem) {
    titleError.textContent = problem;
    titleError.hidden = false;
    titleInput.focus();
    return;
  }

  submitBtn.disabled = true;
  setStatus("loading", "Creating note...");

  try {
    const created = await createNote({ title, body });
    const localId = Date.now();
    notes.unshift({
      id: created?.id ?? localId,
      title,
      body,
      isLocal: true,
    });
    renderNotes();
    setStatus("success", `Note created (status 201, id ${created?.id ?? localId}).`);
    noteForm.reset();
    titleInput.focus();
  } catch (err) {
    console.error(err);
    setStatus("error", "Could not create the note. Please try again.");
  } finally {
    submitBtn.disabled = false;
  }
}

async function handleDelete(id, button) {
  button.disabled = true;
  setStatus("loading", `Deleting note ${id}...`);

  try {
    await deleteNote(id);
    notes = notes.filter(n => n.id !== id);
    renderNotes();
    setStatus("success", `Note ${id} deleted (status 200).`);
  } catch (err) {
    console.error(err);
    setStatus("error", `Could not delete note ${id}. Please try again.`);
    button.disabled = false;
  }
}

/* ---------- Wire up ---------- */

loadBtn.addEventListener("click", handleLoad);
noteForm.addEventListener("submit", handleSubmit);

renderNotes();