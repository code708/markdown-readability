// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');
const { assert } = require('./test-framework');
const { runDemo } = require('../example/demo');
const pkg = require('../package.json');

function testConsumerDocsConsistency() {
	const readmePath = path.join(__dirname, '..', 'README.md');
	const readme = fs.readFileSync(readmePath, 'utf8');
	const repoRoot = path.join(__dirname, '..');

	const visitor_reads_project_description = 'visitor reads project description';

	const rulesOverviewLinkRegex = /\]\(doc\/rules-overview\.md\)/;
	const violatesExampleLinkRegex = /\]\(example\/violates-all-rules\.md\)/;
	const respectsExampleLinkRegex = /\]\(example\/respects-all-rules\.md\)/;
	const escapedPkgName = pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const cliUsageRegex = new RegExp('--rules\\s+' + escapedPkgName);
	const leanPolicySnippet =
		'The published npm package only includes runtime files';

	assert({
		should: 'link to the rules overview',
		when: visitor_reads_project_description,
		run: () => rulesOverviewLinkRegex.test(readme),
		test: (matched) => matched === true,
		failWith: (matched) => [
			['Expected README to match', [rulesOverviewLinkRegex.toString()]],
			['Actual match result:', [String(matched)]],
		],
	});

	assert({
		should: 'show install/usage with the package name',
		when: visitor_reads_project_description,
		run: () => cliUsageRegex.test(readme),
		test: (matched) => matched === true,
		failWith: (matched) => [
			['Expected README to match', [cliUsageRegex.toString()]],
			['Actual match result:', [String(matched)]],
		],
	});

	assert({
		should: 'state the lean-runtime package policy',
		when: visitor_reads_project_description,
		run: () => readme.includes(leanPolicySnippet),
		test: (included) => included === true,
		failWith: (included) => [
			['Expected README to include snippet:', [leanPolicySnippet]],
			['Actual includes result:', [String(included)]],
		],
	});

	assert({
		should: 'link to the all-violating example',
		when: visitor_reads_project_description,
		run: () => violatesExampleLinkRegex.test(readme),
		test: (matched) => matched === true,
		failWith: (matched) => [
			['Expected README to match', [violatesExampleLinkRegex.toString()]],
			['Actual match result:', [String(matched)]],
		],
	});

	assert({
		should: 'link to the all-respecting example',
		when: visitor_reads_project_description,
		run: () => respectsExampleLinkRegex.test(readme),
		test: (matched) => matched === true,
		failWith: (matched) => [
			['Expected README to match', [respectsExampleLinkRegex.toString()]],
			['Actual match result:', [String(matched)]],
		],
	});

	const consumer_reads_documentation = 'consumer reads documentation';

	assert({
		should: 'ship a rules overview document',
		when: consumer_reads_documentation,
		run: () => fs.existsSync(path.join(repoRoot, 'doc', 'rules-overview.md')),
		test: (exists) => exists === true,
		failWith: (exists) => [
			['Expected file at doc/rules-overview.md. Exists:', [String(exists)]],
		],
	});

	assert({
		should: 'ship an all-violating example',
		when: consumer_reads_documentation,
		run: () =>
			fs.existsSync(path.join(repoRoot, 'example', 'violates-all-rules.md')),
		test: (exists) => exists === true,
		failWith: (exists) => [
			[
				'Expected file at example/violates-all-rules.md. Exists:',
				[String(exists)],
			],
		],
	});

	assert({
		should: 'ship an all-respecting example',
		when: consumer_reads_documentation,
		run: () =>
			fs.existsSync(path.join(repoRoot, 'example', 'respects-all-rules.md')),
		test: (exists) => exists === true,
		failWith: (exists) => [
			[
				'Expected file at example/respects-all-rules.md. Exists:',
				[String(exists)],
			],
		],
	});

	const consumer_requires_the_package = 'consumer requires the package';

	assert({
		should: 'export an array of markdownlint rule objects',
		when: consumer_requires_the_package,
		run: () => require('../index'),
		test: (rules) =>
			Array.isArray(rules) &&
			rules.every(
				(r) => Array.isArray(r?.names) && typeof r?.function === 'function',
			),
		failWith: (rules) => [
			['Unexpected export shape:', [JSON.stringify(rules)]],
		],
	});

	/** @param {...string} argv */
	function runDemoCapturingLog(...argv) {
		/** @type string[] */
		const buf = [];
		runDemo({ argv, log: (...args) => buf.push(args.join(' ')) });
		return buf.join('\n');
	}

	assert({
		should: 'demo the all-violating example',
		when: 'running the demo',
		run: () => runDemoCapturingLog(),
		test: (output) => output.includes('example/violates-all-rules.md'),
		failWith: (output) => [
			[
				'Expected demo log to mention example/violates-all-rules.md. Actual log:',
				[output],
			],
		],
	});

	assert({
		should: 'demo the all-respecting example',
		when: 'running the demo with --no-violation',
		run: () => runDemoCapturingLog('--no-violation'),
		test: (output) => output.includes('example/respects-all-rules.md'),
		failWith: (output) => [
			[
				'Expected demo log to mention example/respects-all-rules.md. Actual log:',
				[output],
			],
		],
	});
}

module.exports = { run: () => testConsumerDocsConsistency() };
