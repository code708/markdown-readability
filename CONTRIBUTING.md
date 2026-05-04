# Contributing to @code708/markdown-readability

Thank you for your interest in contributing. This guide describes how to add a new rule.

## Quick Start

1. **Clone and install dependencies:**

   ```bash
   git clone https://github.com/code708/markdown-readability.git
   cd markdown-readability
   npm install
   ```

2. **Verify ci checks are working locally:**

   ```bash
   npm run pr:dry
   ```

3. **Try the demo:**

   ```bash
   node example/demo.js
   ```

## Implementing Code Changes

### Naming Conventions

**Rule name**: Use `C708-𝑖` (with 𝑖 ∈ [001,…,999])

- Keep the source file name aligned with the rule name, for example `src/C708-003.js`.
- Keep the test file name aligned with the rule name, for example `test/C708-003.test.js`.
- Keep the doc file name aligned with the rule name, for example `doc/C708-003.md`.
- Increment the rule name's id sequentially.
- Export new rules from `index.js` so they are available to consumers.

### Coding Principles and Conventions

### Adding a New Rule

Overview of relevant rule files:

```text
markdown-readability/
├── src/                      # Business Logic
│   ├── C708-001.js
│   ├── C708-002.js
│   └── C708-XXX.js
├── test/                     # Tests (discovered automatically)
│   ├── C708-001.test.js
│   ├── C708-002.test.js
│   └── C708-XXX.test.js
├── doc/                      # Consumer documentation
│   ├── C708-001.md
│   ├── C708-002.md
│   ├── C708-XXX.md
│   └── rules-overview.md
├── example/                  # Consumer examples
│   ├── demo.js
│   ├── respects-all-rules.md
│   └── violates-all-rules.md
└── index.js                  # Main npm package entry point
```

#### Best Practices

1. **Keep rules focused**: Each rule should check one specific thing
2. **Provide clear error messages**: Help users understand what's wrong
3. **Add fixInfo when possible**: Enable automatic fixes
4. **Write comprehensive tests**: Cover edge cases
5. **Document leanly**: Explain conceptual rationale and provide examples
6. **Consider performance**: Avoid expensive operations in loops
7. **Use TDD**: Design the concept of a new rule or its improvement first before implementing
8. **Commit small changes**: Use the project's [commit messages convention](#writing-commit-messages)

#### Step 1: Design A Test Suite

