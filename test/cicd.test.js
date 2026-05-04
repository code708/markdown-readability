// @ts-check
'use strict';

const { assert } = require('./test-framework');
const fs = require('fs');
const path = require('path');
const pullRequest = require('../cicd/pull-request');

/** @typedef {'dry-run' | 'prepare' | 'create' | 'update'} Mode */
/** @typedef {{ hash: string, shortHash: string, header: string, type?: string, subject: string, body: string, breaking: boolean }} Commit */
/** @typedef {{ version: string, releaseNotes: string }} DeliveryPlan */
/** @typedef {{ version: string, [key: string]: unknown }} PackageJson */
/** @typedef {{ baseRef: string, headRef: string }} CommitRangeRequest */
/** @typedef {{ branch: string, title: string, body: string }} PullRequestRequest */
/** @typedef {(string | MessageStack)[]} MessageStack */
/**
 * @typedef {{
 *   packageJson: PackageJson,
 *   changelog: string,
 *   effects: string[],
 *   messages: string[],
 *   pullRequests: PullRequestRequest[],
 *   commitRangeRequests: CommitRangeRequest[],
 *   removeReleaseCommitCalls: Array<{ releaseCommitInBranch: boolean, newerCommitsAfterRelease: boolean, releaseCommitOnMain: boolean }>,
 *   git: {
 *     getCurrentBranch(): string,
 *     getCommitsFromBase(request: CommitRangeRequest): string | Commit[],
 *     requireCleanWorkingTree(): void,
 *     requireBranchUpToDateWithMain(): void,
 *     removeReleaseCommit(): void,
 *     commitVersionBump(version: string): void,
 *     pushBranch(branch: string): void,
 *     forcePushBranch(branch: string): void,
 *   },
 *   github: {
 *     requirePullRequestExists(branch: string): void,
 *     createPullRequest(request: PullRequestRequest): void,
 *   },
 *   files: {
 *     readPackageJson(): PackageJson,
 *     writePackageJson(packageJson: PackageJson): void,
 *     readChangelog(): string,
 *     writeChangelog(changelog: string): void,
 *   },
 *   now(): Date,
 *   log(...messages: string[]): void,
 * }} FakeGitHubActionContext
 */
/**
 * @typedef {{
 *   packageJson: PackageJson,
 *   changelog: string,
 *   effects: string[],
 *   messages: string[],
 *   pullRequests: PullRequestRequest[],
 *   commitRangeRequests: CommitRangeRequest[],
 *   removeReleaseCommitCalls: Array<{ releaseCommitInBranch: boolean, newerCommitsAfterRelease: boolean, releaseCommitOnMain: boolean }>,
 * }} FakeState
 */

