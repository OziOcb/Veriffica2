/**
 * Pure helper for deterministic one-way mirroring of question notes into
 * the global notes document.
 *
 * Rules:
 * - A question note is represented in global_notes as a Markdown section
 *   headed by the question label.
 * - Upsert replaces the managed section for a question if it exists, or
 *   appends a new section if it does not.
 * - Remove deletes the managed section for a question.
 * - Content between managed sections (i.e. text the user typed manually) is
 *   always preserved unchanged.
 * - Neither function parses the free-text content back into question_notes;
 *   the mirroring is strictly one-way.
 *
 * Managed section format:
 *   <!-- note:q_<id> -->
 *   ### <Question label>
 *   <note text>
 *   <!-- /note:q_<id> -->
 *
 * The sentinel comments act as stable anchors that survive user edits to the
 * surrounding text.
 */

// ── Sentinel helpers ────────────────────────────────────────────────────────

function openSentinel(questionId: string): string {
  return `<!-- note:${questionId} -->`;
}

function closeSentinel(questionId: string): string {
  return `<!-- /note:${questionId} -->`;
}

/**
 * Renders a managed note section for a single question.
 */
function renderSection(
  questionId: string,
  questionLabel: string,
  note: string,
): string {
  return [
    openSentinel(questionId),
    `### ${questionLabel}`,
    note,
    closeSentinel(questionId),
  ].join("\n");
}

/**
 * Splits `globalNotes` into three parts around the managed section for
 * `questionId`:
 * - `before`: text before the open sentinel (may be empty)
 * - `section`: the managed section including sentinels (null if absent)
 * - `after`: text after the close sentinel (may be empty)
 */
function splitAroundSection(
  globalNotes: string,
  questionId: string,
): { before: string; section: string | null; after: string } {
  const open = openSentinel(questionId);
  const close = closeSentinel(questionId);

  const openIdx = globalNotes.indexOf(open);
  if (openIdx === -1) {
    return { before: globalNotes, section: null, after: "" };
  }

  const closeIdx = globalNotes.indexOf(close, openIdx);
  if (closeIdx === -1) {
    // Malformed document — treat everything from open to end as the section.
    return {
      before: globalNotes.slice(0, openIdx),
      section: globalNotes.slice(openIdx),
      after: "",
    };
  }

  return {
    before: globalNotes.slice(0, openIdx),
    section: globalNotes.slice(openIdx, closeIdx + close.length),
    after: globalNotes.slice(closeIdx + close.length),
  };
}

/**
 * Joins document fragments, collapsing runs of blank lines that result from
 * inserting or removing sections.
 */
function joinFragments(...parts: string[]): string {
  const joined = parts.join("\n\n");
  // Collapse more than two consecutive newlines to two.
  return joined.replace(/\n{3,}/g, "\n\n").trim();
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Inserts or replaces the managed section for `questionId` in `globalNotes`.
 *
 * If a managed section already exists it is replaced in-place, preserving its
 * surrounding context (user-authored text). If no section exists a new one is
 * appended to the document.
 *
 * @param globalNotes   Current value of snapshot.global_notes.
 * @param questionId    Canonical question ID (e.g. `q_body_panel_gaps`).
 * @param questionLabel Human-readable label from the question bank.
 * @param note          New note text (already trimmed and validated).
 * @returns             Updated global notes document string.
 */
export function upsertQuestionNoteInDocument(
  globalNotes: string,
  questionId: string,
  questionLabel: string,
  note: string,
): string {
  const section = renderSection(questionId, questionLabel, note);
  const {
    before,
    section: existing,
    after,
  } = splitAroundSection(globalNotes, questionId);

  if (existing === null) {
    // Append new section.
    return joinFragments(globalNotes, section);
  }

  // Replace existing section in-place.
  return joinFragments(before, section, after);
}

/**
 * Removes the managed section for `questionId` from `globalNotes`.
 *
 * If no managed section for this question exists, the document is returned
 * unchanged. User-authored text surrounding the removed section is preserved.
 *
 * @param globalNotes Current value of snapshot.global_notes.
 * @param questionId  Canonical question ID (e.g. `q_body_panel_gaps`).
 * @returns           Updated global notes document string.
 */
export function removeQuestionNoteFromDocument(
  globalNotes: string,
  questionId: string,
): string {
  const { before, section, after } = splitAroundSection(
    globalNotes,
    questionId,
  );

  if (section === null) {
    // Nothing to remove — document is already consistent.
    return globalNotes;
  }

  const remaining = joinFragments(before, after);
  return remaining;
}
