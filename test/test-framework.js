// @ts-check
'use strict';

const fs = require('fs');
const markdownlint = require('markdownlint');

const PASS = '✅';
const FAIL = '❌';
const getPassedNumber = () => testsPassed;
const getFailedNumber = () => testsFailed;

let testsPassed = 0,
	testsFailed = 0;

/** @param {...any} any */
const stdOut = (...any) => console.log(...any);
stdOut.thickChar = '=';
stdOut.thinChar = '-';
stdOut.width = 60;

const print = {
	separator: {
		blankLine: () => stdOut('\n'),
		thick: () => stdOut(stdOut.thickChar.repeat(stdOut.width)),
		thickExtra: () =>
			stdOut('\n' + stdOut.thickChar.repeat(stdOut.width) + '\n'),
		thickPlus: () => stdOut(stdOut.thickChar.repeat(stdOut.width) + '\n'),
		thin: () => stdOut(stdOut.thinChar.repeat(stdOut.width)),
		thinExtra: () => stdOut('\n' + stdOut.thinChar.repeat(stdOut.width) + '\n'),
		thinPlus: () => stdOut(stdOut.thinChar.repeat(stdOut.width) + '\n'),
	},
	any: stdOut,
	/** @template T @param {AssertionCase<T>} assertionCase @param {Result} result */
	result: (assertionCase, result) => {
		const should = ' Should ' + assertionCase.should + ',\n',
			when = ' ' + '─'.repeat(result.length) + ' when ' + assertionCase.when;
		stdOut('\n' + result + should + when);
	},
	/** @param {AssertionError} error */
	error: (error) => stdOut(`${' '.repeat(error.level)}└─ ${error.message}`),
};

/**
 * Collects the rule names under test and constructs common markdownlint options.
 */
