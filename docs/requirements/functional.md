# Functional requirements

**Single user:** the application is used by one person. There is no user registration, roles or permissions.

Each requirement has an ID (`FR-XX`), the version it belongs to and its acceptance criteria. A requirement is done when it meets all its criteria.

User-facing text is shown in Spanish, in quotes.

---

## FR-01 — Password access · v1

The user enters the application with a password.

**Acceptance criteria**
- On the first visit, the web app shows a screen to enter the password.
- If the password is correct, it is stored in the browser and not requested again on that device.
- If the password is wrong, the app shows "Contraseña incorrecta" and does not store it.
- If the stored password stops being valid (for example, because it was changed), the API responds 401 or 403 and the web app asks for it again.
- A "Cerrar sesión" button deletes the stored password.

---

## FR-02 — Create an analysis · v1

The user creates an analysis by specifying what to look for and which PDF to review.

**Acceptance criteria**
- The form has:
  - **Name** (optional, max 120 characters). If empty, the file name is used.
  - **Search query** (required, between 3 and 2,000 characters). Free text: it can be a list of topics ("impuestos, aranceles") or an instruction ("cambios en tarifas de importación de alimentos").
  - **PDF file** (required).
  - **Advanced settings** ("Configuración avanzada"), a collapsible section closed by default, with:
    - **Pages per block** ("Páginas por bloque"): whole number, minimum **2**, no maximum, default **5**. It defines how many pages are sent to the AI in each call (see FR-03).
- The "Analizar" button is disabled until the required fields are valid.
- Before uploading, the web app checks that the file is a PDF and is at most **100 MB**. If not, it shows the reason and does not upload it.
- On submit:
  1. The job is created in the database with the name, the search query, the pages per block and status `PENDING_UPLOAD`.
  2. The PDF is uploaded to S3 directly from the browser.
  3. The web app shows an upload progress bar.
- When the upload finishes, the web app navigates to the job page (FR-04).
- If the upload fails, the app shows an error and a button to retry the upload for the same job.

---

## FR-03 — Automatic PDF analysis · v1

When the PDF finishes uploading, the system analyzes it without any further action from the user.

**Acceptance criteria**
- The analysis starts automatically when the PDF lands in S3.
- The text of each page is extracted.
- There is no page limit. Documents of 500 pages or more are normal for La Gaceta.
- If no page contains text (scanned PDF), the job ends as `FAILED` with the message "El PDF no contiene texto. Puede ser un documento escaneado".
- Pages are grouped into blocks using the job's **pages per block** (FR-02), with **always 1 overlapping page** between consecutive blocks. With the default of 5: 1–5, 5–9, 9–13… The overlap is not configurable.
- Each block is sent to the AI together with the job's search query.
- Each AI finding includes: page, topic, verbatim quote, reason and relevance (`high`, `medium`, `low`).
- Each quote is verified against the actual PDF text:
  - `verified`: the quote is on the stated page.
  - `page_corrected`: the quote is on another page of the same block; the page number is corrected.
  - `not_found`: the quote was not found.
- Duplicate findings caused by overlapping pages are removed.
- Findings are sorted by page number.
- If a block fails after 3 retries, the analysis continues with the remaining blocks, and the result lists the pages that could not be analyzed.
- If **all** blocks fail, the job ends as `FAILED`.

---

## FR-04 — View the status and result of an analysis · v1

The user sees whether an analysis is still running and, when it finishes, its results.

**Acceptance criteria**
- The job page shows: name, search query, pages per block, creation date and status.
- While the status is `PENDING_UPLOAD` or `PROCESSING`, the web app polls the API every **4 seconds** and shows that the analysis is still running ("Analizando el documento…"). It does not show per-block progress (ADR-0014).
- When the status is `COMPLETED`:
  - A **summary** is shown: total findings and the list of pages with high or medium relevance.
  - The **findings list** is shown, each with page, topic, relevance, quote, reason and verification status.
  - `not_found` findings are shown with a visible warning ("La cita no se encontró en el documento").
  - The list can be **filtered** by relevance.
  - If some blocks failed, a notice lists the pages that were not analyzed.
- When the status is `FAILED`, the error message is shown.
- If a job stays in `PROCESSING` for more than **20 minutes**, the API reports it as `FAILED` with the message "El análisis tardó demasiado".
- If a job stays in `PENDING_UPLOAD` for more than **1 hour**, the API reports it as `FAILED` with the message "El PDF nunca se subió".
- The job page URL is stable (`/jobs/{id}`), so the user can come back to it later.

---

## FR-05 — Analysis history · v1

The user sees the list of all analyses.

**Acceptance criteria**
- The home page shows analyses from **newest to oldest**.
- Each item shows: name, date, status and number of findings (if completed).
- Clicking an item opens its page (FR-04).
- Items load **20** at a time, with a "Cargar más" button.
- If there are no analyses, a message invites the user to create the first one.

---

## FR-06 — PDF viewer with jump to page · v1.1

The user views the PDF inside the application and jumps to the page of each finding.

**Acceptance criteria**
- The job page shows the PDF next to the findings list (on small screens, below it or in a tab).
- Clicking a finding makes the viewer jump to that page.
- The viewer supports manual page navigation and zoom.
- If the PDF was already deleted by the retention policy (NFR-SEC-06), the app shows "El PDF ya no está disponible" and the findings list remains visible.

---

## Out of scope

These features are **not** being built now. They are listed to make clear they were considered.

| Feature | Reason |
|---|---|
| Highlighting the quote inside the viewer | Comes after FR-06 |
| Keyword pre-filter (without AI) | Rejected: it can miss findings (see ADR-0010) |
| OCR for scanned PDFs | Current documents contain text |
| Saved topic lists | The search query is typed for each analysis |
| Deleting an analysis from the web app | Not needed for now |
| Re-analyzing a PDF with a different query | A new analysis is created instead |
| Exporting results (Excel, PDF) | Not needed for now |
| Notifications (email) on completion | Analysis takes a few minutes |
| Multiple users | Single-user application |
