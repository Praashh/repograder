import assert from 'assert';
import { c, stripAnsi, stringWidth } from '../src/ui/colors';
import { renderBox, renderDivider } from '../src/ui/box';
import {
  renderScoreMeter,
  renderProgressBar,
  renderGradePill,
  renderStatusIcon,
  renderScorePill,
} from '../src/ui/meter';
import { renderCompactText } from '../src/report';
import { runAll } from '../src/score';
import path from 'path';

// 1. Test stripAnsi & stringWidth
const styled = c.bold(c.red('Hello World'));
assert.strictEqual(stripAnsi(styled), 'Hello World');
assert.strictEqual(stringWidth(styled), 11);

// Wide emoji handling
const withEmoji = '🚀 Launch';
assert.strictEqual(stringWidth(withEmoji), 9); // 2 columns for rocket + 7 for ' Launch'

// 2. Test renderBox
const box = renderBox(['Line 1', 'Longer line 2'], {
  title: 'TEST BOX',
  style: 'rounded',
  padding: 1,
});
assert.ok(box.includes('TEST BOX'), 'box contains title');
assert.ok(box.includes('╭'), 'box contains top-left rounded corner');
assert.ok(box.includes('╰'), 'box contains bottom-left rounded corner');
assert.ok(box.includes('Line 1'), 'box contains content line 1');

// Test divider
const divider = renderDivider('SECTION');
assert.ok(divider.includes('SECTION'), 'divider contains section title');

// 3. Test meters and pills
const meter5 = renderScoreMeter(5);
assert.ok(stripAnsi(meter5).includes('■■■■■'), '5/5 meter has 5 filled blocks');

const meter3 = renderScoreMeter(3);
assert.ok(stripAnsi(meter3).includes('■■■□□'), '3/5 meter has 3 filled, 2 empty');

const progress = renderProgressBar(90, 100, 10);
assert.ok(stripAnsi(progress).includes('■'), 'progress bar has filled segment');

const pill = renderScorePill(4, 5);
assert.ok(stripAnsi(pill).includes('4/5'), 'score pill contains 4/5');

const gradePill = renderGradePill('A+');
assert.ok(stripAnsi(gradePill).includes('A+'), 'grade pill contains A+');

const icon = renderStatusIcon(5);
assert.ok(stripAnsi(icon).includes('✔'), 'status icon for 5 is checkmark');

// 4. Test renderCompactText
const repoRoot = path.resolve(__dirname, '../..');
const result = runAll(repoRoot);
const compactOutput = renderCompactText(result, repoRoot);
assert.ok(compactOutput.includes('repograder'), 'compact output includes repograder');
assert.ok(compactOutput.includes('Index:'), 'compact output includes Index');
assert.ok(compactOutput.includes('tests:'), 'compact output includes dimensions');

console.log('UI unit tests passed.');
