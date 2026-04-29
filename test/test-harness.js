// @ts-check

'use strict';

const markdownlint = require('markdownlint');
const customRules = require('../index');
const { testPackageSurface } = require('./package-test');
const { testConsumerDocsConsistency } = require('./consumer-docs-test');

let testsPassed = 0;
let testsFailed = 0;

/** @type {import('markdownlint').Configuration & Record<string, import('markdownlint').RuleConfiguration>} */
const testConfig = {
	default: false,
};

/**
 * Test runner for C708 rules.
 *
 * @param {string} description - Human-readable test description
 * @param {string} markdown - Markdown string to lint
 * @param {Array<{ruleName: string, lineNumber: number}>} expectedErrors
 *   Array of expected error descriptors. Pass [] for no errors expected.
 */

function testRule(description, markdown, expectedErrors) {
	const options = {
		strings: {
			testContent: markdown,
		},
		customRules,
		config: testConfig,
	};

	const result = markdownlint.sync(options);
	const errors = result.testContent || [];

	let passed = true;
	const messages = [];

	// Check count
	if (errors.length !== expectedErrors.length) {
		passed = false;
		messages.push(
			`\n    Expected ${expectedErrors.length} error(s), got ${errors.length}`,
		);
		errors.forEach((err) => {
			messages.push(
				`\n    - Line ${err.lineNumber}: ${err.ruleDescription} (${err.ruleNames.join(', ')})`,
			);
		});
	} else {
		// Check each expected error's ruleName and lineNumber
		expectedErrors.forEach((expected, idx) => {
			const actual = errors[idx];
			if (!actual) {
				passed = false;
				messages.push(
					`\n    Missing error at index ${idx}: expected rule=${expected.ruleName} line=${expected.lineNumber}`,
				);
				return;
			}
			if (!actual.ruleNames.includes(expected.ruleName)) {
				passed = false;
				messages.push(
					`\n    Error ${idx}: expected rule '${expected.ruleName}', got [${actual.ruleNames.join(', ')}]`,
				);
			}
			if (actual.lineNumber !== expected.lineNumber) {
				passed = false;
				messages.push(
					`\n    Error ${idx}: expected lineNumber ${expected.lineNumber}, got ${actual.lineNumber}`,
				);
			}
		});
	}

	if (passed) {
		console.log(`✓ PASS: ${description}`);
		testsPassed++;
	} else {
		console.log(`✗ FAIL: ${description}`);
		messages.forEach((m) => console.log(m));
		testsFailed++;
	}
}

console.log('Running tests...\n\n');

// ---------------------------------------------------------------------------
// Rules: each rule should behave as intended
// ---------------------------------------------------------------------------

console.log('Testing markdownlint rules: Nothing to test yet.');

console.log('\n' + '-'.repeat(60) + '\n');

// ---------------------------------------------------------------------------
// Packaging: published tarball should only include intentional files
// ---------------------------------------------------------------------------

console.log('Testing package publish surface:');

testPackageSurface() ? testsPassed++ : testsFailed++;

console.log('\n' + '-'.repeat(60) + '\n');

// ---------------------------------------------------------------------------
// Consumer docs and examples should be internally consistent
// ---------------------------------------------------------------------------

console.log('Testing consumer docs consistency:');

testConsumerDocsConsistency() ? testsPassed++ : testsFailed++;

console.log('\n' + '-'.repeat(60) + '\n');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(60));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log('='.repeat(60));

if (testsFailed > 0) {
	process.exit(1);
}
