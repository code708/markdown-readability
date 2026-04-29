# Contributing to @code708/markdown-readability

Thank you for your interest in contributing. This guide describes how to add a new rule.

&nbsp;

## Quick Start

1. **Clone and install dependencies:**

   ```bash
   git clone https://github.com/code708/markdown-readability.git
   cd markdown-readability
   npm install
   ```

2. **Run release checks:**

   ```bash
   npm run release:verify
   ```

3. **Try the demo:**

   ```bash
   node demo.js
   ```

&nbsp;

## Development

### Naming Conventions

**Rule name**: Use `C708-𝑖` (with 𝑖 ∈ [001,…,999])

### Project Structure

```text
markdown-readability/
├── src/                          # Custom rule implementations
│   ├── C708-001.js
│   ├── C708-002.js
│   └── C708-XXX.js
├── test/                         # Test files
│   └── test.js
├── example/                     # Example markdown files
│   ├── correct.md
│   └── violates.md
├── index.js                      # Main entry point
└── package.json
```

### Running Tests

```bash
npm test
```

### Adding a New Rule

#### Step 1: Create Rule File

Create a new file in `src/` named after the rule, for example `src/C708-003.js`:

```javascript
// @ts-check
"use strict";

module.exports = {
  names: ["C708-003"],

  description: "Concise conceptional rationale of 1) what problem the rule solves and 2) how it solves the problem.",

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
      // Check your condition
      if (/* violation detected */) {
        onError({
          lineNumber: token.lineNumber,
          detail: "Explanation of the issue",
          context: token.content,
          range: [1, token.content.length],
          fixInfo: { // Optional: for auto-fix
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

&nbsp;

#### Step 2: Export the Rule

Add your rule to `index.js` so it is exported with the other rules:

```javascript
const C708001 = require("./src/C708-001");
const C708002 = require("./src/C708-002");
const C708003 = require("./src/C708-003");

module.exports = [
  C708001,
  C708002,
  C708003,
];
```

&nbsp;

#### Step 3: Add Tests

Add test cases in `test/test.js`:

```javascript

console.log("\n------------------------------------------------------------\n");
console.log("Testing C708-003 rule");
console.log("------------------------------------------------------------\n");

test("Valid markdown (should pass)", "# Valid Content\n", 0);

test("Invalid markdown (should fail)", "# Invalid Content\n", 1);
```

Update the _config_ in the test function:

```javascript
config: {
  default: false,
  "C708-001": true,
  "C708-002": true,
  "C708-003": true,
}
```

&nbsp;

#### Step 4: Update Documentation

Add your rule documentation under `doc/` as `doc/C708-003.md` and, if relevant, mention it in `README.md`:

```markdown
#### C708-003

Description of what problem your rule does and how.

❌ Bad:
\`\`\`markdown

# Example of violation

\`\`\`

✅ Good:
\`\`\`markdown

# Example of correct usage

\`\`\`
```

&nbsp;

#### Step 5: Validate Your Changes

```bash
npm run release:verify
```

&nbsp;

## Understanding Markdown Tokens

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

&nbsp;

## Rule Naming Convention

- Use `C708-XXX` format for the primary rule name.
- Keep the source file name aligned with the rule name, for example `src/C708-003.js`.
- Increment the rule name's id sequentially.
- Export new rules from `index.js` so they are available to consumers.

&nbsp;

## Best Practices

1. **Keep rules focused**: Each rule should check one specific thing
2. **Provide clear error messages**: Help users understand what's wrong
3. **Add fixInfo when possible**: Enable automatic fixes
4. **Write comprehensive tests**: Cover edge cases
5. **Document leanly**: Explain conceptional rationale and provide examples
6. **Consider performance**: Avoid expensive operations in loops

&nbsp;

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

&nbsp;

## Questions?

Open an [issue on GitHub](https://github.com/code708/markdown-readability/issues) or check the [markdownlint documentation](https://github.com/DavidAnson/markdownlint).