function prepareRuleTests() {
	try {
		const ruleNames = fs
			.readdirSync(__dirname)
			.filter((file) => /^C708-\d{3}\.test\.js$/.test(file))
			.map((file) => file.replace(/\.test\.js$/, ''));

		/** @type {import('markdownlint').Options} */
		const lintOptionsBase = {
			customRules: require('../index'),
			config: {
				default: true,
				...Object.fromEntries(ruleNames.map((rule) => [rule, true])),
			},
		};

		return { ruleNames, lintOptionsBase };
	} catch (error) {
		stdOut(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

/**
 * @template T
 * @param {AssertionCase<T>} testCase
 */
function assert(testCase) {
	return verify(testCase).countResult().printResult().printErrors().getActual();

	/** @template T @param {AssertionCase<T>} testCase */
	function verify(testCase) {
		const actual = testCase.run();
		const result = testCase.test(actual) ? PASS : FAIL;

		const assertionResult = {
			countResult,
			printResult,
			printErrors,
			getActual: () => actual,
		};

		return assertionResult;

		function countResult() {
			if (result === PASS) testsPassed++;
			else testsFailed++;
			return assertionResult;
		}
		function printResult() {
			print.result(testCase, result);
			return assertionResult;
		}
		function printErrors() {
			result === FAIL &&
				testCase
					.failWith(actual)
					.flatMap((stack) => asErrors(stack, 0))
					.map(print.error);
			return assertionResult;

			/** @param {MessageStack} fromMessageStack @param {number} baseLevel @returns {AssertionError[]} */
			function asErrors(fromMessageStack, baseLevel) {
				return fromMessageStack.flatMap((messageOrStack) =>
					typeof messageOrStack === 'string'
						? { message: messageOrStack, level: baseLevel }
						: asErrors(messageOrStack, baseLevel + 1),
				);
			}
		}
	}
}

/**
 * Runs all test cases (integration tests) of a C708 rule.
 * @overload
 * @param {string} rule – The rule's name
 * @param {RuleTestSuite} testSuite
 * @param {import('markdownlint').Options} lintOptions - Enables rules and points to their implementation. Contains all rules so their integration is tested as well.
 * @returns {void}
 */

/**
 * Runs a suite of assertions of something else
 * @overload
 * @param {string} headline – A concise statement of what's tested
 * @param {TestSuite} testSuite - contains the assertions that print the {@link Result}
 * @returns {void}
 */

/**
 * @param {string} title
 * @param {RuleTestSuite | TestSuite} suite
 * @param {import('markdownlint').Options} [options]
 * @returns {void}
 */
function test(title, suite, options) {
	if (Array.isArray(suite)) {
		if (!options) {
			throw new Error('parameter `lintOptions` is required for rule tests');
		}
		testRule(title, suite, options);
		return;
	}

	testSomethingElse(title, suite);

	/**
	 * @param {string} ruleUnderTest - of the rule under test
	 * @param {RuleTestSuite} testCases
	 * @param {import('markdownlint').Options} lintOptions
	 */
	function testRule(ruleUnderTest, testCases, lintOptions) {
		print.any(`Rule: ${ruleUnderTest}`);
		print.separator.thin();

		testCases.forEach(assertTestCase);

		print.separator.thickExtra();

		return;

		function assertTestCase(/** @type RuleTestCase */ testCase) {
			assert({
				should:
					testCase.shouldViolateAtLines.length === 0
						? 'not violate any rules at all'
						: testCase.shouldViolateAtLines.length === 1
							? `violate ${ruleUnderTest} at line ${testCase.shouldViolateAtLines.join(', ')}`
							: `violate ${ruleUnderTest} at lines ${testCase.shouldViolateAtLines.join(', ')}`,
				when: testCase.when,
				run: getViolationDeviation,
				test: ({ missing, unexpected }) =>
					missing.length === 0 && unexpected.length === 0,
				failWith: ({ missing, unexpected }) => [
					prependNonEmpty(
						missing.map(toString),
						`Missing violation(s) for ${ruleUnderTest} at line(s)`,
					),
					prependNonEmpty(
						unexpected.map(
							(unexpected) =>
								`rule ${unexpected.rule} at line ${unexpected.atLine}`,
						),
						'Unexpected violation(s):',
					),
				],
			});

			return;

			/** @returns {{ missing: number[], unexpected: { rule: string, atLine: number }[] }} */
			function getViolationDeviation() {
				const actualViolations = getActualViolations();

				return {
					missing: testCase.shouldViolateAtLines.filter(isMissing),
					unexpected: actualViolations.filter(isUnexpected).map(toRuleAtLine),
				};

				function getActualViolations() {
					return (
						markdownlint.sync({
							...lintOptions,
							strings: { testContent: testCase.markdown },
						}).testContent || []
					);
				}
				function isUnexpected(/** @type markdownlint.LintError*/ violation) {
					return (
						testCase.shouldViolateAtLines.length === 0 ||
						testCase.shouldViolateAtLines.every(
							(expectedLineNumber) =>
								!violation.ruleNames.includes(ruleUnderTest) ||
								violation.lineNumber !== expectedLineNumber,
						)
					);
				}
				function isMissing(/** @type number*/ atLine) {
					return !actualViolations.some(
						(violation) =>
							violation.ruleNames.includes(ruleUnderTest) &&
							violation.lineNumber === atLine,
					);
				}
				function toRuleAtLine(/** @type markdownlint.LintError*/ violation) {
					return {
						rule: violation.ruleNames[0],
						atLine: violation.lineNumber,
					};
				}
			}
		}
	}

	/**
	 * @param {string} headline – A concise statement of what's tested
	 * @param {TestSuite} testSuite
	 */
	function testSomethingElse(headline, testSuite) {
		print.any('Testing ' + headline);
		print.separator.thin();
		testSuite.run();
		print.separator.thickExtra();
	}
}

/**
 * @param{MessageStack} messageStack
 * @param {string} withMessage
 * @returns {MessageStack}
 */
function prependNonEmpty(messageStack, withMessage) {
	return messageStack.length > 0 ? [withMessage, messageStack] : messageStack;
}

module.exports = {
	prepareRuleTests,
	test,
	assert,
	getPassedNumber,
	getFailedNumber,
	print,
};
