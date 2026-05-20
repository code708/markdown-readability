#!/usr/bin/env node
// Demo script showing the package wiring during the zero-rule scaffold stage

const markdownlint = require('markdownlint');
const c708Rules = require('../index');
const path = require('path');

function runDemo({
	argv = process.argv.slice(2),
	markdownlintImpl = markdownlint,
	customRules = c708Rules,
	log = console.log,
} = {}) {
	const options = {
		files: [
			path.join(
				__dirname,
				argv.includes('--no-violation')
					? 'respects-all-rules.md'
					: 'violates-all-rules.md',
			),
		],
		customRules,
		config: {
			default: false,
		},
	};

	const demoFile = path.relative(path.dirname(__dirname), options.files[0]);

	log('Demonstrating the @code708/markdown-readability rules...\n');
	log(`Package currently exports ${customRules.length} custom rules:`);
	log(`[${customRules.map((rule) => rule.names[0]).join(', ')}]\n`);

	const result = markdownlintImpl.sync(options);
	const resultString = result.toString();

	if (resultString) {
		log(`Issues found in ${demoFile}:\n`);
		log(resultString);
		log('\nRun with --no-violation to lint the correctness example.');
	} else {
		log(`No markdown lint violations in ${demoFile}`);
	}
}

if (require.main === module) {
	runDemo();
}

module.exports = { runDemo };