Create the test file `test/C708-003.test.js` and add cases following [Recipe for Writing a RuleTestCase](#recipe-for-writing-a-ruletestcase). Then run the suite to verify the plumbing works and the rule is not duplicating an existing one:

```bash
npm test
```

#### Step 2: Implement the Rule Logic

Create a new file in `src/` named after the rule, for example `src/C708-003.js`:

```javascript
// @ts-check
"use strict";

module.exports = {
  names: ["C708-003"],

  description: "Concise conceptual rationale of 1) what problem the rule solves and 2) how it solves the problem.",

  tags: ["headers", "spaces"],

  /**
   * Markdownlint custom rule function.
   *
   * @param {Object} document - An object containing information about the markdown file being linted.
   * @param {string} document.name - The name of the rule.
   * @param {Object} document.tokens - The tokens parsed from the markdown file.
   * @param {string} document.lines - The lines of the markdown file.
   * @param {Object} document.frontMatterLines - The front matter lines of the markdown file.
   * @param {Function} onError - Callback function to report errors found during linting.
   * @param {number} onError.lineNumber - The line number where the error occurred.
   * @param {string} [onError.detail] - Optional details about the error.
   * @param {string} [onError.context] - Optional context for the error.
   * @param {number[]} [onError.range] - Optional range of the error as [startColumn, length].
   */
  function: function rule(document, onError) {

    document.tokens.forEach(token => {
      if (/* violation detected */) {
        onError({
          lineNumber: token.lineNumber,
          detail: "Explanation of the issue",
          context: token.content,
          range: [1, token.content.length],
          fixInfo: {
            lineNumber: token.lineNumber,
            editColumn: 1,
            deleteCount: 0,
            insertText: "fix text"
          }
        });
      }
    });
  }
};
```

Next, run the rule's test cases

```bash
npm test C708-003
```

Loop through test->implementation iterations until all test cases succeed and no further test cases are needed.

##### Understanding Markdown Tokens

Markdownlint uses markdown-it for parsing. Common token types:

- `heading_open` / `heading_close`: Heading boundaries
- `inline`: Text content (inside headings, paragraphs, etc.)
- `paragraph_open` / `paragraph_close`: Paragraph boundaries
- `link_open` / `link_close`: Link boundaries
- `code_block`: Code blocks
- `fence`: Fenced code blocks
- `list_item_open` / `list_item_close`: List items

Access token properties:

- `token.type`: Token type
- `token.content`: Text content
- `token.lineNumber`: Line number in the file
- `token.line`: Full line text

#### Step 3: Provide Consumer Documentation

Add your rule documentation under `doc/` as `doc/C708-003.md` and, if relevant, mention it in `README.md`:

```markdown
#### C708-003

Concise conceptual rationale of 1) what problem the rule solves and 2) how it solves the problem.

❌ Bad:
\`\`\`markdown

# Example of violation

\`\`\`

✅ Good:
\`\`\`markdown

# Example of correct usage

\`\`\`
```

#### Step 4: Validate Your Changes are Releasable

```bash
npm run pr:dry
```

## Writing Tests

This project uses an opinionated variation of the GTW pattern, where the Given is not used explicitly for stating assertion cases. The Given is implicitly present through the test implementation.

Tests in this repository follow two declarative shapes, defined in `test/test-types.js`:

- **`RuleTestCase = { shouldViolateAtLines, when, markdown }`** — used for every rule test under `test/C708-XXX.test.js`. This is the shape rule contributors use.
- **`AssertionCase<T> = { should, when, run, test, failWith }`** — used for repository-level tests (e.g. `test/consumer-docs.test.js`, `test/npm-package.test.js`).

Both map to the same conceptual frame: `when:` carries the situation in which the module is exercised; the trait the module must display is stated by `should:` (or implied by `shouldViolateAtLines` for rules); the oracle that checks the trait is `test:` (or the line-set comparison for rules); `run:` executes the event for `AssertionCase`s. Tests written to this frame survive refactors and read like a specification of the module under test. GitHub Actions workflow tests follow a relaxed variant — see [Writing Workflow Tests](#writing-workflow-tests).

### Recipe for Writing a RuleTestCase

For each behavior the rule must enforce, work one case at a time:

1. Write the `when:` statement first — a plain-language situation in which the rule should (or should not) flag. Phrase it so that reading the suite alone reconstructs the rule's purpose.
2. Set `shouldViolateAtLines` to the line numbers the rule must report to `onError` for that situation, or `[]` for a non-violation.
3. Write the smallest `markdown:` body that produces exactly that surface. One situation per case — never bundle a violation and a non-violation in the same body.
4. Run `npm test C708-XXX`. Break the rule logic or the markdown once on purpose and confirm the failure points at the right line.
5. Implement just enough rule logic to pass that case. Then write the next case.

Do not scaffold the full suite before implementing — tests written in bulk verify imagined behavior, not actual behavior (see [vertical slicing](#core-testing-principles)).

Skeleton:

```javascript
// @ts-check
'use strict';

const rule = 'C708-003';

/** @type RuleTestSuite */
const testCases = [
  {
    when: 'consecutive headings skip a level',
    shouldViolateAtLines: [3],
    markdown: `
# Title
### Skipped from h1 to h3
`,
  },
  {
    when: 'consecutive headings descend by one level at a time',
    shouldViolateAtLines: [],
    markdown: `
# Title
## Section
### Subsection
`,
  },
];

module.exports = { rule, testCases };
```

### Recipe for Writing an AssertionCase

Use this recipe for repository-level tests where the surface is a return value, a file, or an externally visible effect — not a rule's `onError` line set.

1. Write the `should: … when: …` requirement first.
2. Decide on [the observable surface](#choosing-what-to-assert) to assert the requirement and
   1. either derive the smallest
      1. `run:` from the `when:` that produces that result and
      1. `test:` from the `should:` that tests an atomic fact,
   2. or share the `run:` result or `test:` logic between adjacent assertions with the overlapping statements.
3. Run the suite in isolation with `npm test <suite>` — the suite name is the test file's basename without `.test.js` (e.g. `npm test consumer-docs`, `npm test npm-package`, `npm test C708-003`). Run `npm test` for the whole project. Intentionally break the predicate once to confirm the failure message points at the right thing.

### Core Testing Principles

1. **State a trait, not a mechanism.** A `when:`/`should:` pair (or a `when:`/`shouldViolateAtLines` pair) states a falsifiable trait of the module in domain language — _what_ it delivers. The `test:` predicate (or the line-set comparison) is the atomic check of the trait. Never describe the oracle in the `should:` statement.
2. **Assert through public output only.** Verify what the module exposes to callers: the return value, the lines a rule reports to `onError`, the externally visible effect. Never bypass the interface (no inspecting the parsed token stream, no reading private state, no querying a backing store directly). Refactorings that preserve behavior must not break assertions — otherwise the assertions test the wrong thing.
3. **Write the suite spec first; derive logic from it.** The set of `when:`/`should:` (or `when:`/`shouldViolateAtLines`) pairs should read like the module's complete behavioral contract. Phrase them crisply in plain language before writing `run:`/`test:` or implementing the rule. The `run:` logic derives from the `when:`; the `test:` logic from the `should:`.
4. **Cover behavior, not code.** Reading the suite should allow to reconstruct what the module does. Each case describes a unique behavioral fact. A behavior with no case is a gap; a case with no unique behavior is noise.
5. **Assert one fact at a time.** A `test:` predicate (or one `RuleTestCase`) verifies exactly one atomic fact. When a case fails, its `when:`/`should:` must point at the single thing that is wrong. Never collapse distinct facts into a single assertion just because they share setup.
6. **Group by shared setup, not by both.** When adjacent cases share either `run:` logic or `test:` logic — never both — hoist it into a `const` above them. Execute `run:` logic once for efficiency while keeping assertions isolated. Hoist the corresponding `when:` or `should:` phrase into a `const` too, so the shared statement stays consistent across the group.
7. **One case, one implementation, repeat.** Write one case, make it pass, then write the next. Do not scaffold the full spec before any implementation exists — tests written in bulk verify imagined behavior and become insensitive to real changes.

### Choosing What to Assert

Treat the module under test as a black box with three observable surfaces. Assertions live on these surfaces and nowhere else:

- **Output**: The return value of a function under test, or — for rules — the set of line numbers the rule reports to `onError` (`shouldViolateAtLines`).
- **Input or shared state**: The values or structure of input objects, the file system, or a fake adapter _after_ the invocation of the function or module under test. Not the sequence of calls used to reach that state.
- **Externally visible effects**: Exit codes, contract-defined output, network calls a fake records. Assert on presence, not order, unless order is part of the contract.

For rule tests the surface is almost always the line-number set. The `onError` `detail`, `context`, and `range` fields are part of the rule's contract only when the rule documents them — otherwise asserting on them couples the test to phrasing.

Internal call patterns, helper-function names, intermediate variables, log formats, and usually the order of state mutations are **implementation details**. They belong nowhere in `test:` or `shouldViolateAtLines`.

### Testing Anti-Patterns

Patterns covered: **exact sequences**, **bundled checks in one `test:`**, **repeated expensive setup**, **N assertions hiding one fact**, **technical `should:`/`when:`**, **inconsistent statement styles**, **use cases sneaked into behavior**, **bundled positive and negative in one `RuleTestCase`**, **bypassing public output**, **mocking internal collaborators**.

- **Don't assert exact sequences**
  - _Instead of_ testing the order – `effects === ['clean', 'write-package:1.3.0', 'write-changelog', 'commit:1.3.0']`
  - _Do_ assert the final state in atomic asserts — `state.packageJson.version === '1.3.0'`, `state.changelogPrepended === true`, a commit was produced.

- **Don't bundle multiple checks into one `test:`**
  - _Instead of_ one predicate testing multiple facts

    ```javascript
    test: (b) =>
      b.length === 4 &&
      b[0] === true &&
      b[1] === true &&
      b[2] === true &&
      b[3] === false;
    ```

  - _Do_ four assertions, each with its own `should:` ("recognize a `!` bang header as breaking", "recognize a `BREAKING-CHANGE:` footer as breaking", and so on), sharing one `const commits = …` hoisted above.

- **Don't repeat expensive setup across assertions**
  - _Instead of_ three assertions each calling `unitUnderTest.getResult(input)` fresh just to read a different facet of the same call.
  - _Do_ hoist a single `const getResult = () => unitUnderTest.getResult(input)` once, then assign `getResult` to the `run:`s of the grouped assertion cases.

- **Don't hide one fact behind N assertions**
  - _Instead of_ loops creating N assertions:

    ```javascript
    forEach(input => assert({ should: `accept ${input} as reusable input`, ... }))
    ```

  - _Do_ one assertion with `should: 'declare every documented reusable input'`  
    and `test: (inputs) => ['inputA', 'inputB', 'InputC'].every(inputs.includes)`
  - The set is the fact; the items are not.

- **Don't write technical `should:` or `when:` statements**
  - _Instead of_ stating invocation details:  
    `{ should: 'use preview mode', when: 'running the script with --preview' }`  
    `{ should: 'use prepare mode', when: 'running the script with --prepage' }`
  - _Do_ state behavior and use case:  
    `{ should: 'show the planned version', when: 'previewing a pull request' }`  
    `{ should: 'show the planned release notes', when: 'previewing a pull request' }`

- **Don't write similar statements in entirely different styles**
  - _Instead of_ chaotic statement writing:
    `{ should: 'print version', when: 'running the script with --preview' }`  
    `{ should: 'echo the planned release notes', when: 'previewing a pull request' }`  
    `{ should: 'show non-release explicitly', when: 'pull request is previewed' }`
  - _Do_ use patterns for semantically similar statements:  
    `{ should: 'show the planned version', when: 'previewing a pull request for a release' }`  
    `{ should: 'show the planned release notes', when: 'previewing a pull request for a release' }`  
    `{ should: 'show that no release is planned', when: 'previewing a pull request for a non-release' }`
  - Readability of the spec wins over DRY, even at the cost of a little duplication.

- **Don't sneak use cases into behavior statements**
  - _Instead of_ describing the surface or a condition of it:  
     `{ should: 'show the planned version for a release', when: 'previewing a pull request' }`  
     `{ should: 'plan a release even when logic didn\'t change', when: 'releasing breaking changes' }`
  - _Do_ write atomic behavior statements:  
    `{ should: 'show the planned version', when: 'previewing a pull request for a release' }`  
    `{ should: 'plan a release', when: 'releasing breaking changes with unchanged business logic' }`

- **Don't bundle positive and negative facets in one `RuleTestCase`**
  - _Instead of_ one `markdown:` body mixing a violation and a non-violation to check both at once:

    ```javascript
    {
      when: 'mixed heading levels', shouldViolateAtLines: [3], markdown: `
    # OK
    ## Also OK
    #### Skipped`
    }
    ```

  - _Do_ split into two cases — one with `shouldViolateAtLines: [3]` for the violation, one with `shouldViolateAtLines: []` for the descending counter-example. When the rule changes, the failure points at the single broken fact.

- **Don't bypass the module's public output**
  - _Instead of_ inspecting the parsed token stream, the rule's internal state, or any structure the rule does not expose to callers.
  - _Do_ assert only on what the rule reports to `onError` — `shouldViolateAtLines` for `RuleTestCase`s, return value or fake-recorded effect for `AssertionCase`s. If a behavior is invisible at the public surface, the contract is missing, not the test.

- **Don't mock internal collaborators**
  - _Instead of_ replacing a helper inside the module under test to verify it was called.
  - _Do_ use fakes only at the module boundary (CLI args, file system, network). If you want to mock an internal function, you are testing implementation, not behavior.

## Writing Workflow Tests

A GitHub Actions workflow is a black box with:

- **Conditions**: Triggers and combinations of inputs and computed values, expressed as `if:` predicates and `needs:` declarations.
- **Behaviours**: Jobs and steps run for different conditions.
- **Observable effects**: Publishes to npm, creates a git tag or a GitHub release, sets a status check.

Since GitHub Actions workflows are technical infrastructure for the development cycle, their test requirements (see [Core Testing Principles](#core-testing-principles)) _may_ be written in technical language. While `when:` statements describe _conditions_, a `should:` statement describes only an _observable effect_ — the YAML that implements it is incidental.

### Workflow Testing Anti-Patterns

- **Don't write test suites for reusable workflows.**
- **Don't assert that a step uses a specific shell command.**
- **Don't assert the order of jobs or steps.**
- **Don't test secret values or token wiring beyond declaration.**
- **Don't test runtime effects via static analysis.**

## Writing commit messages

Commit messages follow a variation of the **Conventional Commits** [specification](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

Use the following custom types:

- **behav**: A change in the application behavior
- **behavfix**: A bug fix that affects the application behavior
- **chore**: A configuration, dependency update, or maintenance task that doesn't affect application behavior
- **docs**: A documentation change
- **style**: A code style change, not affecting behavior (formatting, semicolons, reordering statements, etc.)
- **refac**: A code refactoring, not affecting behavior (e.g. renaming variables, extracting functions, changing patterns, etc.)
- **test**: A change affecting dedicated system or integration tests
- **perf**: An improvement in application performance, not affecting behavior (e.g. optimizing algorithms, reducing memory usage, etc.)
- **perffix**: A performance fix, not affecting behavior
- **cicd**: A configuration change of CI/CD pipelines

### Scopes

Guidelines for scopes:

- Keep scopes consistent with the repository structure
- Maintain a whitelist of allowed scopes in and enforce it via commit linting
- Add as new domains or modules are introduced
- Always use a scope for `behav` and `behavfix` commits
- A scoped commit must only contain changes (files or lines) that belong to the specified scope

### Breaking changes

Guidelines for breaking changes:

- **Always indicate with `!`** — Always add an exclamation mark after the type/scope for breaking changes

### Description

Guidelines for the description:

- **Uppercase allowed** — Always start with a capital letter and use uppercase where it serves clarity (e.g. acronyms, proper nouns, etc.)
- **Imperative mood** — Use "Add support for..." not "Added..." or "Adds..."
- **Be concise** — The total length of type, scope, and description must not exceed 80 characters
- **Avoid redundancy** — Don't use words redundant to the type or scope (e.g. "Fix" in a `*fix` commit, etc.)

### Body

Guidelines for the body:

- **Explain why, not what** — The diff shows what changed; explain the reasoning, context, or problem being solved
- **Wrap at 80 characters** — Wrap lines so they don't exceed 80 characters, but don't cut words, unless it's longer than 80 characters itself
- **Be concise** — A few sentences typically suffice; use bullet points only for multiple related changes
- **Imperative mood** — Use "Add support for..." not "Added..." or "Adds..."
- **One concern per paragraph** — Group related points; separate unrelated ones with blank lines

### Footers

Guidelines for footers:

- **Explain breaking changes** — Add a `BREAKING-CHANGE:` section explaining why the change is necessary and how to adapt
- **Reference experiment or solution** — If the issue belongs to an experiment or solution, add an `Experiment: <id>` or `Solution: <id>` footer, derived from the GitHub issue
- **Reference issues/tickets** — Always reference GitHub issues with the token `Issue #`
- **Track commit dependencies** — Add `Based-on:` footers referencing commits that this commit directly depends on (one per line). A commit depends on another if it changes the same lines of code or invokes logic changed by that commit. Only list first-level dependencies — do not trace transitive dependencies in depth or breadth. Code-level dependencies (same lines) are identified automatically via `git blame`; logic-level dependencies (invoked changed logic) are added manually by the developer. `Based-on:` footers must appear at the very bottom of the commit message, after all other footers.

Footer order (each optional except `Issue #`):

1. `BREAKING-CHANGE:` (if applicable)
2. `Experiment: <id>` or `Solution: <id>` (if applicable, mutually exclusive)
3. `Issue #` (always present)
4. `Based-on:` (if applicable, always last)

### Examples

```text
behav(theming): Add a color palette chooser to the toolbar

Add a button in the header to toggle between light and dark themes.
The preference is persisted to localStorage.

Experiment: dark-mode
Issue #123
Based-on: abc1234
Based-on: def5678
```

```text
behavfix(billing)!: Correctly calculate tax for international orders

International regulations have changed, and the previous tax calculation logic
was no longer compliant. This update ensures that tax is calculated correctly
for all orders, regardless of the customer's location.

BREAKING-CHANGE: The tax calculation logic has been updated to comply with
international regulations. Clients must update their tax calculation logic to
accommodate the new rules.

Solution: tax-compliance
Issue #456
```

```text
chore: Update astro dependencies to latest version

Issue #789
```

## Creating a Pull Request

Pull requests are potential releases and should be created using the provided npm scripts as described in [PR Workflow](#pr-workflow).

> The mechanism reads the branch's commits to decide whether the pull request needs a release. Bump-worthy commits derive the next semantic version from conventional commit messages, update `package.json`, prepend release notes to `CHANGELOG.md`, commit those generated changes, push the current branch, and create a release pull request to `main`. Hidden non-breaking commits create a non-release pull request without changing `package.json` or `CHANGELOG.md`.

### Commit type → bump mapping

| Type                                      | Section in `CHANGELOG.md` | Bump  |
| ----------------------------------------- | ------------------------- | ----- |
| `!` or `BREAKING-CHANGE: <description>`   | (unchanged)               | major |
| `behav`                                   | New Behaviors             | minor |
| `behavfix`                                | Bug Fixes                 | patch |
| `perf`,`perffix`                          | Performance Improvements  | patch |
| `docs`                                    | Documentation             | patch |
| `chore`, `refac`, `style`, `test`, `cicd` | hidden                    | none  |
| range with no bump-worthy commits         | hidden                    | none  |

### PR Workflow

Run `npm run pr:dry` to verify whether the branch requires a release and, when it does, whether the version and release notes are as intended. Run `npm run pr:create` to create a first-time pull request in the GitHub repository. Run `npm run pr:update` only for a branch that already has an open pull request.

1. Work from the issue/feature branch that should become the pull request.
2. Preview the next bump and changelog entry:

   ```bash
   npm run pr:dry
   ```

3. Create the pull request:

   ```bash
   npm run pr:create
   ```

   This runs the same test + lint + format gate as `pr:dry`. For release-worthy commits, it bumps `package.json`, prepends to `CHANGELOG.md`, creates `chore(release): X.Y.Z`, pushes the current branch, and opens a release pull request to `main`. For hidden non-breaking commits, it checks the working tree is clean, skips package/changelog writes, pushes the current branch, and opens an explicit non-release pull request.

4. After rebasing or adding commits to an existing pull request branch, update the generated release commit:

   ```bash
   npm run pr:update
   ```

   This requires the branch to be rebased on top of `main` and to already have a pull request. It removes the branch-local `chore(release): X.Y.Z` commit when one exists, prepares a fresh release commit from the updated branch history, and force-pushes the branch with lease. If the updated branch contains only hidden non-breaking commits, it removes the old release commit, creates no replacement release commit, and still force-pushes the branch with lease.

> To prepare the release commit locally (without pushing or opening a pull request):
>
> ```bash
> npm run pr:prepare
> ```

The release script intentionally does not support forced releases or prerelease versions yet.

## Questions?

Open an [issue on GitHub](https://github.com/code708/markdown-readability/issues) or check the [markdownlint documentation](https://github.com/DavidAnson/markdownlint).
