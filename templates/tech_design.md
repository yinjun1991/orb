# Technical design: {{TITLE}}

## Overview

<!-- One paragraph: what problem this solves and the core approach. -->

## Goals, non-goals & constraints

<!-- Pulled from issue.md. Keep the design doc self-contained — don't force readers to flip between files. -->

- **Goals**:
- **Non-goals**:
- **Constraints**:

## Terms

<!-- Only new concepts introduced by this design. Skip terms that already exist in production. -->

| Term | Meaning |
|------|---------|
| <!-- e.g. Session token --> | <!-- opaque token for auth, replaces the plain user ID cookie --> |

## Core flow

<!-- Primary business flow or request lifecycle. Use Mermaid. Happy path first. -->

```mermaid
sequenceDiagram
  %% ...
```

## Data model

<!-- New or modified entities, fields, and relationships. Only what's relevant. -->

| Entity | Change | Fields |
|--------|--------|--------|
| <!-- e.g. User --> | <!-- add --> | <!-- email, status --> |

## Module interfaces

<!-- Key function signatures, API contracts, or component boundaries. Include input/output types and error modes. Skip internal helpers. -->

```
// e.g. POST /api/auth/login
//   request:  { email: string, password: string }
//   response: { token: string } | 401
```

## Key decisions

<!-- What was chosen and why. List alternatives and the reason for each choice. -->

| Decision | Choice | Alternatives | Reason |
|----------|--------|-------------|--------|
| <!-- e.g. auth strategy --> | <!-- JWT --> | <!-- session, OAuth --> | <!-- stateless, simpler --> |

## Risks & trade-offs

<!-- What could go wrong? What was sacrificed? What assumptions were made? -->

## Migration / rollback

<!-- Required migration steps or rollback plan. Write "N/A" if not applicable. -->
