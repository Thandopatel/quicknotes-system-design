 QuickNotes — Architecture

This document describes the production architecture for QuickNotes at
1 million registered users. It covers the requirements, the load estimate,
the diagram, one sentence per component, the two main request flows
(`GET /notes` and `POST /notes`), and the trade-offs and single points
of failure we have designed around.

 Functional requirements

- Users can register, log in and receive a token.
- Authenticated users can create, read, update and delete their own notes.
- Users can attach tags to notes and filter by tag.
- Notes are private to their owner.
- All API responses are JSON; all write endpoints validate input.

 Non-functional requirements

- **Latency.** p95 of `GET /notes` under 200 ms; p95 of `POST /notes`
  under 300 ms.
- **Availability.** 99.9% ("three nines") → at most ~8.8 hours of
  downtime per year.
- **Durability.** Once a write returns `201`, the note must survive a
  single-node failure.
- **Scalability.** Must handle growth from 1 M to 10 M users without a
  redesign.
- **Security.** TLS everywhere, hashed passwords, JWT-based auth,
  authorization checks on every note.

Load estimate (1 million users)

Following the same method used in the Day 7 scaling exercise:

**Assumptions**

- 1,000,000 registered users.
- 20% are active on a given day → **200,000 daily active users (DAU)**.
- Each DAU creates **5 notes per day**.
- Each DAU loads their notes list **20 times per day**.
- An average note, including tags and metadata, is about **500 bytes**.

**Seconds per day** ≈ 86,400 (round to 100,000 for easy maths).

**Writes per second**

```
200,000 users × 5 notes = 1,000,000 notes per day
1,000,000 ÷ 100,000 ≈ 10 writes/s average
At peak (~5×) → ≈ 50 writes/s
```

**Reads per second**

```
200,000 users × 20 loads = 4,000,000 loads per day
4,000,000 ÷ 100,000 ≈ 40 reads/s average
At peak (~5×) → ≈ 200 reads/s
```

**Storage per year**

```
1,000,000 notes/day × 500 bytes = 500 MB/day
500 MB × 365 ≈ 180 GB/year
```

QuickNotes is **read-heavy** (4× more reads than writes). This drives
the design: caches and read replicas handle the read path; the primary
database is left free for writes.

## Architecture diagram

```
                              ┌─────────┐
                   ┌─────────>│   DNS   │ (api.quicknotes.example.com)
                   │          └─────────┘
                   │
          ┌────────┴────────┐   static assets   ┌──────────────────────┐
          │  Browser /      │ ────────────────> │  CDN                 │
          │  mobile client  │                   │  (HTML, CSS, JS)     │
          └────────┬────────┘                   └──────────┬───────────┘
                   │ API calls (HTTPS, JSON)               │
                   v                                       │
          ┌─────────────────┐                              │
          │  Load balancer  │                              │
          └────────┬────────┘                              │
                   │                                       │
        ┌──────────┼──────────┐                            │
        v          v          v                            │
   ┌─────────┐┌─────────┐┌─────────┐                       │
   │ App 1   ││ App 2   ││ App 3   │                       │
   └────┬────┘└────┬────┘└────┬────┘                       │
        │          │          │                            │
        │ writes   │ reads    │ jobs                       │
        v          v          v                            │
   ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐       │
   │ Primary │>│  Read    │ │  Queue  │─>│  Worker  │       │
   │   DB    │ │ replicas │ │(RabbitMQ│ │(exports, │       │
   │         │ │          │ │ / SQS)  │ │ emails)  │       │
   └─────────┘ └──────────┘ └─────────┘ └──────────┘       │
        ^                                                  │
        │                                                  │
   ┌────┴────┐                                             │
   │  Cache  │ <───────────────────────────────────────────┘
   │ (Redis) │   cached note lists keyed by user
   └─────────┘
```

Components (one sentence each)

