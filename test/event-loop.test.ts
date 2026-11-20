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

  await t.step('holds the event loop for no step of using a value of millions of characters', async () => {
    const shell = new TestShell();
    let longest = 0;
    let last = performance.now();
    const ticks = setInterval(() => {
      longest = Math.max(longest, performance.now() - last);
      last = performance.now();
    }, 5);

    const { stdout } = await shell.executeAndCapture('s=x; for i in {1..23}; do s=$s$s; done; t=$s; : "$s"; : $s; : x"$s"*; [[ $s == *y ]]; a=("$s"); echo ${#s}');
    clearInterval(ticks);

    assertEquals(stdout, '8388608\n');
    assert(longest < 1000, `the longest step held it ${Math.round(longest)} ms`);
  });
});
