# Documentation — Gaceta Analyzer

Single-user web application that analyzes long PDFs (for example, La Gaceta, Costa Rica's official gazette) with AI and returns the pages related to the topics the user specifies.

## Index

| Document | Contents |
|---|---|
| [requirements/functional.md](requirements/functional.md) | What the system must do |
| [requirements/non-functional.md](requirements/non-functional.md) | Security, cost, performance, operations |
| [architecture.md](architecture.md) | Components, flow, data model and API contract |
| [adr/](adr/) | Architecture Decision Records |
| [spikes/](spikes/) | Short investigations that back a decision (method, examples, verdict) |

## Scope by version

| Version | Includes |
|---|---|
| **v1** | Upload a PDF with a search prompt, asynchronous analysis, view results, history |
| **v1.1** | In-app PDF viewer: clicking a finding opens the PDF at that page |
| **Future** | Highlighting the quote inside the viewer |

## Conventions

- **Everything in the repository is in English**: code, file names, variables, tables, API routes, comments and documentation.
- **The only exception is user-facing text in the web UI**, which is in **Spanish** because the user is a Spanish speaker. This includes labels, buttons and the error messages the API returns to be displayed to the user. In these docs, that text appears in quotes and in Spanish, for example "Contraseña incorrecta".
- One new ADR per decision change. An accepted ADR is never edited to change its decision: a new ADR replaces it, and the old one is marked `Superseded by ADR-XXXX`. While an ADR is still `Proposed`, it can be edited freely.