| Component | Problem it solves |
|-----------|-------------------|
| **Client (browser / mobile)** | Renders the UI and sends API requests over HTTPS. |
| **DNS** | Resolves `api.quicknotes.example.com` to the load balancer's address. |
| **CDN** | Serves static front-end assets (HTML, CSS, JS) from edge locations close to the user, cutting latency and offloading traffic from our origin. |
| **Load balancer** | Spreads incoming API traffic across multiple app servers and stops routing to any server that fails its health check. |
| **App servers (1–3)** | Run the QuickNotes API: authenticate users, validate input, talk to the cache, database and queue. Stateless, so any server can handle any request. |
| **Cache (Redis)** | Stores frequently requested data (e.g. a user's recent notes list) in memory so repeated reads skip the database. |
| **Primary database** | The authoritative store for users, notes, tags and note_tags; handles all writes. |
| **Read replicas** | Copies of the primary that serve read queries, letting the primary focus on writes and providing failover if the primary dies. |
| **Queue** | Buffers slow background jobs (e.g. building exports, sending welcome emails) so the API can respond to the user immediately. |
| **Worker** | Consumes jobs from the queue and performs them in the background without blocking user requests. |

Request flow — `GET /notes`

1. The client sends `GET /notes` with a bearer token.
2. The load balancer forwards the request to any healthy app server.
3. The app server verifies the JWT and derives the user's id.
4. The app server looks up `notes:user:<id>` in Redis.
   - **Cache hit** → return the cached JSON immediately (~1 ms).
   - **Cache miss** → query a read replica for the user's notes
     (newest first, paginated), store the result in Redis with a short
     TTL (e.g. 30 seconds), then return it.
5. The response is JSON: `{ items: [...], total, limit, offset }`.

Request flow — `POST /notes`

1. The client sends `POST /notes` with a JSON body and a bearer token.
2. The load balancer forwards the request to any healthy app server.
3. The app server verifies the JWT, validates the body (title required,
   max 100 characters) and rejects invalid input with `400`.
4. The app server writes the note to the **primary** database, because
   only the primary accepts writes.
5. The app server deletes `notes:user:<id>` from Redis so the next read
   fetches fresh data (cache invalidation).
6. The app server responds `201 Created` with the new note's JSON.
7. Within a few milliseconds the primary copies the new row to each read
   replica (replication). Subsequent reads served from a replica will
   see the new note.
 Trade-offs

**1. Speed vs. freshness (caching).**

Caching note lists in Redis makes reads about 20× faster and takes load
off the database, but a just-created note may not appear in a cached
list until the cache entry is invalidated or expires. For QuickNotes
this is acceptable: we invalidate the user's own cache immediately after
a write, and a 30-second TTL bounds staleness for anything we miss.

**2. Consistency vs. availability (read replicas).**

Read replicas let us scale reads horizontally and survive a primary
outage (a replica can be promoted). The cost is replication lag: a read
served from a replica may briefly miss the very latest write (eventual
consistency). For a personal note-taking app this is fine; we route the
user's own reads to the primary for a short window after they write, so
they always see their own changes immediately.

 Single points of failure — and how we avoid them

A single point of failure (SPOF) is any component whose failure takes
the whole system down. The design removes or mitigates every SPOF:

- **App servers** — no SPOF: there are at least three behind a load
  balancer, and they are stateless, so losing one only reroutes traffic.
- **Load balancer** — run as a managed service (e.g. AWS ALB) which is
  itself replicated; or two LBs behind DNS round-robin.
- **Cache (Redis)** — no SPOF: if Redis is down, the app falls back to
  the database. Redis is also typically run with a replica for failover.
- **Primary database** — mitigated by streaming replication: if the
  primary fails, a replica is promoted (failover). Data is durable
  because writes are committed to WAL before acknowledging.
- **Read replicas** — losing one reduces read capacity but the system
  still works; new replicas can be added at any time.
- **Queue and worker** — no SPOF: if the queue is unavailable, the API
  returns success for the user-facing request and enqueues the job when
  the queue recovers, or drops non-critical jobs.
- **DNS and CDN**— provided by managed services (Route 53, Cloudflare)
  with global anycast; no single machine failure affects them.

The result: no single machine failure can take QuickNotes offline.