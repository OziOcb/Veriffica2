# REST API Plan

## 1. Resources

| Resource | Backing store | Purpose |
| --- | --- | --- |
| `Auth Session` | Supabase Auth + server session cookies | Sign up, sign in, sign out, session refresh, current authenticated user context |
| `Profile` | `public.profiles` | Read-only account identity metadata bound 1:1 to `auth.users` |
| `User Preferences` | `public.user_preferences` | Persist theme, font scale, and `hide_inspection_intro` across devices |
| `Inspection` | `public.inspections` | Main business resource for draft/completed inspections |
| `Inspection Snapshot` | `public.inspections.snapshot` JSONB + projection columns | Canonical offline-first inspection state, versioned and conflict-aware |
| `Inspection Summary` | Derived from `public.inspections.snapshot` + question bank artifacts | Session progress, total distribution, per-part distribution, editability state |
| `Resolved Questions` | Repo-based question bank artifacts resolved against an inspection | Canonical visible groups/questions/explanations for Parts 2-5 |

### Resource model notes

- `Profile` and `User Preferences` are separate resources because they have different write rules: `profiles` is read-only for standard users, while preferences are mutable through a narrow trusted server contract.
- `Inspection` is the aggregate root. `part_1`, `runtime_flags`, `answers`, `question_notes`, `global_notes`, `visible_group_ids`, and `visible_question_ids` are treated as subresources but are persisted through the same canonical snapshot save service.
- The question bank and inspection intro remain source-controlled artifacts in the repo, not database tables. The API only exposes resolved, runtime-safe views when the client needs canonical server output.

## 2. Endpoints

### 2.1 Conventions

- Base path: `/api/v1`
- Content type: `application/json; charset=utf-8`
- Authenticated endpoints require a valid Supabase session cookie.
- Timestamps use ISO 8601 UTC strings.
- UUIDs are represented as strings.
- Mutation responses return the latest canonical aggregate state, not only an acknowledgment. This supports offline reconciliation.

### 2.2 Common response envelopes

#### Success envelope

```json
{
  "data": {},
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z"
  }
}
```

#### List envelope

```json
{
  "data": [],
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z",
    "pagination": {
      "limit": 20,
      "nextCursor": null,
      "hasMore": false
    }
  }
}
```

#### Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "details": [
      {
        "field": "part1.transmission",
        "message": "Electric cars must use Automatic transmission."
      }
    ]
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z"
  }
}
```

### 2.4 Current User and Account

#### `GET /api/v1/me`

- Description: Return the authenticated user profile plus core account information needed by the app shell.
- Auth: Required
- Query parameters: None
- Response JSON:

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "createdAt": "2026-05-01T12:00:00Z"
    },
    "profile": {
      "userId": "uuid",
      "createdAt": "2026-05-01T12:00:00Z",
      "updatedAt": "2026-05-01T12:00:00Z"
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `401 Unauthorized`

#### `DELETE /api/v1/me`

- Description: Hard-delete the authenticated account and cascade-delete all related data.
- Auth: Required
- Query parameters: None
- Request JSON:

```json
{
  "confirmation": "DELETE_MY_ACCOUNT"
}
```

- Response JSON:

```json
{
  "data": {
    "deleted": true,
    "signedOut": true
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `400 Bad Request` if confirmation is missing or incorrect
  - `401 Unauthorized`
  - `409 Conflict` if the delete flow cannot complete safely
  - `429 Too Many Requests`

### 2.5 User Preferences

#### `GET /api/v1/me/preferences`

- Description: Return the authenticated user preferences.
- Auth: Required
- Query parameters: None
- Response JSON:

```json
{
  "data": {
    "userId": "uuid",
    "theme": "system",
    "fontScale": "medium",
    "hideInspectionIntro": false,
    "createdAt": "2026-05-01T12:00:00Z",
    "updatedAt": "2026-05-01T12:00:00Z"
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `401 Unauthorized`

#### `PATCH /api/v1/me/preferences`

- Description: Update mutable preferences through a narrow server-side contract.
- Auth: Required
- Query parameters: None
- Request JSON:

```json
{
  "theme": "dark",
  "fontScale": "large",
  "hideInspectionIntro": true
}
```

- Response JSON:

```json
{
  "data": {
    "userId": "uuid",
    "theme": "dark",
    "fontScale": "large",
    "hideInspectionIntro": true,
    "updatedAt": "2026-05-01T12:05:00Z"
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:05:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `400 Bad Request` for invalid enum values
  - `401 Unauthorized`

### 2.6 Inspections Collection

#### `GET /api/v1/inspections`

- Description: List the authenticated user's inspections for the dashboard.
- Auth: Required
- Query parameters:
  - `status`: `draft` | `completed` | omitted for all
  - `sort`: `updated_at.desc` | `created_at.desc` | `title.asc` (default `updated_at.desc`)
  - `limit`: integer, default `20`, max `50`
  - `cursor`: opaque pagination cursor
- Response JSON:

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Toyota Corolla 2016 ABC123",
      "status": "draft",
      "snapshotVersion": 4,
      "updatedAt": "2026-05-01T12:00:00Z",
      "completedAt": null,
      "progress": {
        "answeredQuestions": 12,
        "visibleQuestions": 60,
        "completionRate": 20
      },
      "scoreDistribution": {
        "yes": 5,
        "no": 4,
        "dontKnow": 3
      },
      "part1Complete": true,
      "mode": "editable"
    }
  ],
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z",
    "pagination": {
      "limit": 20,
      "nextCursor": null,
      "hasMore": false
    }
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `401 Unauthorized`

#### `POST /api/v1/inspections`

- Description: Create a new draft inspection with the minimal canonical snapshot.
- Auth: Required
- Query parameters: None
- Request JSON:

```json
{
  "clientCreatedAt": "2026-05-01T12:00:00Z"
}
```

- Response JSON:

```json
{
  "data": {
    "inspection": {
      "id": "uuid",
      "title": "Untitled inspection",
      "status": "draft",
      "questionBankVersion": "2026-05-01",
      "snapshotSchemaVersion": "1.0.0",
      "snapshotVersion": 1,
      "clientUpdatedAt": "2026-05-01T12:00:00Z",
      "createdAt": "2026-05-01T12:00:00Z",
      "updatedAt": "2026-05-01T12:00:00Z",
      "part1": null,
      "runtimeFlags": {
        "chargingPortEquipped": false,
        "evBatteryDocsAvailable": false,
        "turboEquipped": false,
        "mechanicalCompressorEquipped": false,
        "importedFromEU": false
      },
      "answers": {},
      "questionNotes": {},
      "globalNotes": "",
      "visibleGroupIds": [],
      "visibleQuestionIds": [],
      "progress": {
        "answeredQuestions": 0,
        "visibleQuestions": 0,
        "completionRate": 0
      },
      "scoreDistribution": {
        "yes": 0,
        "no": 0,
        "dontKnow": 0
      },
      "mode": "editable"
    },
    "limits": {
      "maxInspections": 2,
      "currentInspections": 1,
      "remaining": 1
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:00:00Z"
  }
}
```

- Success codes:
  - `201 Created`
- Error codes:
  - `401 Unauthorized`
  - `409 Conflict` with code `INSPECTION_LIMIT_REACHED`
  - `422 Unprocessable Entity` if `clientCreatedAt` is malformed

### 2.7 Inspection Detail

#### `GET /api/v1/inspections/{inspectionId}`

- Description: Return the full canonical inspection aggregate needed by the session page.
- Auth: Required
- Query parameters:
  - `include`: comma-separated optional expansions; supported values: `summary`, `questions-meta`
- Response JSON:

```json
{
  "data": {
    "id": "uuid",
    "title": "Toyota Corolla 2016 ABC123",
    "status": "draft",
    "questionBankVersion": "2026-05-01",
    "snapshotSchemaVersion": "1.0.0",
    "snapshotVersion": 7,
    "clientUpdatedAt": "2026-05-01T12:30:00Z",
    "createdAt": "2026-05-01T12:00:00Z",
    "updatedAt": "2026-05-01T12:30:02Z",
    "completedAt": null,
    "part1": {
      "price": 23000,
      "make": "Toyota",
      "model": "Corolla",
      "yearOfProduction": 2016,
      "registrationNumber": "ABC 123",
      "vinNumber": "JH4DA9350LS000000",
      "mileage": 132000,
      "fuelType": "Petrol",
      "transmission": "Manual",
      "drive": "2WD",
      "color": "Silver",
      "bodyType": "Sedan",
      "numberOfDoors": 4,
      "address": "Main Street 10, London",
      "notes": ""
    },
    "runtimeFlags": {
      "chargingPortEquipped": false,
      "evBatteryDocsAvailable": false,
      "turboEquipped": false,
      "mechanicalCompressorEquipped": false,
      "importedFromEU": false
    },
    "answers": {
      "q_brakes_pedal_feel": "yes"
    },
    "questionNotes": {
      "q_brakes_pedal_feel": "Pedal feels stable."
    },
    "globalNotes": "Overall clean cabin.",
    "visibleGroupIds": [
      "base-body",
      "fuel-petrol-common"
    ],
    "visibleQuestionIds": [
      "q_brakes_pedal_feel"
    ],
    "parts": [
      {
        "part": "part1",
        "enabled": true,
        "completed": true
      },
      {
        "part": "part2",
        "enabled": true,
        "completed": false
      }
    ],
    "progress": {
      "answeredQuestions": 1,
      "visibleQuestions": 60,
      "completionRate": 1.67,
      "parts": [
        {
          "part": "part2",
          "answeredQuestions": 1,
          "visibleQuestions": 20,
          "completionRate": 5,
          "completed": false
        }
      ]
    },
    "scoreDistribution": {
      "yes": 1,
      "no": 0,
      "dontKnow": 0
    },
    "mode": "editable"
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:30:02Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `401 Unauthorized`
  - `404 Not Found` if the inspection does not belong to the current user or does not exist

#### `DELETE /api/v1/inspections/{inspectionId}`

- Description: Hard-delete an inspection after explicit confirmation.
- Auth: Required
- Query parameters: None
- Request JSON:

```json
{
  "confirmation": "DELETE_INSPECTION"
}
```

- Response JSON:

```json
{
  "data": {
    "deleted": true,
    "inspectionId": "uuid",
    "freedSlots": 1
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:40:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `400 Bad Request` if confirmation is missing or wrong
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict` if the inspection is currently locked by a save operation

### 2.8 Part 1

#### `PUT /api/v1/inspections/{inspectionId}/part-1`

- Description: Validate, normalize, save, and project Part 1 into the inspection snapshot and projection columns.
- Auth: Required
- Query parameters:
  - `dryRun`: `true|false` optional; when `true`, return normalized payload and validation result without persisting
- Request JSON:

```json
{
  "price": 23000,
  "make": " Toyota ",
  "model": "Corolla",
  "yearOfProduction": 2016,
  "registrationNumber": "abc 123",
  "vinNumber": "JH4DA9350LS000000",
  "mileage": 132000,
  "fuelType": "Petrol",
  "transmission": "Manual",
  "drive": "2WD",
  "color": "Silver",
  "bodyType": "Sedan",
  "numberOfDoors": 4,
  "address": "Main Street 10, London",
  "notes": ""
}
```

- Response JSON:

```json
{
  "data": {
    "inspectionId": "uuid",
    "part1": {
      "price": 23000,
      "make": "Toyota",
      "model": "Corolla",
      "yearOfProduction": 2016,
      "registrationNumber": "ABC 123",
      "vinNumber": "JH4DA9350LS000000",
      "mileage": 132000,
      "fuelType": "Petrol",
      "transmission": "Manual",
      "drive": "2WD",
      "color": "Silver",
      "bodyType": "Sedan",
      "numberOfDoors": 4,
      "address": "Main Street 10, London",
      "notes": ""
    },
    "title": "Toyota Corolla 2016 ABC 123",
    "unlockedParts": [
      "part2",
      "part3",
      "part4",
      "part5"
    ],
    "visibleGroupIds": [
      "base-body",
      "fuel-petrol-common"
    ],
    "visibleQuestionIds": [
      "q_brakes_pedal_feel"
    ],
    "smartPruning": {
      "applied": false,
      "removedAnswerIds": [],
      "removedQuestionNoteIds": []
    },
    "snapshotVersion": 8,
    "clientUpdatedAt": "2026-05-01T12:45:00Z"
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:45:01Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `400 Bad Request`
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict` when the supplied base version is stale and canonical state must be refreshed
  - `422 Unprocessable Entity` for field-level or cross-field validation failures

### 2.9 Runtime Flags and Smart Pruning

#### `PATCH /api/v1/inspections/{inspectionId}/runtime-flags`

- Description: Update runtime flags and recompute visible groups/questions.
- Auth: Required
- Query parameters:
  - `mode`: `preview` | `apply` (default `apply`)
- Request JSON:

```json
{
  "chargingPortEquipped": false,
  "evBatteryDocsAvailable": false,
  "turboEquipped": true,
  "mechanicalCompressorEquipped": false,
  "importedFromEU": false,
  "baseSnapshotVersion": 8
}
```

- Response JSON:

```json
{
  "data": {
    "inspectionId": "uuid",
    "runtimeFlags": {
      "chargingPortEquipped": false,
      "evBatteryDocsAvailable": false,
      "turboEquipped": true,
      "mechanicalCompressorEquipped": false,
      "importedFromEU": false
    },
    "visibleGroupIds": [
      "base-body",
      "fuel-petrol-common",
      "petrol-turbo"
    ],
    "visibleQuestionIds": [
      "q_brakes_pedal_feel",
      "q_turbo_whistle"
    ],
    "smartPruning": {
      "applied": true,
      "removedAnswerIds": [],
      "removedQuestionNoteIds": []
    },
    "snapshotVersion": 9
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:50:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `400 Bad Request`
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict`
  - `422 Unprocessable Entity` if unknown flags are provided

### 2.10 Resolved Questions

#### `GET /api/v1/inspections/{inspectionId}/parts/{partId}/questions`

- Description: Return the canonical question cards for a Part after resolving visibility from Part 1 and runtime flags.
- Auth: Required
- Path parameters:
  - `partId`: `part2` | `part3` | `part4` | `part5`
- Query parameters:
  - `include`: optional comma-separated values `explanations`, `answers`, `notes`
- Response JSON:

```json
{
  "data": {
    "inspectionId": "uuid",
    "part": "part2",
    "questionBankVersion": "2026-05-01",
    "groups": [
      {
        "id": "base-body",
        "order": 10,
        "title": "Body",
        "questionIds": [
          "q_body_panel_gaps"
        ]
      }
    ],
    "questions": [
      {
        "id": "q_body_panel_gaps",
        "groupId": "base-body",
        "order": 10,
        "text": "Do the body panel gaps look even?",
        "allowedAnswers": [
          "yes",
          "no",
          "dont_know"
        ],
        "explanationRef": "exp_body_panel_gaps",
        "answer": "yes",
        "questionNote": "Looks consistent."
      }
    ],
    "explanations": {
      "exp_body_panel_gaps": {
        "title": "Why panel gaps matter",
        "content": "Uneven gaps can suggest prior body repair."
      }
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:55:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `401 Unauthorized`
  - `404 Not Found`
  - `422 Unprocessable Entity` if `partId` is invalid or Part 1 is not yet valid

### 2.11 Answers

#### `PUT /api/v1/inspections/{inspectionId}/answers/{questionId}`

- Description: Save or replace a single answer for a currently visible question.
- Auth: Required
- Query parameters: None
- Request JSON:

```json
{
  "answer": "yes",
  "baseSnapshotVersion": 9,
  "clientUpdatedAt": "2026-05-01T12:56:00Z"
}
```

- Response JSON:

```json
{
  "data": {
    "inspectionId": "uuid",
    "questionId": "q_body_panel_gaps",
    "answer": "yes",
    "snapshotVersion": 10,
    "progress": {
      "answeredQuestions": 2,
      "visibleQuestions": 60,
      "completionRate": 3.33
    },
    "scoreDistribution": {
      "yes": 2,
      "no": 0,
      "dontKnow": 0
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:56:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `400 Bad Request`
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict`
  - `422 Unprocessable Entity` if the question is not visible or the answer enum is invalid

#### `DELETE /api/v1/inspections/{inspectionId}/answers/{questionId}`

- Description: Remove an existing answer, typically from Summary editing or correction.
- Auth: Required
- Query parameters: None
- Response JSON:

```json
{
  "data": {
    "inspectionId": "uuid",
    "questionId": "q_body_panel_gaps",
    "deleted": true,
    "snapshotVersion": 11,
    "progress": {
      "answeredQuestions": 1,
      "visibleQuestions": 60,
      "completionRate": 1.67
    },
    "scoreDistribution": {
      "yes": 1,
      "no": 0,
      "dontKnow": 0
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:57:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict`

### 2.12 Notes

#### `PUT /api/v1/inspections/{inspectionId}/question-notes/{questionId}`

- Description: Create or replace a question-scoped note and mirror it into the global notes model as needed by the domain service.
- Auth: Required
- Query parameters: None
- Request JSON:

```json
{
  "note": "Small paint mismatch near the rear door.",
  "baseSnapshotVersion": 10,
  "clientUpdatedAt": "2026-05-01T12:58:00Z"
}
```

- Response JSON:

```json
{
  "data": {
    "inspectionId": "uuid",
    "questionId": "q_body_panel_gaps",
    "questionNote": "Small paint mismatch near the rear door.",
    "globalNotes": "## Do the body panel gaps look even?\nSmall paint mismatch near the rear door.",
    "snapshotVersion": 11
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:58:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `400 Bad Request`
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict`
  - `422 Unprocessable Entity` if the note exceeds 500 characters or the question is not visible

#### `DELETE /api/v1/inspections/{inspectionId}/question-notes/{questionId}`

- Description: Remove a question-scoped note.
- Auth: Required
- Query parameters: None
- Response JSON:

```json
{
  "data": {
    "inspectionId": "uuid",
    "questionId": "q_body_panel_gaps",
    "deleted": true,
    "snapshotVersion": 12
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T12:59:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict`

#### `PUT /api/v1/inspections/{inspectionId}/global-notes`

- Description: Replace the session-level global notes document.
- Auth: Required
- Query parameters: None
- Request JSON:

```json
{
  "globalNotes": "Overall clean interior. Minor tire wear.",
  "baseSnapshotVersion": 12,
  "clientUpdatedAt": "2026-05-01T13:00:00Z"
}
```

- Response JSON:

```json
{
  "data": {
    "inspectionId": "uuid",
    "globalNotes": "Overall clean interior. Minor tire wear.",
    "snapshotVersion": 13
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T13:00:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `400 Bad Request`
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict`
  - `422 Unprocessable Entity` if `globalNotes` exceeds 10000 characters

### 2.13 Summary and Report Lifecycle

#### `GET /api/v1/inspections/{inspectionId}/summary`

- Description: Return the report-ready inspection summary with per-part and global distributions plus editable answer rows.
- Auth: Required
- Query parameters:
  - `include`: optional comma-separated values `questions`, `notes`
- Response JSON:

```json
{
  "data": {
    "inspectionId": "uuid",
    "title": "Toyota Corolla 2016 ABC 123",
    "status": "draft",
    "mode": "editable",
    "totalScoreDistribution": {
      "yes": 12,
      "no": 4,
      "dontKnow": 2
    },
    "parts": [
      {
        "part": "part2",
        "scoreDistribution": {
          "yes": 5,
          "no": 2,
          "dontKnow": 1
        }
      }
    ],
    "questions": [
      {
        "questionId": "q_body_panel_gaps",
        "part": "part2",
        "groupId": "base-body",
        "text": "Do the body panel gaps look even?",
        "answer": "yes",
        "editable": true,
        "questionNote": "Looks consistent."
      }
    ],
    "progress": {
      "answeredQuestions": 18,
      "visibleQuestions": 60,
      "completionRate": 30
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T13:05:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `401 Unauthorized`
  - `404 Not Found`

#### `POST /api/v1/inspections/{inspectionId}/finalize`

- Description: Mark an inspection as `completed` only after explicit user action.
- Auth: Required
- Query parameters: None
- Request JSON:

```json
{
  "confirmation": "FINALIZE_INSPECTION",
  "baseSnapshotVersion": 13
}
```

- Response JSON:

```json
{
  "data": {
    "inspectionId": "uuid",
    "status": "completed",
    "completedAt": "2026-05-01T13:10:00Z",
    "mode": "report",
    "snapshotVersion": 14
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T13:10:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `400 Bad Request` if confirmation is missing or invalid
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict`
  - `422 Unprocessable Entity` if the inspection is not in a valid state for finalization

#### `POST /api/v1/inspections/{inspectionId}/reopen`

- Description: Reopen a completed report for editing after explicit confirmation.
- Auth: Required
- Query parameters: None
- Request JSON:

```json
{
  "confirmation": "REOPEN_INSPECTION",
  "baseSnapshotVersion": 14
}
```

- Response JSON:

```json
{
  "data": {
    "inspectionId": "uuid",
    "status": "draft",
    "completedAt": null,
    "mode": "editable",
    "snapshotVersion": 15
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T13:12:00Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `400 Bad Request`
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict`

### 2.14 Offline Sync

#### `POST /api/v1/inspections/{inspectionId}/sync`

- Description: Canonical offline-first synchronization endpoint. Accept a full or partial inspection snapshot mutation, apply validation, recompute derived state, enforce business rules, and resolve conflicts using client-wins LWW with explicit canonical response.
- Auth: Required
- Query parameters:
  - `strategy`: currently only `client_wins`
- Request JSON:

```json
{
  "baseSnapshotVersion": 13,
  "clientUpdatedAt": "2026-05-01T13:15:00Z",
  "mutation": {
    "part1": {
      "make": "Toyota",
      "model": "Corolla",
      "fuelType": "Petrol",
      "transmission": "Manual",
      "drive": "2WD",
      "bodyType": "Sedan"
    },
    "runtimeFlags": {
      "chargingPortEquipped": false,
      "evBatteryDocsAvailable": false,
      "turboEquipped": true,
      "mechanicalCompressorEquipped": false,
      "importedFromEU": false
    },
    "answers": {
      "q_body_panel_gaps": "yes"
    },
    "questionNotes": {
      "q_body_panel_gaps": "Looks consistent."
    },
    "globalNotes": "Overall clean interior."
  }
}
```

- Response JSON:

```json
{
  "data": {
    "inspection": {
      "id": "uuid",
      "title": "Toyota Corolla",
      "status": "draft",
      "snapshotVersion": 14,
      "clientUpdatedAt": "2026-05-01T13:15:00Z",
      "updatedAt": "2026-05-01T13:15:01Z",
      "part1": {
        "make": "Toyota",
        "model": "Corolla",
        "fuelType": "Petrol",
        "transmission": "Manual",
        "drive": "2WD",
        "bodyType": "Sedan"
      },
      "runtimeFlags": {
        "chargingPortEquipped": false,
        "evBatteryDocsAvailable": false,
        "turboEquipped": true,
        "mechanicalCompressorEquipped": false,
        "importedFromEU": false
      },
      "answers": {
        "q_body_panel_gaps": "yes"
      },
      "questionNotes": {
        "q_body_panel_gaps": "Looks consistent."
      },
      "globalNotes": "Overall clean interior.",
      "visibleGroupIds": [
        "base-body",
        "fuel-petrol-common",
        "petrol-turbo"
      ],
      "visibleQuestionIds": [
        "q_body_panel_gaps",
        "q_turbo_whistle"
      ],
      "progress": {
        "answeredQuestions": 1,
        "visibleQuestions": 61,
        "completionRate": 1.64
      },
      "scoreDistribution": {
        "yes": 1,
        "no": 0,
        "dontKnow": 0
      },
      "mode": "editable"
    },
    "conflict": {
      "detected": false,
      "resolvedWith": "client_wins"
    },
    "smartPruning": {
      "applied": false,
      "removedAnswerIds": [],
      "removedQuestionNoteIds": []
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T13:15:01Z"
  }
}
```

- Conflict response JSON:

```json
{
  "error": {
    "code": "SYNC_CONFLICT",
    "message": "The inspection changed since the provided base snapshot version.",
    "details": [
      {
        "field": "baseSnapshotVersion",
        "message": "Refresh local state and retry."
      }
    ]
  },
  "data": {
    "canonicalInspection": {
      "id": "uuid",
      "snapshotVersion": 14,
      "clientUpdatedAt": "2026-05-01T13:14:00Z"
    }
  },
  "meta": {
    "requestId": "req_01J...",
    "timestamp": "2026-05-01T13:15:01Z"
  }
}
```

- Success codes:
  - `200 OK`
- Error codes:
  - `400 Bad Request`
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict` with code `SYNC_CONFLICT`
  - `422 Unprocessable Entity` for invalid snapshot shape or business-rule violations

## 3. Authentication and Authorization

### Authentication model

- The API uses Supabase Auth with email/password credentials and SSR-friendly secure cookies managed by Nitro.
- Protected routes require a valid authenticated session resolved server-side on every request.
- Cookies should be `HttpOnly`, `Secure`, and `SameSite=Lax` at minimum.
- Session refresh is handled by `/api/v1/auth/refresh` so offline users can reconnect without losing local inspection state.

### Authorization model

- Every protected endpoint resolves the authenticated `user_id` from the server session and scopes all data access to that identity.
- Reads should use a user-scoped Supabase client so PostgreSQL RLS remains active.
- Writes should go through trusted Nitro services and narrow SQL functions, because direct browser writes to `public.inspections` and `public.user_preferences` are intentionally denied.
- Admin-grade operations such as account deletion may use a service-role path, but only after verifying the current session and explicit confirmation.
- `404 Not Found` should be returned for inaccessible inspection IDs to avoid leaking resource existence.

### Security controls

- Apply rate limits at the edge and application layer:
  - Auth endpoints: strict IP and email-based rate limits.
  - Destructive endpoints (`DELETE /me`, `DELETE /inspections/{id}`): very low burst limits.
  - Sync/write endpoints: per-session throttling to absorb reconnect storms.
- Require `Origin` and `Referer` validation on state-changing requests because the session model is cookie-based.
- Enforce JSON body size limits to protect sync and notes endpoints.
- Log authentication failures, delete flows, finalization, reopen, and conflict events with request IDs.
- Never expose service-role credentials to the browser.

## 4. Validation and Business Logic

### 4.1 Cross-resource validation rules

- `Inspection` ownership is mandatory on every read and mutation.
- `status` can only be `draft` or `completed`.
- `completedAt` must be `null` when `status = draft` and non-null when `status = completed`.
- `questionBankVersion` and `snapshotSchemaVersion` are set at creation time and are immutable afterwards.
- `snapshotVersion` must be a positive integer and increase only on accepted state changes.
- No-op updates must not advance `snapshotVersion` or `updatedAt`.

### 4.2 Preferences validation

- `theme` must be one of `system`, `light`, `dark`.
- `fontScale` must be one of `small`, `medium`, `large`.
- `hideInspectionIntro` must be boolean.
- Only these fields are mutable through the preferences endpoint.

### 4.3 Part 1 validation

- `make`, `model`, `fuelType`, `transmission`, `drive`, and `bodyType` are required.
- `price` is optional; if provided, it must be a decimal in the range `0..10000000` with max 2 fraction digits.
- `make` must be trimmed and be `1..50` characters.
- `model` must be trimmed and be `1..60` characters.
- `yearOfProduction` is optional; if provided, it must be exactly 4 digits and within `1886..current year + 1`.
- `registrationNumber` is optional; if provided, after normalization it must be `2..15` chars and match `^[A-Z0-9 -]+$`.
- `vinNumber` is optional; if provided, it must be 17 chars and match `^[A-HJ-NPR-Z0-9]{17}$`.
- `mileage` is optional; if provided, it must be an integer in `0..9999999`.
- `fuelType` must be one of `Petrol`, `Diesel`, `Hybrid`, `Electric`.
- `transmission` must be one of `Manual`, `Automatic`.
- `drive` must be one of `2WD`, `4WD`.
- `color` is optional; if provided, it must be `1..40` trimmed characters.
- `bodyType` must be one of `Sedan`, `Hatchback`, `SUV`, `Coupe`, `Convertible`, `Van`, `Pickup`, `Other`.
- `numberOfDoors` is optional; if provided, it must be an integer in `1..9`.
- `address` is optional; if provided, it must be `5..150` trimmed characters.
- `notes` is optional and capped at 1000 characters.
- Normalization must trim whitespace, collapse repeated spaces, uppercase selected fields such as `registrationNumber` and `vinNumber`, and preserve semantic meaning.
- Cross-field rule: `fuelType = Electric` requires `transmission = Automatic`; otherwise return `422` with message `Electric cars must use Automatic transmission.`
- On a valid save, the API must rebuild the inspection title from normalized fields and determine whether Parts 2-5 become enabled.

### 4.4 Snapshot validation

- `snapshot` must be a JSON object with top-level keys: `part1`, `runtimeFlags`, `answers`, `questionNotes`, `globalNotes`, `visibleGroupIds`, `visibleQuestionIds`.
- `part1` may be an object or `null`.
- `runtimeFlags` must contain exactly the supported boolean keys:
  - `chargingPortEquipped`
  - `evBatteryDocsAvailable`
  - `turboEquipped`
  - `mechanicalCompressorEquipped`
  - `importedFromEU`
- `answers` is a map of `questionId -> yes | no | dont_know`.
- `questionNotes` is a map of `questionId -> string`, max 500 chars per note.
- `globalNotes` must be a string no longer than 10000 chars.
- `visibleGroupIds` and `visibleQuestionIds` must be arrays of strings generated canonically by the server, not trusted from the client.

### 4.5 Question and answer rules

- Questions are resolved from the repo-based question bank according to `Base + fuelType + transmission + drive + bodyType` plus supported runtime flags.
- Parts 2-5 stay unavailable until Part 1 required fields are valid.
- Answers may only be saved for question IDs that are currently visible.
- When Part 1 or runtime flags change, the API must recompute `visibleGroupIds` and `visibleQuestionIds` and apply Smart Pruning:
  - preserve answers and notes still attached to visible questions
  - remove orphaned answers and question notes
  - recalculate progress and score distribution immediately
  - report what was removed so the client can warn the user

### 4.6 Inspection lifecycle rules

- A user may have at most 2 inspections total across `draft` and `completed` statuses.
- Create inspection must be atomic and reject the request with `409 INSPECTION_LIMIT_REACHED` when the limit is reached.
- Delete inspection is hard delete only, requires explicit confirmation, and frees a slot immediately.
- Inspection completion is manual only and may happen only through the finalize endpoint.
- Opening a completed report for editing requires explicit confirmation and changes status back to `draft`.
- Finalization and reopen must be command endpoints, not generic field updates.

### 4.7 Offline-first and conflict rules

- The client is expected to persist inspection state locally in IndexedDB and queue offline mutations.
- `/sync` is the canonical reconciliation endpoint for reconnect flows.
- The server compares `baseSnapshotVersion` and `clientUpdatedAt` with canonical state.
- Conflict handling follows the MVP policy `Last Write Wins / Client Wins`, but the API must still return an explicit conflict response carrying the canonical record when versions diverge.
- The server must never silently drop queued offline changes.
- Session expiry during offline work must not invalidate local data; the client refreshes auth first, then retries sync.

### 4.8 Recommended implementation notes for Nitro + Supabase

- Implement REST handlers in Nitro server routes under `/server/api/v1/**`.
- Use shared Zod schemas in `shared/` for request parsing and response shaping.
- Perform strict `safeParse` validation at the route boundary and return field-aware `422` errors.
- Centralize domain logic in server services so `PUT /part-1`, `PATCH /runtime-flags`, answer/note writes, finalize/reopen, and `/sync` all reuse the same canonical save pipeline.
- Prefer private SQL functions or transactional service methods for create, delete, finalize, reopen, and save-snapshot operations because browser-side direct table writes are intentionally blocked by RLS policy.