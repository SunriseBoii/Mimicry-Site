# PS-04.M4 dynamic Build flow

Local session state only. No AI, API, CRM, analytics, or PII persistence.

## 03.1

Four provisional labels. Selecting a task unlocks `03.2` in the same session. Graph ring dashed→solid. Panel is added; scroll compensation keeps the current node.

## 03.2

Multi-select in frozen competence order. Confirm with empty selection is blocked; error is a text `role="alert"`: «Выберите хотя бы одну компетенцию…». Confirm unlocks `03.3`. Changing the selection later updates the brief data but does not relock.

## 03.3

Provisional brief from task + selection. Manual edits stick (`briefEdited`). Send opens an accessible dialog on top of Brief: ФИО, phone/Telegram, provisional consent. Validation is textual.

Simulated submit waits **480 ms**, then success `role="status"` for **4200 ms** (or until Close). Both overlays are non-nodes; the graph stays on `03.3`. Success does not store the contact fields (they are cleared in `simulateSuccess`).

Reload of the lab starts a clean session.
