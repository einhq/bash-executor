/**
 * A script that does no I/O still lets the host's event loop run: its timers fire
 * while the script goes on, and an abort they raise stops it.
 */

import { assert, assertEquals } from '@std/assert';
import { TestShell } from './lib/test-shell.ts';

Deno.test('a loop without I/O', async (t) => {
  await t.step('lets a timer fire while it runs', async () => {
    const shell = new TestShell();
    const started = performance.now();
    let firedAfter = Infinity;
    const timer = setTimeout(() => firedAfter = performance.now() - started, 10);

    await shell.executeAndCapture('i=0; while ((i < 100000)); do ((i++)); done');
    clearTimeout(timer);

    assert(firedAfter < 500, `the timer fired after ${firedAfter} ms`);
  });

  await t.step('ends when a timer aborts it', async () => {
    const shell = new TestShell();
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('timed out')), 50);

    const { code, stderr } = await shell.executeAndCapture('while ((1)); do :; done', { signal: controller.signal });
    assertEquals([code, stderr], [1, 'Error: timed out\n']);
  });

  await t.step('ends when a timer aborts a function looping over output', async () => {
    const shell = new TestShell();
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('timed out')), 50);

    const { code, stderr } = await shell.executeAndCapture('f() { while :; do echo x; done; }; f', { signal: controller.signal });
    assertEquals([code, stderr], [1, 'Error: timed out\n']);
  });
});
