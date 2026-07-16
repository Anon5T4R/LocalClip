import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LOCALE_LABELS, setLocale, t, useLocale, type Locale } from "../lib/i18n";
import { useUi, type Theme } from "../state/ui";

/** Configurações: tema, idioma e retenção do histórico. */
export default function SettingsModal() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const locale = useLocale();
  const [retention, setRetention] = useState(500);

  useEffect(() => {
    if (open) void invoke<number>("get_retention").then(setRetention).catch(() => {});
  }, [open]);

  if (!open) return null;

  const commitRetention = (v: number) => {
    const clamped = Math.min(5000, Math.max(10, Math.round(v) || 500));
    setRetention(clamped);
    void invoke("set_retention", { value: clamped }).catch(() => {});
  };

  const themes: { value: Theme; label: string }[] = [
    { value: "system", label: t("settings.themeSystem") },
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
  ];

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("settings.title")}</h2>

        <div className="settings-row">
          <span>{t("settings.theme")}</span>
          <div className="segmented">
            {themes.map((th) => (
              <button
                key={th.value}
                className={theme === th.value ? "active" : ""}
                onClick={() => setTheme(th.value)}
              >
                {th.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <span>{t("settings.language")}</span>
          <div className="segmented">
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
              <button key={l} className={locale === l ? "active" : ""} onClick={() => setLocale(l)}>
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <span>{t("settings.retention")}</span>
          <input
            type="number"
            min={10}
            max={5000}
            step={50}
            value={retention}
            style={{ width: 90 }}
            onChange={(e) => setRetention(Number(e.target.value))}
            onBlur={(e) => commitRetention(Number(e.target.value))}
          />
        </div>

        <p className="muted about">
          <strong>LocalClip</strong>
          {t("settings.about")}
        </p>
        <p className="muted about">{t("settings.privacy")}</p>
        <p className="muted about">{t("settings.shortcut")}</p>

        <div className="modal-actions">
          <button className="primary" onClick={() => setOpen(false)}>
            {t("dlg.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
