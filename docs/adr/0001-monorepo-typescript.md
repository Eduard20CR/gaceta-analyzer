# ADR-0001 — TypeScript monorepo with npm workspaces

- **Status:** Proposed
- **Date:** 2026-11-04

## Context

The project has a frontend and several Lambdas that share the same data model (job, finding, statuses). It is developed by a single person. The initial proof of concept was written in Python, but the developer is more comfortable with Node.js and TypeScript.

## Decision

A single repository with **npm workspaces** and **TypeScript** everywhere:

- `apps/web`: frontend.
- `apps/api`: the Lambdas.
- `packages/shared`: shared types and constants.

## Alternatives considered

- **Python backend:** the proof of concept already worked and PyMuPDF extracts text very well. Rejected because it requires maintaining types twice (Python and TypeScript) and compiling PyMuPDF for Linux when packaging.
- **Separate repositories:** more ceremony for a small project, and shared types would have to be published as a package.
- **Turborepo or Nx:** useful in large monorepos. For two applications, npm workspaces is enough.

## Consequences

- A change to a shared type is caught at compile time in both the frontend and the backend.
- A single `npm install` and a single pipeline.
- Text extraction with JavaScript libraries may be somewhat worse than PyMuPDF on multi-column documents. [Spike 0001](../spikes/0001-pdf-extraction.md) checked it with a real La Gaceta PDF: unpdf is as good as PyMuPDF (see ADR-0009).
