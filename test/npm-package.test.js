// @ts-check
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { assert } = require('./test-framework');
const pkg = require('../package.json');

function testNpmPackage() {
	const npm_packages_the_source_code = 'npm packages the source code';
	const inspecting_the_publishable_artifact =
		'inspecting the publishable artifact';

	/** @type {string | undefined} */
	let packOutput;
	/** @type {string | undefined} */
	let packError;
	try {
		packOutput = npmPackageDryRun();
	} catch (error) {
		packError = error instanceof Error ? error.message : String(error);
	}

	assert({
		should: 'report which files it will publish',
		when: inspecting_the_publishable_artifact,
		run: () => packOutput,
		test: (out) => typeof out === 'string' && parseFilesLength(out) > 0,
		failWith: (out) =>
			packError !== undefined
				? [['npm pack failed:', [packError]]]
				: [
						[
							'Expected string output with files. Got:',
							[String(out).slice(0, 200)],
						],
					],
	});

	function npmPackageDryRun() {
		const npmCacheDir = path.join(__dirname, '.tmp', 'npm-cache');
		fs.mkdirSync(npmCacheDir, { recursive: true });

		return execFileSync(
			'npm',
			['pack', '--dry-run', '--json', '--cache', npmCacheDir],
			{
				cwd: process.cwd(),
				encoding: 'utf8',
			},
		);
	}

	/** @param {string} out */
	function parseFilesLength(out) {
		try {
			const parsed = JSON.parse(out);
			return parsed[0]?.files?.length || 0;
		} catch {
			return 0;
		}
	}

	if (typeof packOutput !== 'string') return;

	/** @typedef {{ path: string }} PackedFile */
	/** @typedef {{ files?: PackedFile[] }} NpmPackEntry */
	/** @type {NpmPackEntry[]} */
	const packResult = JSON.parse(packOutput);
	const publishedFiles = new Set(
		(packResult[0]?.files || []).map((file) => file.path),
	);

	/** @type string[] */
	const declaredFiles = pkg.files || [];
	const alwaysPacked = ['package.json'];

	const repoRoot = path.join(__dirname, '..');
	const directoryPrefixes = declaredFiles.filter((f) => f.endsWith('/'));
	const plainFiles = declaredFiles.filter((f) => !f.endsWith('/'));
	const requiredPlain = [...alwaysPacked, ...plainFiles];

	const missingPlain = requiredPlain.filter(
		(file) => !publishedFiles.has(file),
	);
	// Only require a directory prefix to be packed if it actually exists on
	// disk — npm pack silently drops nonexistent entries, and the scaffold
	// stage may declare forward-looking directories.
	const missingPrefixes = directoryPrefixes
		.filter((prefix) => fs.existsSync(path.join(repoRoot, prefix)))
		.filter(
			(prefix) =>
				![...publishedFiles].some((packed) => packed.startsWith(prefix)),
		);
	const missingEntries = [...missingPlain, ...missingPrefixes];

	const allowedPlain = new Set(requiredPlain);
	const unexpectedFiles = [...publishedFiles].filter(
		(packed) =>
			!allowedPlain.has(packed) &&
			!directoryPrefixes.some((prefix) => packed.startsWith(prefix)),
	);

	assert({
		should: 'pack every entry declared in package.json files',
		when: npm_packages_the_source_code,
		run: () => missingEntries,
		test: (missing) => missing.length === 0,
		failWith: (missing) => [
			['Missing declared entries:', missing],
			['Packed paths:', [...publishedFiles]],
		],
	});

	assert({
		should: 'publish only paths the package.json allowlist permits',
		when: npm_packages_the_source_code,
		run: () => unexpectedFiles,
		test: (unexpected) => unexpected.length === 0,
		failWith: (unexpected) => [
			['Unexpected packed paths (not in allowlist):', unexpected],
			['Allowlist plain:', requiredPlain],
			['Allowlist prefixes:', directoryPrefixes],
		],
	});
}

module.exports = { run: () => testNpmPackage() };
