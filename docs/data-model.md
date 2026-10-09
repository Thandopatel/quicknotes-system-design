QuickNotes — Data Model

This document describes the relational data model the QuickNotes backend
should implement. It covers the four core entities, their columns and
types, the relationships between them, the SQL to create the schema,
example queries and the reasoning behind choosing a relational database
over a document store.

Entities and columns

'users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `BIGSERIAL` | Primary key |
| `username` | `VARCHAR(50)` | Unique, not null |
| `email` | `VARCHAR(255)` | Unique, not null |
| `password_hash` | `VARCHAR(255)` | Not null (bcrypt/argon2 hash) |
| `created_at` | `TIMESTAMPTZ` | Defaults to `NOW()` |

`notes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `BIGSERIAL` | Primary key |
| `user_id` | `BIGINT` | Foreign key → `users.id`, not null |
| `title` | `VARCHAR(100)` | Not null (matches the client-side limit) |
| `body` | `TEXT` | Optional |
| `created_at` | `TIMESTAMPTZ` | Defaults to `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | Defaults to `NOW()`, updated on change |

`tags`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `BIGSERIAL` | Primary key |
| `user_id` | `BIGINT` | Foreign key → `users.id`, not null (tags are per-user) |
| `name` | `VARCHAR(50)` | Not null |
| `created_at` | `TIMESTAMPTZ` | Defaults to `NOW()` |

A tag name is unique per user: `UNIQUE (user_id, name)`.

`note_tags`

| Column | Type | Notes |
|--------|------|-------|
| `note_id` | `BIGINT` | Foreign key → `notes.id`, ON DELETE CASCADE |
| `tag_id` | `BIGINT` | Foreign key → `tags.id`, ON DELETE CASCADE |
| — | — | Composite primary key `(note_id, tag_id)` |

Relationships

- **One-to-many: `users` → `notes`.** A user owns many notes; each note
  belongs to exactly one user. Enforced by `notes.user_id`.
- **One-to-many: `users` → `tags`.** A user owns many tags; a tag belongs
  to one user.
- **Many-to-many: `notes` ↔ `tags`.** A note can have many tags, and a
  tag can belong to many notes. Resolved by the join table `note_tags`.

SQL — CREATE TABLE statements

```sql
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE notes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(100) NOT NULL,
  body       TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE tags (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
  note_id BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  BIGINT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);
```

Indexes

```sql
-- Fast lookup of all notes belonging to a user, ordered by recency.
CREATE INDEX idx_notes_user_created
  ON notes (user_id, created_at DESC);
```

**Reason:** the most common query in QuickNotes is "list the current
user's notes, newest first". A composite index on `(user_id, created_at
DESC)` lets Postgres seek directly to the right user's rows and return
them already sorted, avoiding a full table scan and a sort step.

```sql
-- Fast lookup of tags for a note.
CREATE INDEX idx_note_tags_tag
  ON note_tags (tag_id);
```

**Reason:** the join table's primary key already indexes `(note_id,
tag_id)`, which is fast for "tags of a note". The reverse direction —
"notes with a given tag" — needs its own index on `tag_id`.

 Example queries

**1. List the current user's notes, newest first (with a limit):**

```sql
SELECT id, title, body, created_at, updated_at
FROM notes
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 20;
```

**2. Fetch a note with all its tags (JOIN):**

```sql
SELECT n.id, n.title, n.body, n.created_at,
       COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.id IS NOT NULL), '{}') AS tags
FROM notes n
LEFT JOIN note_tags nt ON nt.note_id = n.id
LEFT JOIN tags      t  ON t.id = nt.tag_id
WHERE n.id = $1 AND n.user_id = $2
GROUP BY n.id;
```

**3. Count how many notes the user has per tag:**

```sql
SELECT t.name, COUNT(nt.note_id) AS note_count
FROM tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.id
WHERE t.user_id = $1
GROUP BY t.id, t.name
ORDER BY note_count DESC;
```

SQL vs NoSQL — decision

QuickNotes is **relational** by nature: users own notes, notes have many
tags, and tags can belong to many notes. These are explicit many-to-many
relationships that are awkward to maintain in a document store, where
you would either duplicate tag names across notes (creating inconsistency)
or keep a separate collection and do application-level joins. A relational
database with foreign keys, `ON DELETE CASCADE` and a join table gives us
referential integrity for free.

The workload is also **read-heavy with a small write volume per user**
(millions of reads per day, a handful of writes per user per day — see
`architecture.md`). PostgreSQL handles this comfortably on a single
primary with one or more read replicas. Complex queries — listing notes
with their tags, counting notes per tag, full-text search on titles and
bodies — are natural SQL operations.

A document store like MongoDB would be a reasonable choice if the schema
were truly schemaless or if the data were naturally nested per-document.
QuickNotes is neither. PostgreSQL is the right default, and it can be
extended later (JSONB columns, full-text search, partitioning) without
changing the fundamental design.