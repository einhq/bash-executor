/**
 * A variable holds at most the context's value limit: an assignment past it
 * aborts its command, where bash would run the process out of memory.
 */

import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { DEFAULT_VALUE_LIMIT } from '../mod.ts';
import { TestShell } from './lib/test-shell.ts';

Deno.test('the value limit', async (t) => {
  await t.step('is 16 Mi characters unless the host sets one', () => {
    assertEquals(new TestShell().ctx.getValueLimit(), DEFAULT_VALUE_LIMIT);
    assertEquals(DEFAULT_VALUE_LIMIT, 16 * 1024 * 1024);
  });

  for (
    const [what, script] of [
      ['a string that doubles', 's=x; while :; do s=$s$s; done'],
      ['a string appended to', 's=0123456789; while :; do s+=$s; done'],
      ['printf -v', 's=x; while :; do printf -v s %s%s "$s" "$s"; done'],
      ['an array that doubles', 'a=(x); while :; do a=("${a[@]}" "${a[@]}"); done'],
      ['an array appended to', 'a=(x); while :; do a+=("${a[@]}"); done'],
      ['an array element', 'a=(x); while :; do a[1]=${a[1]}${a[1]}x; done'],
      ['an associative array', 'declare -A h=([k]=x); while :; do h[k]=${h[k]}${h[k]}; done'],
      ['a local', 'f() { local s=x; while :; do s=$s$s; done; }; f'],
    ]
  ) {
    await t.step(`ends ${what} that grows past it, and the script goes on`, async () => {
      const shell = new TestShell();
      shell.ctx.setValueLimit(1024 * 1024);
      const { code, stdout, stderr } = await shell.executeAndCapture(`${script}\necho next`);
      assertEquals([code, stdout], [0, 'next\n']);
      assertStringIncludes(stderr, 'value too large');
      assertStringIncludes(stderr, 'more than 1048576');
    });
  }

  await t.step('lets a value up to it be', async () => {
    const shell = new TestShell();
    shell.ctx.setValueLimit(16);
    shell.ctx.setValueLimit(48);
    const { stdout, stderr } = await shell.executeAndCapture('s=0123456789abcdef0123456789abcdef0123456789abcdef; a=(0123456789abcdef); echo ${#s} ${#a[@]}');
    assertEquals([stdout, stderr], ['48 1\n', '']);
  });

  await t.step('counts what each element costs over its characters', async () => {
    const shell = new TestShell();
    shell.ctx.setValueLimit(48);
    const { stderr } = await shell.executeAndCapture('a=(1 2 3)');
    assertStringIncludes(stderr, 'a: value too large: 51 characters, more than 48');
  });

  await t.step('holds in a subshell and a command substitution', async () => {
    const shell = new TestShell();
    shell.ctx.setValueLimit(16);
    const { stderr } = await shell.executeAndCapture('(s=01234567890123456); x=$(s=01234567890123456; echo y)');
    assertEquals(stderr.match(/value too large/g)?.length, 2);
  });

  await t.step('a word that would split into more than a million fields aborts its command, quoted it is one', async () => {
    const shell = new TestShell();
    const started = performance.now();
    const { stdout, stderr } = await shell.executeAndCapture(
      's=$(printf "%1200000s" ""); s=${s// /x }; set -- $s; echo "<$#>"\nset -- "$s" ${s:0:20}; echo "<$#>"',
    );
    assertStringIncludes(stderr, 'expands to more than 1000000 words');
    // The rest of its line is dropped, as for any aborted command
    assertEquals(stdout, '<11>\n');
    assert(performance.now() - started < 20_000, `${performance.now() - started} ms`);
  });
});
