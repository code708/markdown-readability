const fs = require('fs');
const path = require('path');

function testConsumerDocsConsistency() {
	const readmePath = path.join(__dirname, '..', 'README.md');
	const demoPath = path.join(__dirname, '..', 'demo.js');
	const readme = fs.readFileSync(readmePath, 'utf8');
	const demo = fs.readFileSync(demoPath, 'utf8');
	const failures = [];

	if (!readme.includes('(doc/rules-overview.md)')) {
		failures.push('README should link to doc/rules-overview.md');
	}

	if (!readme.includes('--rules @code708/markdown-readability')) {
		failures.push(
			'README should show markdownlint-cli usage with the package name',
		);
	}

	if (
		!readme.includes('The published npm package only includes runtime files')
	) {
		failures.push(
			'README should explain that docs and examples are repo-only under the lean runtime package policy',
		);
	}

	if (readme.includes('violations.md')) {
		failures.push('README should not reference example/violations.md');
	}

	if (!readme.includes('violates.md')) {
		failures.push('README should reference example/violates.md');
	}

	if (!demo.includes("path.join(__dirname, 'example', 'violates.md')")) {
		failures.push('demo.js should use example/violates.md');
	}

	if (!fs.existsSync(path.join(__dirname, '..', 'doc', 'rules-overview.md'))) {
		failures.push('doc/rules-overview.md should exist');
	}

	if (!fs.existsSync(path.join(__dirname, '..', 'example', 'violates.md'))) {
		failures.push('example/violates.md should exist');
	}

	if (!fs.existsSync(path.join(__dirname, '..', 'example', 'correct.md'))) {
		failures.push('example/correct.md should exist');
	}

	if (failures.length === 0) {
		console.log('✓ PASS: consumer docs and examples are internally consistent');
		return true;
	} else {
		console.log('✗ FAIL: consumer docs and examples are internally consistent');
		failures.forEach((failure) => console.log(`\n    ${failure}`));
		return false;
	}
}

module.exports = { testConsumerDocsConsistency };
