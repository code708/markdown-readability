const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function testPackageSurface() {
	const npmCacheDir = path.join(__dirname, '.tmp', 'npm-cache');

	fs.mkdirSync(npmCacheDir, { recursive: true });

	/** @type {string} */
	let packOutput;

	try {
		packOutput = execFileSync(
			'npm',
			['pack', '--dry-run', '--json', '--cache', npmCacheDir],
			{
				cwd: process.cwd(),
				encoding: 'utf8',
			},
		);
	} catch (error) {
		console.log('✗ FAIL: package publish surface can be inspected');
		console.log(`  ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}

	/** @typedef {{ path: string }} PackedFile */
	/** @typedef {{ files?: PackedFile[] }} NpmPackEntry */
	/** @type {NpmPackEntry[]} */
	const packResult = JSON.parse(packOutput);
	const publishedFiles = new Set(
		(packResult[0]?.files || []).map((file) => file.path),
	);

	const requiredFiles = ['package.json', 'index.js', 'README.md', 'LICENSE'];
	const forbiddenFiles = [
		'.claude/settings.local.json',
		'.markdownlint.json',
		'.prettierignore',
		'.prettierrc.yaml',
		'CONTRIBUTING.md',
		'CHANGELOG.md',
		'demo.js',
		'jsconfig.json',
	];

	const missingFiles = requiredFiles.filter(
		(file) => !publishedFiles.has(file),
	);
	const leakedFiles = forbiddenFiles.filter((file) => publishedFiles.has(file));

	if (missingFiles.length === 0 && leakedFiles.length === 0) {
		console.log('✓ PASS: package publish surface is curated');
		return true;
	}

	console.log('✗ FAIL: package publish surface is curated');
	if (missingFiles.length > 0) {
		console.log(`\n    Missing required files: ${missingFiles.join(', ')}`);
	}
	if (leakedFiles.length > 0) {
		console.log(`\n    Leaked repo-only files: ${leakedFiles.join(', ')}`);
	}
	return false;
}

module.exports = { testPackageSurface };
