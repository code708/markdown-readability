// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');
const {
	prepareRuleTests,
	test,
	getPassedNumber,
	getFailedNumber,
	print,
} = require('./test-framework');

(function runTests() {
	print.separator.thickPlus();
	console.log('Running tests...');
	print.separator.thickExtra();

	runSingleTest() || runAllTests();
	summarizeResults();

	return;

	function runSingleTest() {
		return process.argv[2] !== undefined
			? runTestSuite(process.argv[2])
			: false;

		/** @param {string} name */
		function runTestSuite(name) {
			const testSuite = getTestSuite();

			if (testSuite.rule) {
				test(
					testSuite.rule,
					testSuite.testCases,
					prepareRuleTests().lintOptionsBase,
				);
			} else {
				test(`: ${name}`, testSuite);
			}

			return true;

			function getTestSuite() {
				const testSuitePath = path.join(__dirname, name + '.test.js');

				if (!fs.existsSync(testSuitePath)) {
					throw new Error(
						`ERROR: no test suite found for '${name}':  File '${name}.test.js' does not exist.`,
					);
				}

				return require(testSuitePath);
			}
		}
	}

	function runAllTests() {
		testNonRuleProjectAspects();
		testRules();

		return;

		function testNonRuleProjectAspects() {
			[
				{ name: 'npm-package', headline: 'the npm packaging' },
				{ name: 'consumer-docs', headline: 'the consumer docs consistency' },
			].forEach((s) =>
				test(s.headline, require(path.join(__dirname, s.name + '.test'))),
			);
		}

		function testRules() {
			print.any('Testing markdownlint rules');
			const { ruleNames, lintOptionsBase } = prepareRuleTests();
			ruleNames
				.map((ruleName) => require(path.join(__dirname, ruleName + '.test.js')))
				.forEach(({ rule, testCases }) =>
					test(rule, testCases, lintOptionsBase),
				);
		}
	}

	function summarizeResults() {
		print.separator.thin();
		print.any(`Tests passed: ${getPassedNumber()}`);
		print.any(`Tests failed: ${getFailedNumber()}`);
		print.separator.thin();

		if (getFailedNumber() > 0) {
			process.exit(1);
		}
	}
})();
