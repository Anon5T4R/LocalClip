import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { LOCALE_LABELS, setLocale, t, useLocale, type Locale } from "../lib/i18n";
import { fmtBytes } from "../lib/util";
import { useUi, type Theme } from "../state/ui";

interface StorageInfo {
  dir: string;
  dbBytes: number;
  items: number;
  pinned: number;
  images: number;
  imageBytes: number;
}

/** Qual limpeza o usuário pediu — só confirma depois de ler o que some. */
type StorageConfirm = { kind: "images" } | { kind: "old"; days: number };

/**
 * Configurações: tema, idioma, retenção, bandeja/autostart e dados.
 *
 * O painel de dados existe porque a retenção conta ITENS, não bytes: 500
 * capturas de tela cabem no teto e viram centenas de MB sem nenhum aviso.
 */
export default function SettingsModal() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const locale = useLocale();
  const [retention, setRetention] = useState(500);
  const [autostart, setAutostart] = useState(false);
  const [closeToTray, setCloseToTray] = useState(false);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [confirm, setConfirm] = useState<StorageConfirm | null>(null);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const pushToast = useUi((s) => s.pushToast);

  const loadInfo = () =>
    invoke<StorageInfo>("storage_info").then(setInfo).catch(() => setInfo(null));

  useEffect(() => {
    if (!open) return;
    void invoke<number>("get_retention").then(setRetention).catch(() => {});
    // A intenção mora no back (SQLite): o reconcile de cada boot pode tê-la
    // ajustado (ex.: usuário desligou pelo Gerenciador de Tarefas).
    void invoke<boolean>("autostart_get").then(setAutostart).catch(() => {});
    void invoke<boolean>("close_to_tray_get").then(setCloseToTray).catch(() => {});
    void loadInfo();
  }, [open]);

  if (!open) return null;

  /// Roda a limpeza confirmada e RELÊ o painel: o número precisa cair na tela,
  /// senão o botão parece não ter funcionado.
  const runConfirmed = () => {
    if (!confirm) return;
    setBusy(true);
    const call =
      confirm.kind === "images"
        ? invoke<number>("clear_images_cmd")
        : invoke<number>("clear_old_items", { days: confirm.days });
    call
      .then((n) => {
        pushToast("ok", t("toast.cleaned", { n }));
        setConfirm(null);
        return loadInfo();
      })
      .catch((e) => pushToast("error", t("toast.storageFailed", { error: String(e) })))
      .finally(() => setBusy(false));
  };

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

        {info && (
          <>
            <h3 className="settings-section">{t("settings.storage")}</h3>

            <div className="settings-row storage-path-row">
              <span>{t("settings.storagePath")}</span>
              <div className="storage-path">
                <code title={info.dir}>{info.dir}</code>
                <button
                  onClick={() =>
                    void openPath(info.dir).catch((e) =>
                      pushToast("error", t("toast.storageFailed", { error: String(e) })),
                    )
                  }
                >
                  {t("settings.storageOpen")}
                </button>
              </div>
            </div>

            <div className="settings-row">
              <span>{t("settings.storageSize")}</span>
              <span>
                <strong>{fmtBytes(info.dbBytes)}</strong>
                <span className="muted small settings-hint">
                  {t("settings.storageCounts", {
                    n: info.items,
                    pinned: info.pinned,
                    images: info.images,
                    imgSize: fmtBytes(info.imageBytes),
                  })}
                </span>
              </span>
            </div>

            <div className="settings-row">
              <span>
                {t("settings.clearImages")}
                <span className="muted small settings-hint">{t("settings.clearImagesHint")}</span>
              </span>
              <button
                disabled={busy || info.images === 0}
                onClick={() => setConfirm({ kind: "images" })}
              >
                {t("dlg.clear")}
              </button>
            </div>

            <div className="settings-row">
              <span>
                {t("settings.deleteOld")}
                <span className="muted small settings-hint">{t("settings.deleteOldHint")}</span>
              </span>
              <div className="storage-old">
                <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {[7, 30, 90, 180].map((d) => (
                    <option key={d} value={d}>
                      {t("settings.days", { n: d })}
                    </option>
                  ))}
                </select>
                <button
                  className="danger"
                  disabled={busy || info.items === info.pinned}
                  onClick={() => setConfirm({ kind: "old", days })}
                >
                  {t("dlg.delete")}
                </button>
              </div>
            </div>
          </>
        )}

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

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p>
              {confirm.kind === "images"
                ? t("settings.clearImagesConfirm", { n: info?.images ?? 0 })
                : t("settings.deleteOldConfirm", { days: confirm.days })}
            </p>
            <div className="modal-actions">
              <button disabled={busy} onClick={() => setConfirm(null)}>
                {t("dlg.cancel")}
              </button>
              <button className="danger" disabled={busy} onClick={runConfirmed}>
                {t("dlg.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
