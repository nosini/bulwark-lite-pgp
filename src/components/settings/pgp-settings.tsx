"use client";

import { useTranslations } from 'next-intl';
import { ShieldCheck } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useMailvelopeStore } from '@/stores/mailvelope-store';
import { toast } from '@/stores/toast-store';
import { SettingsSection } from './settings-section';

/**
 * Key management for the Mailvelope extension. Keys are generated, imported
 * and stored in the extension's own settings page, which opens in a new tab:
 * the embeddable settings container was retired in Mailvelope 6.1, and 6.3
 * rejects every call to it with FEATURE_DEPRECATED. Only shown while
 * Mailvelope is available, so it never renders for users without the extension.
 */
export function PgpSettings() {
  const t = useTranslations('settings.pgp');
  const keyring = useMailvelopeStore((s) => s.keyring);
  const version = useMailvelopeStore((s) => s.version);

  const openSettings = async () => {
    try {
      await keyring?.openSettings();
    } catch {
      toast.error(t('open_settings_failed'));
    }
  };

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <p className="flex items-center gap-2 text-sm text-foreground">
        <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
        {version ? t('status_connected', { version }) : t('status_connected_no_version')}
      </p>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">{t('keys_title')}</h4>
        <p className="text-sm text-muted-foreground">{t('keys_description')}</p>
        <Button variant="outline" size="sm" onClick={openSettings} disabled={!keyring}>
          {t('open_settings')}
        </Button>
      </div>

      <div className="space-y-1">
        <h4 className="text-sm font-medium text-foreground">{t('limits_title')}</h4>
        <p className="text-sm text-muted-foreground">{t('limits_body')}</p>
      </div>
    </SettingsSection>
  );
}
