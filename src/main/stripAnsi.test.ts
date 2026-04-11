import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripAnsi } from '../shared/stripAnsi.js';

void describe('stripAnsi', () => {
  void it('removes SGR color codes', () => {
    assert.equal(stripAnsi('\x1b[32mgreen\x1b[0m'), 'green');
  });

  void it('removes bold and reset sequences', () => {
    assert.equal(stripAnsi('\x1b[1mbold\x1b[22m normal'), 'bold normal');
  });

  void it('removes multi-parameter sequences', () => {
    assert.equal(stripAnsi('\x1b[38;5;196mred\x1b[0m'), 'red');
  });

  void it('removes OSC sequences (title set)', () => {
    assert.equal(stripAnsi('\x1b]0;My Title\x07content'), 'content');
  });

  void it('leaves plain text unchanged', () => {
    assert.equal(stripAnsi('hello world'), 'hello world');
  });

  void it('handles empty string', () => {
    assert.equal(stripAnsi(''), '');
  });

  void it('handles mixed ANSI and plain text', () => {
    assert.equal(
      stripAnsi('\x1b[36m✓\x1b[39m 11 tests passed in \x1b[1m2.5s\x1b[22m'),
      '✓ 11 tests passed in 2.5s'
    );
  });
});
