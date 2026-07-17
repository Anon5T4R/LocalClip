import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LOCALE_LABELS, setLocale, t, useLocale, type Locale } from "../lib/i18n";
import { useUi, type Theme } from "../state/ui";

/** Configurações: tema, idioma, retenção do histórico, bandeja e autostart. */
export default function SettingsModal() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const locale = useLocale();
  const [retention, setRetention] = useState(500);
  const [autostart, setAutostart] = useState(false);
  const [closeToTray, setCloseToTray] = useState(false);

  useEffect(() => {
    if (!open) return;
    void invoke<number>("get_retention").then(setRetention).catch(() => {});
    // A intenção mora no back (SQLite): o reconcile de cada boot pode tê-la
    // ajustado (ex.: usuário desligou pelo Gerenciador de Tarefas).
    void invoke<boolean>("autostart_get").then(setAutostart).catch(() => {});
    void invoke<boolean>("close_to_tray_get").then(setCloseToTray).catch(() => {});
  }, [open]);

  if (!open) return null;

  const commitRetention = (v: number) => {
    const clamped = Math.min(5000, Math.max(10, Math.round(v) || 500));
    setRetention(clamped);
    void invoke("set_retention", { value: clamped }).catch(() => {});
  };

  const toggleAutostart = (v: boolean) => {
    setAutostart(v);
    void invoke("autostart_set", { enabled: v }).catch(() => setAutostart(!v));
  };

  const toggleCloseToTray = (v: boolean) => {
    setCloseToTray(v);
    void invoke("close_to_tray_set", { enabled: v }).catch(() => setCloseToTray(!v));
  };

  const themes: { value: Theme; label: string }[] = [
    { value: "system", label: t("settings.themeSystem") },
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
    { value: "nature", label: t("settings.themeNature") },
    { value: "darkblue", label: t("settings.themeDarkBlue") },
    { value: "calmgreen", label: t("settings.themeCalmGreen") },
    { value: "pastelpink", label: t("settings.themePastelPink") },
    { value: "punkprincess", label: t("settings.themePunkPrincess") },
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

        <div className="settings-row">
          <span>{t("settings.closeToTray")}</span>
          <input
            type="checkbox"
            checked={closeToTray}
            onChange={(e) => toggleCloseToTray(e.target.checked)}
          />
        </div>

        <div className="settings-row">
          <span>{t("settings.autostart")}</span>
          <input
            type="checkbox"
            checked={autostart}
            onChange={(e) => toggleAutostart(e.target.checked)}
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
