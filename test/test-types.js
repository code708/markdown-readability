// @ts-check

/** @typedef {'✅' | '❌'} Result */

/** @typedef {{run(): void }} TestSuite */

/** @typedef {RuleTestCase[]} RuleTestSuite */

/**
 * @typedef {{
 *  shouldViolateAtLines: number[],
 *  when: string,
 *  markdown: string
 * }}
 * RuleTestCase */

/** @template T @typedef {T} AssertionActual */

/** @typedef {{message: string, level: number}} AssertionError */

/** @typedef {(string | MessageStack)[]} MessageStack */

/**
 * @template T
 * @typedef {(actual: AssertionActual<T>) => MessageStack[]}
 * MessageStacksProvider
 */

/**
 * @template T
 * @typedef {(actual: AssertionActual<T>) => AssertionResult<T>}
 * AssertionPredicate
 */

/**
 * @template T
 * @typedef {{
 *  should: string,
 *	when: string,
 *	run: () => AssertionActual<T>,
 *	test: (actual: T) => boolean,
 *	failWith: MessageStacksProvider<T>,
 * }}
 * AssertionCase
 */

/**
 * @template T
 * @typedef {{
 *  countResult(): AssertionResult<T>,
 *  printResult(): AssertionResult<T>,
 *  printErrors(): AssertionResult<T>,
 *  getActual(): AssertionActual<T>,
 * }}
 * AssertionResult */
