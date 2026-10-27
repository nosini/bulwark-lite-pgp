import { describe, expect, it, vi } from 'vitest';
import type { ComposerHandle } from '@/lib/plugin-sandbox/composer-registry';
import { withoutPgpAccess } from '@/components/pgp/plugin-guard';

function fakeHandle(): ComposerHandle {
  return {
    readBody: vi.fn(() => ({ html: '<p>secret</p>', text: 'secret' })),
    readSelection: vi.fn(() => ({ html: '<p>s</p>', text: 's', empty: false })),
    replaceBody: vi.fn(() => true),
    replaceSelection: vi.fn(() => true),
    attach: vi.fn(async () => true),
  };
}

describe('withoutPgpAccess', () => {
  it('passes every call through while PGP is off', async () => {
    const handle = fakeHandle();
    const guarded = withoutPgpAccess({ current: false }, handle);
    expect(guarded.readBody()).toEqual({ html: '<p>secret</p>', text: 'secret' });
    expect(guarded.readSelection().empty).toBe(false);
    expect(guarded.replaceBody('<p>x</p>', 'x')).toBe(true);
    expect(guarded.replaceSelection('<p>x</p>', 'x', { below: false })).toBe(true);
    await expect(guarded.attach({} as never)).resolves.toBe(true);
  });

  it('reads nothing and changes nothing while the encrypted editor is open', async () => {
    const handle = fakeHandle();
    const active = { current: false };
    const guarded = withoutPgpAccess(active, handle);
    active.current = true;
    expect(guarded.readBody()).toEqual({ html: '', text: '' });
    expect(guarded.readSelection()).toEqual({ html: '', text: '', empty: true });
    expect(guarded.replaceBody('<p>x</p>', 'x')).toBe(false);
    expect(guarded.replaceSelection('<p>x</p>', 'x', { below: true })).toBe(false);
    await expect(guarded.attach({} as never)).resolves.toBe(false);
    expect(handle.readBody).not.toHaveBeenCalled();
    expect(handle.replaceBody).not.toHaveBeenCalled();
    expect(handle.attach).not.toHaveBeenCalled();
  });
});
