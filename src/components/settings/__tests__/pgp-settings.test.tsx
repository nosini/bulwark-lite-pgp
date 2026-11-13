import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgpSettings } from '../pgp-settings';

const mv = vi.hoisted(() => ({
  createSettingsContainer: vi.fn(),
  openSettings: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/stores/mailvelope-store', () => {
  const keyring = { identifier: 'k', openSettings: (...a: unknown[]) => mv.openSettings(...a) };
  const state = () => ({
    // What Mailvelope 6.3 exposes: the function exists but always rejects.
    api: { createSettingsContainer: (...a: unknown[]) => mv.createSettingsContainer(...a) },
    keyring,
    version: '6.3.0',
  });
  const hook = (sel?: (s: ReturnType<typeof state>) => unknown) => (typeof sel === 'function' ? sel(state()) : state());
  hook.getState = state;
  return { useMailvelopeStore: hook };
});

vi.mock('@/stores/toast-store', () => ({ toast: { error: mv.toastError, info: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  mv.createSettingsContainer.mockReset().mockRejectedValue(Object.assign(new Error('deprecated'), { code: 'FEATURE_DEPRECATED' }));
  mv.openSettings.mockReset().mockResolvedValue(undefined);
  mv.toastError.mockReset();
});

describe('PgpSettings', () => {
  it('shows the connected version and offers the extension settings, without an embedded frame that cannot load', () => {
    render(<PgpSettings />);
    expect(screen.getByText('status_connected')).toBeInTheDocument();
    expect(screen.getByText('open_settings')).toBeInTheDocument();
    // Mailvelope 6.3 rejects createSettingsContainer unconditionally.
    expect(mv.createSettingsContainer).not.toHaveBeenCalled();
    expect(screen.queryByTestId('pgp-settings-frame')).toBeNull();
  });

  it('opens the extension settings in its own tab', async () => {
    render(<PgpSettings />);
    fireEvent.click(screen.getByText('open_settings'));
    await waitFor(() => expect(mv.openSettings).toHaveBeenCalledTimes(1));
    expect(mv.toastError).not.toHaveBeenCalled();
  });

  it('says so when the settings tab cannot be opened', async () => {
    mv.openSettings.mockRejectedValue(new Error('nope'));
    render(<PgpSettings />);
    fireEvent.click(screen.getByText('open_settings'));
    await waitFor(() => expect(mv.toastError).toHaveBeenCalledWith('open_settings_failed'));
  });
});
