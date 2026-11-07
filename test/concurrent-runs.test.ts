/**
 * Runs going on at once in one executor, as a host's command that runs scripts in parallel
 * makes them: each keeps its own source, and the one around them keeps its own after.
 */

import { assertEquals } from '@std/assert';
import type { ExecCommandOptions, ExecContextIf } from '../mod.ts';
import { TestShell } from './lib/test-shell.ts';

/** A shell whose `wait-for NAME` command returns once the test opens that gate. */
class GatedShell extends TestShell {
  private gates = new Map<string, PromiseWithResolvers<void>>();

  gate(name: string): PromiseWithResolvers<void> {
    if (!this.gates.has(name)) this.gates.set(name, Promise.withResolvers());
    return this.gates.get(name)!;
  }

  override async execute(ctx: ExecContextIf, name: string, args: string[], opts: ExecCommandOptions): Promise<number> {
    if (name !== 'wait-for') return await super.execute(ctx, name, args, opts);
    await this.gate(args[0]).promise;
    return 0;
  }
}

Deno.test('runs at once in one executor', async (t) => {
  await t.step('a function defined in each takes its body from its own source', async () => {
    const shell = new GatedShell();
    const a = shell.executeAndCapture('wait-for a; fa() { echo from-a; }; declare -f fa');
    const b = shell.executeAndCapture('wait-for b; fb() { echo from-b; }; declare -f fb');

    // a goes on while b, which started after it, is still running
    shell.gate('a').resolve();
    assertEquals((await a).stdout, 'fa () \n{ \n    echo from-a\n}\n');
    shell.gate('b').resolve();
    assertEquals((await b).stdout, 'fb () \n{ \n    echo from-b\n}\n');
  });

  await t.step('a run keeps its source when two that started after it end in the order they started', async () => {
    const shell = new GatedShell();
    const outer = shell.executeAndCapture('wait-for go; fo() { echo outer; }; declare -f fo');
    const first = shell.executeAndCapture('wait-for one; true');
    const second = shell.executeAndCapture('wait-for two; true');

    shell.gate('one').resolve();
    await first;
    shell.gate('two').resolve();
    await second;
    shell.gate('go').resolve();
    assertEquals((await outer).stdout, 'fo () \n{ \n    echo outer\n}\n');
  });
});
