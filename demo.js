#!/usr/bin/env node

/**
 * Demo script showing how to use the C708 markdownlint rules
 */

const markdownlint = require('markdownlint');
const customRules = require('./index');
const path = require('path');

const exampleFile = path.join(__dirname, 'example', 'violates.md');

console.log('Running markdownlint with C708 rules...\n');
console.log(`Checking: ${exampleFile}\n`);

const options = {
	files: [exampleFile],
	customRules: customRules,
	config: {
		default: false,
		// list C708 rules here
	},
};

const result = markdownlint.sync(options);
const resultString = result.toString();

if (resultString) {
	console.log('Issues found:\n');
	console.log(resultString);
	console.log('\nTo see correct example, check: example/correct.md');
} else {
	console.log('✓ No issues found!');
}
