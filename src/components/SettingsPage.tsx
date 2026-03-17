import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LANGUAGES } from "../i18n";
import { useLang } from "../LangContext";

interface DependencyStatus {
  ffmpeg: boolean;
  python: boolean;
  faster_whisper: boolean;
}

interface GpuInfo {
  available: boolean;
  gpu_type: string; // "nvidia" | "amd" | "none"
  name: string | null;
  libs_installed: boolean;
  cmake_installed: boolean;
  vulkan_dev_installed: boolean;
}

interface SettingsPageProps {
  onContinue: () => void;
  isFirstRun: boolean;
}

export default function SettingsPage({ onContinue, isFirstRun }: SettingsPageProps) {
  const { lang, setLang, t } = useLang();
  const [deps, setDeps] = useState<DependencyStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState("");
  const [installError, setInstallError] = useState("");
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [installingCuda, setInstallingCuda] = useState(false);
  const [cudaMsg, setCudaMsg] = useState("");
  const [cudaError, setCudaError] = useState("");
  const [installingSystemDeps, setInstallingSystemDeps] = useState(false);
  const [systemDepsMsg, setSystemDepsMsg] = useState("");
  const [systemDepsError, setSystemDepsError] = useState("");

  useEffect(() => {
    checkDeps();
  }, []);

  async function checkDeps() {
    setChecking(true);
    try {
      const [status, gpuInfo] = await Promise.all([
        invoke<DependencyStatus>("check_dependencies"),
        invoke<GpuInfo>("detect_gpu"),
      ]);
      setDeps(status);
      setGpu(gpuInfo);
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }

  async function handleInstallFasterWhisper() {
    setInstalling(true);
    setInstallMsg("");
    setInstallError("");
    try {
      const result = await invoke<string>("install_dependencies");
      setInstallMsg(result);
      setTimeout(() => checkDeps(), 1500);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  }

  async function handleInstallSystemDeps() {
    setInstallingSystemDeps(true);
    setSystemDepsMsg("");
    setSystemDepsError("");
    try {
      const result = await invoke<string>("install_amd_system_deps");
      setSystemDepsMsg(result);
      setTimeout(() => checkDeps(), 1500);
    } catch (err) {
      setSystemDepsError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingSystemDeps(false);
    }
  }

  async function handleInstallGpuLibs() {
    setInstallingCuda(true);
    setCudaMsg("");
    setCudaError("");
    try {
      const cmd = gpu?.gpu_type === "amd" ? "install_vulkan_dependencies" : "install_cuda_dependencies";
      const result = await invoke<string>(cmd);
      setCudaMsg(result);
      setTimeout(() => checkDeps(), 1500);
    } catch (err) {
      setCudaError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingCuda(false);
    }
  }

  const allOk = deps?.ffmpeg && deps?.python && deps?.faster_whisper;

  return (
    <div className="settings-page">
      {!isFirstRun && (
        <button type="button" className="settings-page__back" onClick={onContinue}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t("history.back")}
        </button>
      )}

      <h2 className="settings-page__title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        {t("settings.title")}
      </h2>

      {/* Language section */}
      <div className="settings-page__section">
        <label className="settings-page__label">{t("settings.language")}</label>
        <div className="settings-page__lang-grid">
          {LANGUAGES.map((l) => (
            <button
              key={l.value}
              type="button"
              className={`settings-page__lang-btn ${lang === l.value ? "settings-page__lang-btn--active" : ""}`}
              onClick={() => setLang(l.value)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dependencies section */}
      <div className="settings-page__section">
        <div className="settings-page__section-header">
          <label className="settings-page__label">{t("settings.deps")}</label>
          <button
            type="button"
            className="settings-page__recheck"
            onClick={checkDeps}
            disabled={checking}
          >
            {checking ? (
              <span className="spinner spinner--small" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            )}
            {t("deps.recheck")}
          </button>
        </div>

        {checking && !deps ? (
          <div className="settings-page__checking">
            <span className="spinner" />
            <span>{t("deps.checking")}</span>
          </div>
        ) : deps ? (
          <div className="settings-page__deps-list">
            <DepItem name="FFmpeg" ok={deps.ffmpeg} hint={!deps.ffmpeg ? t("deps.ffmpeg.hint") : undefined} />
            <DepItem name="Python 3" ok={deps.python} hint={!deps.python ? t("deps.python.hint") : undefined} />
            <DepItem
              name="faster-whisper"
              ok={deps.faster_whisper}
              hint={
                !deps.faster_whisper && deps.python
                  ? t("deps.whisper.hint")
                  : !deps.faster_whisper && !deps.python
                    ? t("deps.whisper.needPython")
                    : undefined
              }
              canInstall={deps.python}
              installing={installing}
              onInstall={handleInstallFasterWhisper}
              installLabel={installing ? t("deps.installing") : (deps.faster_whisper ? t("deps.update") : t("deps.install"))}
            />
          </div>
        ) : null}

        {installMsg && (
          <div className="deps-success">
            <p>{installMsg}</p>
          </div>
        )}

        {installError && (
          <div className="error-banner error-banner--compact">
            <p>{installError}</p>
          </div>
        )}
      </div>

      {/* GPU section */}
      <div className="settings-page__section">
        <label className="settings-page__label">{t("gpu.title")}</label>
        {gpu?.available ? (
          <div className="settings-page__deps-list">
            <div className="settings-dep settings-dep--ok">
              <div className="settings-dep__status">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="settings-dep__icon--ok">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="settings-dep__info">
                <span className="settings-dep__name">{gpu.name}</span>
                <span className="settings-dep__hint">
                  {gpu.gpu_type === "nvidia" ? t("gpu.detected") : "AMD GPU detectada"}
                </span>
              </div>
            </div>

            {gpu.gpu_type === "amd" && (
              <DepItem
                name={t("gpu.systemDeps")}
                ok={gpu.cmake_installed && gpu.vulkan_dev_installed}
                hint={t("gpu.systemDeps.hint")}
                canInstall
                installing={installingSystemDeps}
                onInstall={handleInstallSystemDeps}
                installLabel={installingSystemDeps
                  ? t("gpu.installingSystemDeps")
                  : (gpu.cmake_installed && gpu.vulkan_dev_installed ? t("gpu.updateSystemDeps") : t("gpu.installSystemDeps"))
                }
              />
            )}

            {gpu.gpu_type === "nvidia" && (
              <DepItem
                name={t("gpu.cudaLibs")}
                ok={gpu.libs_installed}
                hint={!gpu.libs_installed ? t("gpu.cudaLibs.hint") : undefined}
                canInstall
                installing={installingCuda}
                onInstall={handleInstallGpuLibs}
                installLabel={installingCuda ? t("gpu.installingCuda") : (gpu.libs_installed ? t("gpu.updateCuda") : t("gpu.installCuda"))}
              />
            )}

            {gpu.gpu_type === "amd" && (
              <DepItem
                name="pywhispercpp (Vulkan)"
                ok={gpu.libs_installed}
                hint={!gpu.libs_installed ? t("gpu.cudaLibs.hint") : undefined}
                canInstall={gpu.cmake_installed && gpu.vulkan_dev_installed}
                installing={installingCuda}
                onInstall={handleInstallGpuLibs}
                installLabel={installingCuda ? t("gpu.installingVulkan") : (gpu.libs_installed ? t("gpu.updateVulkan") : t("gpu.installVulkan"))}
              />
            )}
          </div>
        ) : (
          <div className="settings-dep settings-dep--neutral">
            <div className="settings-dep__status">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="settings-dep__icon--neutral">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div className="settings-dep__info">
              <span className="settings-dep__name">{t("gpu.notDetected")}</span>
            </div>
          </div>
        )}

        {systemDepsMsg && (
          <div className="deps-success">
            <p>{systemDepsMsg}</p>
          </div>
        )}

        {systemDepsError && (
          <div className="error-banner error-banner--compact">
            <p>{systemDepsError}</p>
          </div>
        )}

        {cudaMsg && (
          <div className="deps-success">
            <p>{cudaMsg}</p>
          </div>
        )}

        {cudaError && (
          <div className="error-banner error-banner--compact">
            <p>{cudaError}</p>
          </div>
        )}
      </div>

      {/* Continue button */}
      <button
        type="button"
        className="btn-transcribe settings-page__continue"
        onClick={onContinue}
        disabled={!allOk}
      >
        {isFirstRun ? t("settings.start") : t("settings.save")}
      </button>

      {!allOk && (
        <p className="settings-page__hint">{t("settings.depsRequired")}</p>
      )}
    </div>
  );
}

function DepItem({
  name,
  ok,
  hint,
  canInstall,
  installing,
  onInstall,
  installLabel,
}: {
  name: string;
  ok: boolean;
  hint?: string;
  canInstall?: boolean;
  installing?: boolean;
  onInstall?: () => void;
  installLabel?: string;
}) {
  return (
    <div className={`settings-dep ${ok ? "settings-dep--ok" : "settings-dep--missing"}`}>
      <div className="settings-dep__status">
        {ok ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="settings-dep__icon--ok">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="settings-dep__icon--missing">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
      </div>
      <div className="settings-dep__info">
        <span className="settings-dep__name">{name}</span>
        {hint && <span className="settings-dep__hint">{hint}</span>}
      </div>
      {canInstall && onInstall && (
        <button
          type="button"
          className="settings-dep__install"
          onClick={onInstall}
          disabled={installing}
        >
          {installing && <span className="spinner spinner--small" />}
          {installLabel}
        </button>
      )}
    </div>
  );
}
