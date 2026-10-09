QuickNotes

A note-taking service. This repository is the capstone deliverable for
the QuickNotes project — it contains a working API client that talks to
a practice API (JSONPlaceholder) and the design documents the backend
team will build from.

What's in this repo

```
quicknotes-system-design/
├── index.html                  # API client — page structure
├── api.js                      # API client — fetch logic
├── style.css                   # API client — styling
├── README.md                   # this file
└── docs/
    ├── api-design.md           # REST API the backend should build
    ├── data-model.md           # SQL schema, relationships, indexes
    └── architecture.md         # Production architecture at 1M users
```

How to run the API client

The client is a static web page that talks to a public practice API
(`https://jsonplaceholder.typicode.com`). No backend, no build step.

1. Open `index.html` directly in a modern browser, **or** serve the
   folder with any static server. For example, with VS Code:
   - Right-click `index.html` → **Open with Live Server**, or
   - Double-click the file to open it in your default browser.
2. Click **Load notes** to fetch the first 10 notes.
3. Type a title (required, max 100 characters) and an optional body,
   then click **Create note**.
4. Click **Delete** on any note to remove it from the list.

 Notes on JSONPlaceholder behaviour

JSONPlaceholder accepts `POST` and `DELETE` requests but does **not**
actually persist them — `POST` returns a fake object with `id: 101`
every time, and `DELETE` returns an empty `200`. To keep the UI
consistent during a session, `api.js` maintains an in-memory `notes`
array as the source of truth for the list, and this is documented in the
file itself. A real backend would simply return the created/deleted
record and the client would render it directly.

Design documents

- [`docs/api-design.md`](docs/api-design.md) — the REST endpoints,
  request/response examples and error codes the backend should implement.
- [`docs/data-model.md`](docs/data-model.md) — the users, notes, tags and
  note_tags tables, their relationships, the SQL to create them, indexes
  and the reasoning behind choosing PostgreSQL over a document store.
- [`docs/architecture.md`](docs/architecture.md) — requirements, the load
  estimate for 1 million users, the architecture diagram, one sentence per
  component, the `GET /notes` and `POST /notes` request flows, the
  trade-offs we accepted, and how the design removes single points of
  failure.

 What I learned

- **Designing before building saves time.** Writing the API design, data
  model and architecture first forced me to think about validation,
  pagination, error shapes and cache invalidation before writing a single
  line of backend code — decisions that would be expensive to change
  later.

- **Read-heavy systems need caches and replicas, not bigger servers.**
  The load estimate shows QuickNotes does ~4× more reads than writes.
  Caching the note list in Redis and serving reads from replicas is far
  cheaper and faster than trying to scale one big machine.

- **Trade-offs are unavoidable — the job is to name them.** Every design
  decision trades something away: caching trades freshness for speed,
  read replicas trade consistency for availability, a monolith trades
  independent scaling for simplicity. Writing these down explicitly makes
  the design defensible instead of accidental.

- **Removing single points of failure is a design activity, not an
  afterthought.** You can't just "add a backup" at the end. Every
  component — load balancer, app servers, cache, primary DB, queue —
  needs a plan for what happens when it dies. That plan has to be part of
  the original design.

- **`fetch` + `async/await` is enough for a real API client.** You don't
  need a framework to do proper loading states, error handling, input
  validation, disabled buttons during requests and safe DOM insertion
  (`textContent` only). Handling all four UI states — loading, success,
  error, empty — matters more than any library.