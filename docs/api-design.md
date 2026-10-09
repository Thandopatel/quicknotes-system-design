QuickNotes — API Design

This document describes the REST API the QuickNotes backend team should
build. It is **not** the JSONPlaceholder practice API — it is the real
design for the QuickNotes service.

Base URL

```
https://api.quicknotes.example.com/v1
```

All requests and responses use JSON (`Content-Type: application/json`).
All endpoints except `POST /auth/register` and `POST /auth/login` require
an `Authorization: Bearer <token>` header.

Endpoints

| Method | Path | Description | Success status |
|--------|------|-------------|----------------|
| POST | `/auth/register` | Create a new user account | 201 Created |
| POST | `/auth/login` | Exchange credentials for a JWT access token | 200 OK |
| GET | `/notes` | List the current user's notes (paginated) | 200 OK |
| POST | `/notes` | Create a new note | 201 Created |
| GET | `/notes/{id}` | Fetch a single note by id | 200 OK |
| PUT | `/notes/{id}` | Replace an existing note | 200 OK |
| DELETE | `/notes/{id}` | Delete a note | 204 No Content |
| GET | `/notes/{id}/tags` | List tags attached to a note | 200 OK |
| POST | `/notes/{id}/tags` | Attach a tag to a note | 201 Created |
| GET | `/tags` | List tags created by the current user | 200 OK |

Request and response examples

Create a note

`POST /notes`

Request body:

```json
{
  "title": "Groceries",
  "body": "Milk, eggs, bread",
  "tags": ["home", "errands"]
}
```

Response — `201 Created`:

```json
{
  "id": 42,
  "title": "Groceries",
  "body": "Milk, eggs, bread",
  "tags": ["home", "errands"],
  "createdAt": "2026-10-09T14:32:11Z",
  "updatedAt": "2026-10-09T14:32:11Z"
}
```
 List notes

`GET /notes?limit=10&offset=0`

Response — `200 OK`:

```json
{
  "items": [
    {
      "id": 42,
      "title": "Groceries",
      "body": "Milk, eggs, bread",
      "tags": ["home", "errands"],
      "createdAt": "2026-10-09T14:32:11Z",
      "updatedAt": "2026-10-09T14:32:11Z"
    },
    {
      "id": 41,
      "title": "Meeting notes",
      "body": "Discussed the QuickNotes roadmap.",
      "tags": ["work"],
      "createdAt": "2026-10-08T09:15:00Z",
      "updatedAt": "2026-10-08T09:15:00Z"
    }
  ],
  "total": 128,
  "limit": 10,
  "offset": 0
}
```

## Error responses

All errors return JSON with the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title is required.",
    "details": { "field": "title" }
  }
}
```

| Status | Meaning | When it happens |
|--------|---------|-----------------|
| **400 Bad Request** | Malformed input | Missing required field, invalid JSON, title over 100 characters |
| **401 Unauthorized** | Missing or invalid token | No `Authorization` header, expired JWT, wrong credentials |
| **403 Forbidden** | Authenticated but not allowed | Trying to access or modify another user's note |
| **404 Not Found** | Resource does not exist | Note id not in the database |
| **500 Internal Server Error** | Unexpected server failure | Database down, unhandled exception |

Example error bodies:

```json
// 400 Bad Request
{ "error": { "code": "VALIDATION_ERROR", "message": "Title is required.", "details": { "field": "title" } } }

// 401 Unauthorized
{ "error": { "code": "UNAUTHORIZED", "message": "Missing or expired access token." } }

// 403 Forbidden
{ "error": { "code": "FORBIDDEN", "message": "You do not own this note." } }

// 404 Not Found
{ "error": { "code": "NOT_FOUND", "message": "Note 42 does not exist." } }

// 500 Internal Server Error
{ "error": { "code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again." } }
```

## Versioning and pagination

- The API is versioned in the URL (`/v1`). Breaking changes go to `/v2`.
- List endpoints accept `limit` (max 100, default 20) and `offset` (default 0).
- Responses include `total` so clients can build pagination UI.