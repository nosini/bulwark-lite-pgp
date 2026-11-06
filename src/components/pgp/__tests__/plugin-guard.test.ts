import { describe, expect, it, vi } from 'vitest';
import type { ComposerHandle } from '@/lib/plugin-sandbox/composer-registry';
import { withoutPgpAccess } from '@/components/pgp/plugin-guard';

function fakeHandle(): ComposerHandle {
  return {
    readMetadata: vi.fn(() => ({ subject: 'secret', to: ['bob@example.com'], attachments: [{ id: 'a', name: 'a.txt', type: 'text/plain', size: 1 }] })),
    readAttachment: vi.fn(async () => ({ name: 'a.txt', type: 'text/plain', size: 1, data: new ArrayBuffer(1) })),
    readBody: vi.fn(() => ({ html: '<p>secret</p>', text: 'secret' })),
    readSelection: vi.fn(() => ({ html: '<p>s</p>', text: 's', empty: false })),
    replaceBody: vi.fn(() => true),
    replaceSelection: vi.fn(() => true),
    attach: vi.fn(async () => true),
    attachFile: vi.fn(async () => true),
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
    expect(guarded.readMetadata!().subject).toBe('secret');
    await expect(guarded.readAttachment!('a')).resolves.toMatchObject({ name: 'a.txt' });
    await expect(guarded.attachFile!({} as never)).resolves.toBe(true);
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
    expect(guarded.readMetadata!()).toEqual({ subject: '', to: [], cc: [], bcc: [], attachments: [] });
    await expect(guarded.readAttachment!('a')).rejects.toThrow('attachment_unavailable');
    await expect(guarded.attachFile!({} as never)).resolves.toBe(false);
    expect(handle.readBody).not.toHaveBeenCalled();
    expect(handle.readMetadata).not.toHaveBeenCalled();
    expect(handle.readAttachment).not.toHaveBeenCalled();
    expect(handle.attachFile).not.toHaveBeenCalled();
    expect(handle.replaceBody).not.toHaveBeenCalled();
    expect(handle.attach).not.toHaveBeenCalled();
  });

  it('leaves out what the composer does not offer', () => {
    const { readMetadata: _m, readAttachment: _a, attachFile: _f, ...older } = fakeHandle();
    const guarded = withoutPgpAccess({ current: false }, older);
    expect(guarded.readMetadata).toBeUndefined();
    expect(guarded.readAttachment).toBeUndefined();
    expect(guarded.attachFile).toBeUndefined();
  });
});