function testPullRequestScript() {
	testModuleSurface();
	testCliModeParsing();
	testCommitParsing();
	testDeliveryPlanGeneration();
	testChangelogWriting();
	testWorkflowAdapters();

	return;

	function testModuleSurface() {
		const expectedExports = [
			'create',
			'createContext',
			'generateReleasePlan',
			'getRequiredBump',
			'parseArgs',
			'parseCommitLog',
			'planDelivery',
			'prepare',
			'preview',
			'runCli',
			'update',
			'writeReleaseNotes',
		];

		assert({
			should: 'export the documented public surface',
			when: 'requiring the pull-request module',
			run: () => Object.keys(pullRequest).sort(),
			/** @param {string[]} keys */
			test: (keys) => expectedExports.every((k) => keys.includes(k)),
			/** @param {string[]} keys */
			failWith: (keys) => [
				['Missing exports:', expectedExports.filter((k) => !keys.includes(k))],
			],
		});
	}

	function testCliModeParsing() {
		assert({
			should: 'map every documented CLI flag to its mode',
			when: 'parsing the CLI args',
			run: () => ({
				none: pullRequest.parseArgs([]).mode,
				'--create': pullRequest.parseArgs(['--create']).mode,
				'-c': pullRequest.parseArgs(['-c']).mode,
				'--prepare': pullRequest.parseArgs(['--prepare']).mode,
				'-p': pullRequest.parseArgs(['-p']).mode,
				'--dry-run': pullRequest.parseArgs(['--dry-run']).mode,
				'--update': pullRequest.parseArgs(['--update']).mode,
			}),
			/** @param {Record<string, Mode>} m */
			test: (m) =>
				m.none === 'create' &&
				m['--create'] === 'create' &&
				m['-c'] === 'create' &&
				m['--prepare'] === 'prepare' &&
				m['-p'] === 'prepare' &&
				m['--dry-run'] === 'dry-run' &&
				m['--update'] === 'update',
			/** @param {Record<string, Mode>} m */
			failWith: (m) => [['Unexpected mode mapping:', [JSON.stringify(m)]]],
		});

		assert({
			should: 'reject every pair of mutually exclusive mode flags',
			when: 'parsing two conflicting CLI mode flags',
			run: () => {
				const pairs = [
					['--create', '--prepare'],
					['--create', '--dry-run'],
					['--create', '--update'],
					['--prepare', '--dry-run'],
					['--prepare', '--update'],
					['--dry-run', '--update'],
				];
				return pairs.filter(([a, b]) => {
					try {
						pullRequest.parseArgs([a, b]);
						return true;
					} catch (e) {
						return !/Cannot combine/.test(
							e instanceof Error ? e.message : String(e),
						);
					}
				});
			},
			/** @param {string[][]} offenders */
			test: (offenders) => offenders.length === 0,
			/** @param {string[][]} offenders */
			failWith: (offenders) => [
				[
					'Pairs that did not throw Cannot combine:',
					offenders.map((p) => p.join('+')),
				],
			],
		});

		assert({
			should: 'reject unknown CLI options',
			when: 'parsing an unknown flag',
			run: () =>
				captureError(() => pullRequest.parseArgs(['--release-required'])),
			/** @param {Error} error */
			test: (error) => /Unknown option: --release-required/.test(error.message),
			/** @param {Error} error */
			failWith: (error) => [
				[`Expected unknown option error, got ${error.message}`],
			],
		});
	}

	function testCommitParsing() {
		const commits = pullRequest.parseCommitLog(
			[
				commitRecord(
					'breaking change bang only',
					'behav!: add export flow',
					'',
				),
				commitRecord(
					'breaking change footer only',
					'perf: reduce parser allocations',
					'BREAKING-CHANGE: Parser output changed.',
				),
				commitRecord(
					'breaking change footer only',
					'behav(rules)!: Introduce rule C708-001',
					'BREAKING-CHANGE: New rule introduced a framework change.',
				),
				commitRecord(
					'invalid breaking change footer',
					'behavfix: fix title spacing',
					'BREAKING CHANGE: ignored legacy footer.',
				),
			].join(''),
		);

		const breakingFlags = commits.map((commit) => commit.breaking);

		assert({
			should: 'recognize a bang header as breaking',
			when: 'a commit subject ends its type with a bang',
			run: () => breakingFlags[0],
			/** @param {boolean} breaking */
			test: (breaking) => breaking === true,
			/** @param {boolean} breaking */
			failWith: (breaking) => [[`Breaking flag: ${breaking}`]],
		});

		assert({
			should: 'recognize an exact BREAKING-CHANGE footer as breaking',
			when: 'a commit body contains a BREAKING-CHANGE footer',
			run: () => breakingFlags[1],
			/** @param {boolean} breaking */
			test: (breaking) => breaking === true,
			/** @param {boolean} breaking */
			failWith: (breaking) => [[`Breaking flag: ${breaking}`]],
		});

		assert({
			should:
				'recognize a bang header combined with a BREAKING-CHANGE footer as breaking',
			when: 'a commit has both a bang header and a BREAKING-CHANGE footer',
			run: () => breakingFlags[2],
			/** @param {boolean} breaking */
			test: (breaking) => breaking === true,
			/** @param {boolean} breaking */
			failWith: (breaking) => [[`Breaking flag: ${breaking}`]],
		});

		assert({
			should: 'reject the legacy BREAKING CHANGE footer with a space',
			when: 'a commit body contains a legacy space-separated BREAKING CHANGE footer',
			run: () => breakingFlags[3],
			/** @param {boolean} breaking */
			test: (breaking) => breaking === false,
			/** @param {boolean} breaking */
			failWith: (breaking) => [[`Breaking flag: ${breaking}`]],
		});
	}

	function testDeliveryPlanGeneration() {
		const commits = {
			behav: commit('sha1', 'behav', 'introduce rule C708-001'),
			behavfix: commit('sha2', 'behavfix', 'fix release note extraction'),
			docs: commit('sha3', 'docs', 'document release command'),
			chore: commit('sha4', 'chore', 'update generated files'),
			perf: commit('sha5', 'perf', 'speed up changelog rendering'),
			perffix: commit('sha6', 'perffix', 'fix changelog rendering speed'),
			refac: commit('sha7', 'refac', 'split release helpers'),
			style: commit('sha8', 'style', 'reformat code base'),
			cicd: commit('sha9', 'cicd', 'add cicd workflows'),
			breakingRefac: commit('sha0', 'refac', 'rename api service', true),
			breakingBehav: commit(
				'shaA',
				'behav',
				'replace public rule loader signature',
				true,
			),
		};
		/** @type {DeliveryPlan} */
		const generatedMinorRelease = pullRequest.generateReleasePlan({
			baseVersion: '1.2.3',
			commits: [
				commits.behav,
				commits.behavfix,
				commits.docs,
				commits.chore,
				commits.perf,
				commits.perffix,
				commits.refac,
			],
			date: '2026-05-04',
		});

		assert({
			should: 'choose the highest required SemVer bump',
			when: 'a commit range contains feature, patch, docs, and hidden commits',
			run: () => generatedMinorRelease,
			/** @param {DeliveryPlan} release */
			test: (release) => release.version === '1.3.0',
			/** @param {DeliveryPlan} release */
			failWith: (release) => [
				[`Expected version 1.3.0, got ${release.version}`],
			],
		});

		assert({
			should: 'include new behaviors in the release notes',
			when: 'a commit range contains behavior commits',
			run: () => generatedMinorRelease,
			/** @param {DeliveryPlan} release */
			test: (release) =>
				release.releaseNotes.includes('### New Behaviors\n') &&
				release.releaseNotes.includes(commits.behav.subject),
			/** @param {DeliveryPlan} release */
			failWith: (release) => [
				[
					'Release notes should include behavior details without raw commit internals.',
					missingReleaseNotes(release.releaseNotes, [
						'### New Behaviors' + '\n',
						commits.behav.subject,
					]),
					unexpectedReleaseNotes(release.releaseNotes, [
						commits.behav.hash,
						commits.behav.body,
						commits.behav.header,
					]),
				],
			],
		});

		assert({
			should: 'include bug fixes in the release notes',
			when: 'a commit range contains behavior fix commits',
			run: () => generatedMinorRelease,
			/** @param {DeliveryPlan} release */
			test: (release) =>
				release.releaseNotes.includes('### Bug Fixes') &&
				release.releaseNotes.includes('fix release note extraction'),
			/** @param {DeliveryPlan} release */
			failWith: (release) => [
				missingReleaseNotes(release.releaseNotes, [
					'### Bug Fixes',
					'fix release note extraction',
				]),
			],
		});

		assert({
			should: 'include performance improvements in the release notes',
			when: 'a commit range contains performance commits',
			run: () => generatedMinorRelease,
			/** @param {DeliveryPlan} release */
			test: (release) =>
				release.releaseNotes.includes('### Performance Improvements') &&
				release.releaseNotes.includes('speed up changelog rendering') &&
				release.releaseNotes.includes('fix changelog rendering speed') &&
				countOccurrences(
					release.releaseNotes,
					'### Performance Improvements',
				) === 1,
			/** @param {DeliveryPlan} release */
			failWith: (release) => [
				missingReleaseNotes(release.releaseNotes, [
					'### Performance Improvements',
					'speed up changelog rendering',
					'fix changelog rendering speed',
				]),
			],
		});

		assert({
			should: 'include documentation in the release notes',
			when: 'a commit range contains documentation commits',
			run: () => generatedMinorRelease,
			/** @param {DeliveryPlan} release */
			test: (release) =>
				release.releaseNotes.includes('### Documentation') &&
				release.releaseNotes.includes('document release command'),
			/** @param {DeliveryPlan} release */
			failWith: (release) => [
				missingReleaseNotes(release.releaseNotes, [
					'### Documentation',
					'document release command',
				]),
			],
		});

		assert({
			should: 'exclude hidden commits from the release notes',
			when: 'a commit range contains chore and refactoring commits',
			run: () => generatedMinorRelease,
			/** @param {DeliveryPlan} release */
			test: (release) =>
				!release.releaseNotes.includes('update generated files') &&
				!release.releaseNotes.includes('split release helpers'),
			/** @param {DeliveryPlan} release */
			failWith: (release) => [
				unexpectedReleaseNotes(release.releaseNotes, [
					'update generated files',
					'split release helpers',
				]),
			],
		});

		assert({
			should: 'produce a patch bump for documentation commits',
			when: 'the commit range contains only docs and hidden commits',
			run: () =>
				pullRequest.generateReleasePlan({
					baseVersion: '1.2.3',
					commits: [commits.docs, commits.refac],
					date: '2026-05-04',
				}),
			/** @param {DeliveryPlan} release */
			test: (release) => release.version === '1.2.4',
			/** @param {DeliveryPlan} release */
			failWith: (release) => [
				[`Expected version 1.2.4, got ${release.version}`],
			],
		});

		assert({
			should: 'include only documentation in the patch release notes',
			when: 'the commit range contains only docs and hidden commits',
			run: () =>
				pullRequest.generateReleasePlan({
					baseVersion: '1.2.3',
					commits: [commits.docs, commits.refac],
					date: '2026-05-04',
				}),
			/** @param {DeliveryPlan} release */
			test: (release) =>
				release.releaseNotes.includes('### Documentation') &&
				release.releaseNotes.includes('document release command') &&
				!release.releaseNotes.includes('split release helpers'),
			/** @param {DeliveryPlan} release */
			failWith: (release) => [
				[
					'Documentation-only release notes should include docs and exclude hidden commits.',
					missingReleaseNotes(release.releaseNotes, [
						'### Documentation',
						'document release command',
					]),
					unexpectedReleaseNotes(release.releaseNotes, [
						'split release helpers',
					]),
				],
			],
		});

		assert({
			should: 'abort without generating version and notes',
			when: 'the commit range contains only hidden commits',
			run: () =>
				captureError(() =>
					pullRequest.generateReleasePlan({
						baseVersion: '1.2.3',
						commits: [commits.refac],
						date: '2026-05-04',
					}),
				),
			/** @param {Error} error */
			test: (error) => /No bump-worthy commits/.test(error.message),
			/** @param {Error} error */
			failWith: (error) => [
				[
					'Did not abort with "No bump-worthy commits", but',
					[`${error.message}`],
				],
			],
		});

		assert({
			should: 'produce a major bump for exact breaking-change footers',
			when: 'a commit body contains BREAKING-CHANGE: description',
			run: () =>
				pullRequest.generateReleasePlan({
					baseVersion: '1.2.3',
					commits: [commits.breakingRefac],
					date: '2026-05-04',
				}).version,
			/** @param {string} version */
			test: (version) => version === '2.0.0',
			/** @param {string} version */
			failWith: (version) => [
				[
					'Expected exact BREAKING-CHANGE footer to force a major bump to 2.0.0',
					[`But got: ${version}`],
				],
			],
		});

		const hiddenTypeBreakingRelease = pullRequest.generateReleasePlan({
			baseVersion: '1.2.3',
			commits: [commits.breakingRefac],
			date: '2026-05-04',
		});

		assert({
			should:
				'list a hidden-type breaking commit under a Breaking Changes section',
			when: 'a commit range contains only a breaking commit of a hidden type',
			run: () => hiddenTypeBreakingRelease.releaseNotes,
			/** @param {string} notes */
			test: (notes) =>
				notes.includes('### Breaking Changes\n') &&
				notes.includes(commits.breakingRefac.subject),
			/** @param {string} notes */
			failWith: (notes) => [
				missingReleaseNotes(notes, [
					'### Breaking Changes\n',
					commits.breakingRefac.subject,
				]),
			],
		});

		const mixedBreakingRelease = pullRequest.generateReleasePlan({
			baseVersion: '1.2.3',
			commits: [commits.breakingBehav],
			date: '2026-05-04',
		});

		assert({
			should:
				'list a non-hidden-type breaking commit under both Breaking Changes and its type section',
			when: 'a commit range contains a breaking commit of a non-hidden type',
			run: () => mixedBreakingRelease.releaseNotes,
			/** @param {string} notes */
			test: (notes) =>
				notes.includes('### Breaking Changes\n') &&
				notes.includes('### New Behaviors\n') &&
				countOccurrences(notes, commits.breakingBehav.subject) === 2,
			/** @param {string} notes */
			failWith: (notes) => [
				missingReleaseNotes(notes, [
					'### Breaking Changes\n',
					'### New Behaviors\n',
				]),
				[
					`Expected subject to appear twice, found ${countOccurrences(notes, commits.breakingBehav.subject)}`,
				],
			],
		});
	}

	function testChangelogWriting() {
		const changelog =
			'# Changelog\n\nExisting intro.\n\n## [1.2.3] - 2026-05-01\n';
		const releaseNotes =
			'## [1.3.0] - 2026-05-04\n\n### New Behaviors\n\n- add automation (abc1234)\n';

		assert({
			should: 'insert generated notes before existing changelog entries',
			when: 'writing release notes to an existing changelog',
			run: () => pullRequest.writeReleaseNotes(changelog, releaseNotes),
			/** @param {string} updated */
			test: (updated) =>
				updated.indexOf('## [1.3.0]') < updated.indexOf('## [1.2.3]'),
			/** @param {string} updated */
			failWith: (updated) => [
				[
					'Expected generated release notes before existing entries.',
					'Actual changelog:',
					[updated],
				],
			],
		});

		assert({
			should:
				'append generated notes when the changelog has no prior release entries',
			when: 'writing release notes to a fresh changelog',
			run: () =>
				pullRequest.writeReleaseNotes(
					'# Changelog\n\nIntro only.\n',
					'## [1.0.0] - 2026-05-04\n\n### Documentation\n- doc (abc1234)\n',
				),
			/** @param {string} updated */
			test: (updated) =>
				updated.includes('## [1.0.0]') && updated.startsWith('# Changelog'),
			/** @param {string} updated */
			failWith: (updated) => [['Updated changelog:', [updated]]],
		});
	}

	function testWorkflowAdapters() {
		const commitSha = 'abc1234567890';

		assert({
			should: 'return the generated version',
			when: 'a branch has bump-worthy commits',
			run: () => {
				const context = fakeGitHubActionContext({ commitSha });
				const result = pullRequest.preview(context);
				return { context, result };
			},
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ result }) => result?.version === '1.3.0',
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ result }) => [
				[
					'Expected preview to return version 1.3.0.',
					[`But got ${result?.version}`],
				],
			],
		});

		assert({
			should: 'avoid file, git, and GitHub side effects',
			when: 'previewing a branch',
			run: () => {
				const context = fakeGitHubActionContext({ commitSha });
				pullRequest.preview(context);
				return context.effects;
			},
			/** @param {string[]} effects */
			test: (effects) => effects.length === 0,
			/** @param {string[]} effects */
			failWith: (effects) => [
				[
					'Expected preview to avoid side effects.',
					[`But got ${effects.join(', ')}`],
				],
			],
		});

		assert({
			should: 'print the generated version',
			when: 'previewing a branch',
			run: () => {
				const context = fakeGitHubActionContext({ commitSha });
				pullRequest.preview(context);
				return context.messages;
			},
			/** @param {string[]} messages */
			test: (messages) =>
				messages.some((message) => message.includes('Next version: 1.3.0')),
			/** @param {string[]} messages */
			failWith: (messages) => [
				[
					'Expected preview to print the generated version.',
					`Actual messages: ${messages.join('\n') || '(none)'}`,
				],
			],
		});

		assert({
			should: 'write the generated package version',
			when: 'a branch has bump-worthy commits',
			run: () => {
				const context = fakeGitHubActionContext({ commitSha });
				const result = pullRequest.prepare(context);
				return { context, result };
			},
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context, result }) =>
				result?.version === '1.3.0' && context.packageJson.version === '1.3.0',
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[
					'Expected prepare to write package version 1.3.0.',
					`Package version: ${context.packageJson.version}`,
				],
			],
		});

		assert({
			should: 'write the generated release notes',
			when: 'a branch has bump-worthy commits',
			run: () => {
				const context = fakeGitHubActionContext({ commitSha });
				const result = pullRequest.prepare(context);
				return { context, result };
			},
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context, result }) =>
				result !== null &&
				context.changelog.includes(result.releaseNotes) &&
				result.releaseNotes.includes('### New Behaviors'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context, result }) => [
				[
					'Expected prepare to write generated release notes into the changelog.',
					'Expected release notes:',
					[(result && result.releaseNotes) || '(no release plan)'],
					'Actual changelog:',
					[context.changelog],
				],
			],
		});

		const prepareReleaseEffects = (() => {
			const context = fakeGitHubActionContext({ commitSha });
			pullRequest.prepare(context);
			return context.effects;
		})();
		const preparing_release_branch =
			'preparing a branch with bump-worthy commits';

		assert({
			should: 'require a clean working tree',
			when: preparing_release_branch,
			run: () => prepareReleaseEffects,
			/** @param {string[]} effects */
			test: (effects) => effects.includes('clean'),
			/** @param {string[]} effects */
			failWith: (effects) => [
				[`Actual effects: ${effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'write the bumped package version',
			when: preparing_release_branch,
			run: () => prepareReleaseEffects,
			/** @param {string[]} effects */
			test: (effects) => effects.includes('write-package:1.3.0'),
			/** @param {string[]} effects */
			failWith: (effects) => [
				[`Actual effects: ${effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'write the changelog with generated release notes',
			when: preparing_release_branch,
			run: () => prepareReleaseEffects,
			/** @param {string[]} effects */
			test: (effects) => effects.includes('write-changelog'),
			/** @param {string[]} effects */
			failWith: (effects) => [
				[`Actual effects: ${effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'commit the version bump',
			when: preparing_release_branch,
			run: () => prepareReleaseEffects,
			/** @param {string[]} effects */
			test: (effects) => effects.includes('commit:1.3.0'),
			/** @param {string[]} effects */
			failWith: (effects) => [
				[`Actual effects: ${effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'push the current branch',
			when: 'creating the pull request',
			run: () => {
				const context = fakeGitHubActionContext({ commitSha });
				pullRequest.create(context);
				return context.effects;
			},
			/** @param {string[]} effects */
			test: (effects) => effects.includes('push:feature/release-preview'),
			/** @param {string[]} effects */
			failWith: (effects) => [
				[
					'Expected create to push feature/release-preview.',
					`Actual effects: ${effects.join(', ') || '(none)'}`,
				],
			],
		});

		assert({
			should: 'open the pull request',
			when: 'creating the pull request',
			run: () => {
				const context = fakeGitHubActionContext({ commitSha });
				const result = pullRequest.create(context);
				return { context, result };
			},
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context, result }) =>
				result !== null &&
				context.pullRequests.length === 1 &&
				context.pullRequests[0].branch === 'feature/release-preview' &&
				context.pullRequests[0].title === 'chore(release): 1.3.0' &&
				context.pullRequests[0].body === result.releaseNotes,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[
					'Expected create to open one PR for feature/release-preview.',
					`Actual pull requests: ${JSON.stringify(context.pullRequests)}`,
				],
			],
		});

		assert({
			should: 'read current branch commits from main',
			when: 'previewing a branch',
			run: () => {
				const context = fakeGitHubActionContext({ commitSha });
				pullRequest.preview(context);
				return context.commitRangeRequests;
			},
			/** @param {CommitRangeRequest[]} requests */
			test: (requests) =>
				requests.some(
					(r) =>
						r.baseRef === 'main' && r.headRef === 'feature/release-preview',
				),
			/** @param {CommitRangeRequest[]} requests */
			failWith: (requests) => [
				[
					'Expected commits to be read from main to the current branch.',
					`Actual requests: ${JSON.stringify(requests)}`,
				],
			],
		});

		assert({
			should: 'plan a non-release PR',
			when: 'the branch contains only hidden non-breaking commits',
			run: () =>
				pullRequest.planDelivery(
					fakeGitHubActionContext({ commitSha, commitType: 'refac' }),
				),
			test: (planned) => planned.kind === 'non-release',
			failWith: (planned) => [
				[
					'Expected hidden-only non-breaking commits to plan a non-release PR.',
					`Actual plan: ${JSON.stringify(planned)}`,
				],
			],
		});

		assert({
			should: 'return null and print a clear message',
			when: 'previewing hidden-only non-breaking commits',
			run: () => {
				const context = fakeGitHubActionContext({
					commitSha,
					commitType: 'refac',
				});
				const result = pullRequest.preview(context);
				return { context, result };
			},
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context, result }) =>
				result === null &&
				context.messages.some((message) =>
					message.includes('No release required'),
				),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context, result }) => [
				[
					'Expected preview to return null and explain that no release is required.',
					`Actual result: ${JSON.stringify(result)}`,
					`Actual messages: ${context.messages.join('\n') || '(none)'}`,
				],
			],
		});

		const nonReleasePrepare = (() => {
			const context = fakeGitHubActionContext({
				commitSha,
				commitType: 'refac',
			});
			const result = pullRequest.prepare(context);
			return { context, result };
		})();
		const preparing_non_release_branch =
			'preparing hidden-only non-breaking commits';

		assert({
			should: 'return null',
			when: preparing_non_release_branch,
			run: () => nonReleasePrepare,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ result }) => result === null,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ result }) => [[`Actual result: ${JSON.stringify(result)}`]],
		});

		assert({
			should: 'leave the package version unchanged',
			when: preparing_non_release_branch,
			run: () => nonReleasePrepare,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) => context.packageJson.version === '1.2.3',
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual package version: ${context.packageJson.version}`],
			],
		});

		assert({
			should: 'require a clean working tree',
			when: preparing_non_release_branch,
			run: () => nonReleasePrepare,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) => context.effects.includes('clean'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'avoid file writes, commits, and pushes',
			when: preparing_non_release_branch,
			run: () => nonReleasePrepare,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) =>
				!context.effects.some((effect) =>
					/^(write-|commit:|push|force-push|remove-release)/.test(effect),
				),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'push and open an explicit non-release pull request',
			when: 'creating hidden-only non-breaking commits',
			run: () => {
				const context = fakeGitHubActionContext({
					commitSha,
					commitType: 'refac',
				});
				const result = pullRequest.create(context);
				return { context, result };
			},
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context, result }) =>
				result === null &&
				context.effects.includes('push:feature/release-preview') &&
				context.pullRequests.length === 1 &&
				context.pullRequests[0].title === 'chore: non-release changes' &&
				context.pullRequests[0].body.includes('No package version bump') &&
				context.pullRequests[0].body.includes('no changelog entry'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context, result }) => [
				[
					'Expected create to push and open a clear non-release PR.',
					`Actual result: ${JSON.stringify(result)}`,
					`Actual pull requests: ${JSON.stringify(context.pullRequests)}`,
					`Actual effects: ${context.effects.join(', ') || '(none)'}`,
				],
			],
		});

		assert({
			should: 'plan a non-release PR',
			when: 'the explicit range contains only hidden non-breaking commits',
			run: () => {
				const context = fakeGitHubActionContext({
					commitSha,
					commitType: 'test',
				});
				const planned = pullRequest.planDelivery(context, {
					baseRef: 'origin/main',
					headRef: 'abc1234',
				});
				return { context, planned };
			},
			test: ({ context, planned }) =>
				planned.kind === 'non-release' &&
				context.commitRangeRequests.some(
					(r) => r.baseRef === 'origin/main' && r.headRef === 'abc1234',
				),
			failWith: ({ context, planned }) => [
				[
					'Expected explicit hidden-only range to be non-release.',
					`Actual plan: ${JSON.stringify(planned)}`,
					`Actual requests: ${JSON.stringify(context.commitRangeRequests)}`,
				],
			],
		});

		assert({
			should: 'plan a release',
			when: 'the explicit range contains bump-worthy commits',
			run: () => {
				const context = fakeGitHubActionContext({
					commitSha,
					commitType: 'behavfix',
				});
				return pullRequest.planDelivery(context, {
					baseRef: 'origin/main',
					headRef: 'abc1234',
				});
			},
			test: (planned) => planned.kind === 'release',
			failWith: (planned) => [
				[
					`Expected explicit behavior-fix range to require a release, got ${JSON.stringify(planned)}`,
				],
			],
		});

		const updateWithoutPr = (() => {
			const context = fakeGitHubActionContext({
				commitSha,
				pullRequestExists: false,
			});
			const error = captureError(() => pullRequest.update(context));
			return { context, error };
		})();
		const updating_branch_without_pr =
			'updating a branch without an existing pull request';

		assert({
			should: 'fail with guidance to run pr:create',
			when: updating_branch_without_pr,
			run: () => updateWithoutPr,
			/** @param {{ context: FakeGitHubActionContext, error: Error }} actual */
			test: ({ error }) => /npm run pr:create/.test(error.message),
			/** @param {{ context: FakeGitHubActionContext, error: Error }} actual */
			failWith: ({ error }) => [[`Actual error: ${error.message}`]],
		});

		assert({
			should: 'abort before any branch rewrite or file mutation',
			when: updating_branch_without_pr,
			run: () => updateWithoutPr,
			/** @param {{ context: FakeGitHubActionContext, error: Error }} actual */
			test: ({ context }) =>
				!context.effects.some((effect) =>
					/^(write-|commit:|push|force-push|remove-release|up-to-date)/.test(
						effect,
					),
				),
			/** @param {{ context: FakeGitHubActionContext, error: Error }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		const updateOutdatedBranch = (() => {
			const context = fakeGitHubActionContext({
				commitSha,
				branchUpToDate: false,
			});
			const error = captureError(() => pullRequest.update(context));
			return { context, error };
		})();
		const updating_outdated_branch =
			'updating an existing pull request from an outdated branch';

		assert({
			should: 'fail with a rebase message',
			when: updating_outdated_branch,
			run: () => updateOutdatedBranch,
			/** @param {{ context: FakeGitHubActionContext, error: Error }} actual */
			test: ({ error }) => /rebase/i.test(error.message),
			/** @param {{ context: FakeGitHubActionContext, error: Error }} actual */
			failWith: ({ error }) => [[`Actual error: ${error.message}`]],
		});

		assert({
			should: 'abort before release removal, prepare, and push',
			when: updating_outdated_branch,
			run: () => updateOutdatedBranch,
			/** @param {{ context: FakeGitHubActionContext, error: Error }} actual */
			test: ({ context }) =>
				!context.effects.some((effect) =>
					/^(write-|commit:|push|force-push|remove-release)/.test(effect),
				),
			/** @param {{ context: FakeGitHubActionContext, error: Error }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		const updateBehindNewer = (() => {
			const context = fakeGitHubActionContext({
				commitSha,
				releaseCommitInBranch: true,
				newerCommitsAfterRelease: true,
			});
			const result = pullRequest.update(context);
			return { context, result };
		})();
		const updating_existing_pr_containing_outdated_release_commit =
			'updating an existing pull request with a release commit behind newer commits';

		assert({
			should: 'return the freshly generated version',
			when: updating_existing_pr_containing_outdated_release_commit,
			run: () => updateBehindNewer,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ result }) => result?.version === '1.3.0',
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ result }) => [[`Actual result: ${JSON.stringify(result)}`]],
		});

		assert({
			should:
				'invoke the remove-release adapter while a removable release commit exists',
			when: updating_existing_pr_containing_outdated_release_commit,
			run: () => updateBehindNewer,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) =>
				context.removeReleaseCommitCalls.some(
					(call) => call.releaseCommitInBranch && call.newerCommitsAfterRelease,
				),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[
					`Actual remove-release calls: ${JSON.stringify(context.removeReleaseCommitCalls)}`,
				],
			],
		});

		assert({
			should: 'write the bumped package version',
			when: updating_existing_pr_containing_outdated_release_commit,
			run: () => updateBehindNewer,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) => context.effects.includes('write-package:1.3.0'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'write the changelog with generated release notes',
			when: updating_existing_pr_containing_outdated_release_commit,
			run: () => updateBehindNewer,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) => context.effects.includes('write-changelog'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'commit the version bump',
			when: updating_existing_pr_containing_outdated_release_commit,
			run: () => updateBehindNewer,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) => context.effects.includes('commit:1.3.0'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'force push the rewritten branch',
			when: updating_existing_pr_containing_outdated_release_commit,
			run: () => updateBehindNewer,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) =>
				context.effects.includes('force-push:feature/release-preview'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		const updateNoOldRelease = (() => {
			const context = fakeGitHubActionContext({ commitSha });
			const result = pullRequest.update(context);
			return { context, result };
		})();
		const updating_no_old_release =
			'updating an existing pull request with no branch-local release commit';

		assert({
			should: 'return the freshly generated version',
			when: updating_no_old_release,
			run: () => updateNoOldRelease,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ result }) => result?.version === '1.3.0',
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ result }) => [[`Actual result: ${JSON.stringify(result)}`]],
		});

		assert({
			should: 'write the bumped package version',
			when: updating_no_old_release,
			run: () => updateNoOldRelease,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) => context.effects.includes('write-package:1.3.0'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'write the changelog with generated release notes',
			when: updating_no_old_release,
			run: () => updateNoOldRelease,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) => context.effects.includes('write-changelog'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'commit the version bump',
			when: updating_no_old_release,
			run: () => updateNoOldRelease,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) => context.effects.includes('commit:1.3.0'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'force push the rewritten branch',
			when: updating_no_old_release,
			run: () => updateNoOldRelease,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) =>
				context.effects.includes('force-push:feature/release-preview'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		const updateHiddenOnly = (() => {
			const context = fakeGitHubActionContext({
				commitSha,
				commitType: 'refac',
				releaseCommitInBranch: true,
			});
			const result = pullRequest.update(context);
			return { context, result };
		})();
		const update_hidden_only =
			'release commit removal leaves only hidden commits';

		assert({
			should: 'return null',
			when: update_hidden_only,
			run: () => updateHiddenOnly,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ result }) => result === null,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ result }) => [[`Actual result: ${JSON.stringify(result)}`]],
		});

		assert({
			should: 'remove the old release commit',
			when: update_hidden_only,
			run: () => updateHiddenOnly,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) =>
				context.effects.some((effect) => effect.startsWith('remove-release')),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'avoid file writes and new commits',
			when: update_hidden_only,
			run: () => updateHiddenOnly,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) =>
				!context.effects.some((effect) => /^(write-|commit:)/.test(effect)),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should: 'force push the rewritten branch',
			when: update_hidden_only,
			run: () => updateHiddenOnly,
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			test: ({ context }) =>
				context.effects.includes('force-push:feature/release-preview'),
			/** @param {{ context: FakeGitHubActionContext, result: DeliveryPlan | null }} actual */
			failWith: ({ context }) => [
				[`Actual effects: ${context.effects.join(', ') || '(none)'}`],
			],
		});

		assert({
			should:
				'invoke the remove-release adapter even when no branch-local release commit exists',
			when: 'updating an existing pull request with a release commit only on main',
			run: () => {
				const context = fakeGitHubActionContext({
					commitSha,
					releaseCommitOnMain: true,
				});
				pullRequest.update(context);
				return context;
			},
			/** @param {FakeGitHubActionContext} context */
			test: (context) =>
				context.removeReleaseCommitCalls.some(
					(call) => !call.releaseCommitInBranch && call.releaseCommitOnMain,
				),
			/** @param {FakeGitHubActionContext} context */
			failWith: (context) => [
				[
					'Expected update to invoke remove-release in a no-branch-local scenario.',
					`Actual remove-release calls: ${JSON.stringify(context.removeReleaseCommitCalls)}`,
				],
			],
		});
	}
}

function testGitHubWorkflows() {
	const workflowsDir = path.join(__dirname, '..', '.github', 'workflows');
	const releaseYml = fs.readFileSync(
		path.join(workflowsDir, 'release.yml'),
		'utf8',
	);
	const releaseVerifyYml = fs.readFileSync(
		path.join(workflowsDir, 'release-verify.yml'),
		'utf8',
	);

	assert({
		should: 'run on every push to main',
		when: 'commits land on main',
		run: () => releaseYml,
		/** @param {string} yml */
		test: (yml) =>
			/on:\s*\n\s*push:\s*\n\s*branches:\s*\[\s*main\s*\]/.test(yml),
		failWith: () => [
			['release.yml does not declare push:branches:[main] trigger'],
		],
	});

	assert({
		should: 'gate publish_and_release on release_plan and dispatch_gate',
		when: 'declaring the publish_and_release job',
		run: () => releaseYml,
		/** @param {string} yml */
		test: (yml) =>
			/publish_and_release:[\s\S]*?needs:\s*\[\s*release_plan\s*,\s*dispatch_gate\s*\]/.test(
				yml,
			),
		failWith: () => [
			[
				'publish_and_release job does not list release_plan and dispatch_gate in needs:',
			],
		],
	});

	assert({
		should: 'run on every pull request targeting main',
		when: 'a pull request is opened or updated',
		run: () => releaseVerifyYml,
		/** @param {string} yml */
		test: (yml) => /on:[\s\S]*?pull_request:/.test(yml),
		failWith: () => [
			['release-verify.yml does not declare a pull_request trigger'],
		],
	});

	assert({
		should: 'run on every merge group check',
		when: 'a merge group requests checks',
		run: () => releaseVerifyYml,
		/** @param {string} yml */
		test: (yml) => /on:[\s\S]*?merge_group:/.test(yml),
		failWith: () => [
			['release-verify.yml does not declare a merge_group trigger'],
		],
	});
}

/** @param {{ commitSha: string, commitType?: string, pullRequestExists?: boolean, branchUpToDate?: boolean, releaseCommitInBranch?: boolean, newerCommitsAfterRelease?: boolean, releaseCommitOnMain?: boolean }} options @returns {FakeGitHubActionContext} */
function fakeGitHubActionContext({
	commitSha,
	commitType = 'behav',
	pullRequestExists = true,
	branchUpToDate = true,
	releaseCommitInBranch = false,
	newerCommitsAfterRelease = false,
	releaseCommitOnMain = false,
}) {
	/** @type {FakeState} */
	const state = {
		packageJson: { version: '1.2.3', name: 'example' },
		changelog: '# Changelog\n\n## [1.2.3] - 2026-05-01\n',
		effects: [],
		messages: [],
		pullRequests: [],
		commitRangeRequests: [],
		removeReleaseCommitCalls: [],
	};

	const context = pullRequest.createContext({
		git: {
			getCurrentBranch() {
				return 'feature/release-preview';
			},
			getCommitsFromBase(request) {
				state.commitRangeRequests.push(request);
				return commitRecord(commitSha, `${commitType}: add automation`, '');
			},
			requireCleanWorkingTree() {
				state.effects.push('clean');
			},
			requireBranchUpToDateWithMain() {
				state.effects.push('up-to-date');
				if (!branchUpToDate) {
					throw new Error(
						'Branch must be rebased on top of main before updating the PR.',
					);
				}
			},
			removeReleaseCommit() {
				state.removeReleaseCommitCalls.push({
					releaseCommitInBranch,
					newerCommitsAfterRelease,
					releaseCommitOnMain,
				});
				state.effects.push('remove-release');
			},
			commitVersionBump(version) {
				state.effects.push(`commit:${version}`);
			},
			pushBranch(branch) {
				state.effects.push(`push:${branch}`);
			},
			forcePushBranch(branch) {
				state.effects.push(`force-push:${branch}`);
			},
		},
		github: {
			requirePullRequestExists(branch) {
				state.effects.push(`require-pr:${branch}`);
				if (!pullRequestExists) {
					throw new Error(
						`No pull request exists for ${branch}. Run npm run pr:create first.`,
					);
				}
			},
			createPullRequest(request) {
				state.effects.push(`pr:${request.branch}:${request.title}`);
				state.pullRequests.push(request);
			},
		},
		files: {
			readPackageJson() {
				return { ...state.packageJson };
			},
			writePackageJson(packageJson) {
				state.packageJson = { ...packageJson };
				state.effects.push(`write-package:${packageJson.version}`);
			},
			readChangelog() {
				return state.changelog;
			},
			writeChangelog(changelog) {
				state.changelog = changelog;
				state.effects.push('write-changelog');
			},
		},
		now: () => new Date('2026-05-04T12:00:00.000Z'),
		log: (...messages) => state.messages.push(messages.join(' ')),
	});

	return /** @type {FakeGitHubActionContext} */ (
		Object.defineProperties(context, {
			packageJson: { get: () => state.packageJson },
			changelog: { get: () => state.changelog },
			effects: { get: () => state.effects },
			messages: { get: () => state.messages },
			pullRequests: { get: () => state.pullRequests },
			commitRangeRequests: { get: () => state.commitRangeRequests },
			removeReleaseCommitCalls: { get: () => state.removeReleaseCommitCalls },
		})
	);
}

/** @param {string} hash @param {string} subject @param {string} body */
function commitRecord(hash, subject, body) {
	return `\u001e${fakeHash(hash)}\u001f${subject}\u001f${body}`;

	/** @param {string} from */
	function fakeHash(from) {
		return from.length < 40
			? from + '.'.repeat(40 - from.length)
			: from.slice(0, 40);
	}
}

/**
 * @param {string} hash
 * @param {string} type
 * @param {string} subject
 * @param {boolean} [breaking]
 * @returns {Commit}
 */
function commit(hash, type, subject, breaking = false) {
	return {
		hash,
		shortHash: hash.slice(0, 7),
		header: `${type}${breaking ? '!' : ''}: ${subject}`,
		type,
		subject,
		body: breaking ? 'BREAKING-CHANGE: changed behavior.' : '',
		breaking,
	};
}

/** @param {string} notes @param {string[]} expectedLines @returns {MessageStack} */
function missingReleaseNotes(notes, expectedLines) {
	const missingLines = expectedLines.filter((line) => !notes.includes(line));
	return [
		'Missing text in release notes:',
		[missingLines.length > 0 ? missingLines : '(none)'],
		'Actual release notes:',
		['\n' + notes],
	];
}

/** @param {string} notes @param {string[]} forbiddenLines @returns {MessageStack} */
function unexpectedReleaseNotes(notes, forbiddenLines) {
	const unexpectedLines = forbiddenLines.filter((line) => notes.includes(line));
	return [
		'Unexpected text in release notes:',
		[unexpectedLines.length > 0 ? unexpectedLines : '(none)'],
		'Actual release notes:',
		[notes],
	];
}

/** @param {string} text @param {string} search */
function countOccurrences(text, search) {
	return text.split(search).length - 1;
}

/** @param {() => unknown} run @returns {Error} */
function captureError(run) {
	try {
		run();
		return new Error('Expected an error, but none was thrown.');
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}
}

module.exports = {
	run() {
		testPullRequestScript();
		testGitHubWorkflows();
	},
};
