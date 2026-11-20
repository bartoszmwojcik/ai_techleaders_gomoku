// Which pull requests may skip the heavy CI jobs (job `changes` in .github/workflows/ci.yml).
// Documentation only: Markdown anywhere, .ai/, docs/, LICENSE. Files that steer agents or CI itself
// (skills, their lock file, agent settings, workflows) are code even when they are Markdown (T-10):
// a SKILL.md is an instruction executed by an agent, not documentation.
const DOCS_ONLY = /^(.*\.md|\.ai\/.*|docs\/.*|LICENSE)$/;
const ALWAYS_CODE =
  /^(\.agents\/|\.claude\/|\.github\/|skills-lock\.json$|\.ai\/(skills|scripts|trackers|browsers)\/|\.ai\/agentic\.config\.json$)/;

// The LikeC4 architecture model and its compliance check (job `architecture`), independent of `code`: a PR changing only
// the model (still documentation for the `code` rule) runs the check without the heavy jobs.
const ARCH = /^(docs\/architektura\/|scripts\/architecture\/)/;

/** Whether a changed file (repository-relative, `/` separated) counts as documentation only. */
export function isDocsOnly(file) {
  return DOCS_ONLY.test(file) && !ALWAYS_CODE.test(file);
}

/**
 * `code` is false only when every changed file is documentation; `codeFiles` lists the others.
 * `arch` is true when the architecture model or its check changed.
 */
export function classify(files) {
  const changed = files.filter((file) => file !== "");
  const codeFiles = changed.filter((file) => !isDocsOnly(file));
  return { code: codeFiles.length > 0, arch: changed.some((file) => ARCH.test(file)), codeFiles };
}
