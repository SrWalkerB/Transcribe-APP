import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import VideoUploader from "./components/VideoUploader";
import TranscriptionResult from "./components/TranscriptionResult";
import TranscriptionHistory, { saveToHistory, type HistoryEntry } from "./components/TranscriptionHistory";
import SettingsPage from "./components/SettingsPage";
import { t as translate, type Lang } from "./i18n";
import { LangContext } from "./LangContext";
import "./App.css";

type AppState = "settings" | "idle" | "loading" | "done" | "error" | "history";
type TranscribeStep = "audio" | "text" | null;

interface ProgressPayload {
  progress: number;
  text: string;
  full_text: string;
}

function App() {
  const [state, setState] = useState<AppState>("settings");
  const [isFirstRun, setIsFirstRun] = useState(true);
  const [step, setStep] = useState<TranscribeStep>(null);
  const [transcription, setTranscription] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [detectedLang, setDetectedLang] = useState("");
  const [isPartial, setIsPartial] = useState(false);
  const [droppedFile, setDroppedFile] = useState<{ path: string; displayName: string; duration?: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem("transcribe-lang") as Lang) || "pt-BR";
  });
  const liveTextRef = useRef<HTMLDivElement>(null);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("transcribe-lang", newLang);
  }, []);

  const t = useCallback(
    (key: Parameters<typeof translate>[0]) => translate(key, lang),
    [lang]
  );

  const langContextValue = useMemo(
    () => ({ lang, setLang, t }),
    [lang, setLang, t]
  );

  useEffect(() => {
    const unlistenStep = listen<string>("transcribe-step", (event) => {
      if (event.payload === "audio" || event.payload === "text") {
        setStep(event.payload);
      }
    });

    const unlistenProgress = listen<ProgressPayload>("transcribe-progress", (event) => {
      setProgress(event.payload.progress);
      setLiveText(event.payload.full_text);
    });

    const unlistenLang = listen<string>("transcribe-lang", (event) => {
      setDetectedLang(event.payload);
    });

    return () => {
      unlistenStep.then((fn) => fn());
      unlistenProgress.then((fn) => fn());
      unlistenLang.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (liveTextRef.current) {
      liveTextRef.current.scrollTop = liveTextRef.current.scrollHeight;
    }
  }, [liveText]);

  // Tauri native drag-drop: provides actual file paths
  const ACCEPTED_EXTENSIONS = ["mp4", "mkv", "avi", "mov", "webm"];
  useEffect(() => {
    const webview = getCurrentWebview();
    const unlisten = webview.onDragDropEvent(async (event) => {
      if (event.payload.type === "over") {
        setDragOver(true);
      } else if (event.payload.type === "leave") {
        setDragOver(false);
      } else if (event.payload.type === "drop") {
        setDragOver(false);
        const paths = event.payload.paths;
        if (paths.length > 0) {
          const path = paths[0];
          const ext = path.split(".").pop()?.toLowerCase() || "";
          if (ACCEPTED_EXTENSIONS.includes(ext)) {
            const displayName = path.replace(/^.*[/\\]/, "") || "video";
            let duration: number | undefined;
            try {
              duration = await invoke<number>("get_video_duration", { path });
            } catch { /* skip */ }
            setDroppedFile({ path, displayName, duration });
            // If we're not in idle, go to idle so uploader shows
            if (state === "done" || state === "error") {
              handleReset();
            }
          }
        }
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [state]);

  function handleSettingsContinue() {
    setIsFirstRun(false);
    setState("idle");
  }

  async function handlePathSelected(path: string, model: string, threads: number) {
    const fileName = path.replace(/^.*[/\\]/, "") || "video";
    setState("loading");
    setStep(null);
    setError("");
    setProgress(0);
    setLiveText("");
    setDetectedLang("");
    setIsPartial(false);

    try {
      const result = await invoke<string>("transcribe_video", {
        path,
        model,
        threads,
      });
      setTranscription(result);
      setState("done");
      setStep(null);
      saveToHistory({ fileName, text: result, model, isPartial: false });
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      if (errStr.startsWith("__CANCELLED__")) {
        const partialText = errStr.slice("__CANCELLED__".length);
        if (partialText.trim()) {
          setTranscription(partialText);
          setIsPartial(true);
          setState("done");
          saveToHistory({ fileName, text: partialText, model, isPartial: true });
        } else {
          setState("idle");
        }
      } else {
        setError(errStr);
        setState("error");
      }
      setStep(null);
    }
  }

  async function handleCancel() {
    await invoke("cancel_transcription");
  }

  function handleReset() {
    setState("idle");
    setStep(null);
    setTranscription("");
    setError("");
    setProgress(0);
    setLiveText("");
    setDetectedLang("");
    setIsPartial(false);
  }

  function handleHistorySelect(entry: HistoryEntry) {
    setTranscription(entry.text);
    setIsPartial(entry.isPartial);
    setState("done");
  }

  const stepLabel =
    step === "audio"
      ? t("loading.audio")
      : step === "text"
        ? t("loading.text")
        : t("loading.preparing");

  return (
    <LangContext.Provider value={langContextValue}>
      <main className="app">
        {state !== "settings" && (
          <button
            type="button"
            className="settings-fab"
            onClick={() => setState("settings")}
            title={t("settings.title")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
        <header className="app-header">
          <div className="app-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <title>App logo</title>
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <h1 className="app-title">Transcribe</h1>
          <p className="app-subtitle">{t("app.subtitle")}</p>
        </header>

        {(state === "idle" || state === "done") && (
          <button
            type="button"
            className="btn-history"
            onClick={() => setState("history")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {t("history.button")}
          </button>
        )}

        <section className="app-content">
          {state === "settings" && (
            <SettingsPage onContinue={handleSettingsContinue} isFirstRun={isFirstRun} />
          )}

          {state === "error" && (
            <div className="error-banner">
              <p>{error}</p>
              <button type="button" onClick={handleReset}>{t("error.tryAgain")}</button>
            </div>
          )}

          {(state === "idle" || state === "loading") && (
            <VideoUploader
              onPathSelected={handlePathSelected}
              isLoading={state === "loading"}
              droppedFile={droppedFile}
              dragOver={dragOver}
            />
          )}

          {state === "loading" && (
            <div className="loading-section">
              {step === "text" && progress > 0 ? (
                <>
                  <div className="progress-bar-wrapper">
                    <div className="progress-bar">
                      <div
                        className="progress-bar__fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="progress-percent">{Math.round(progress)}%</span>
                  </div>

                  {detectedLang && (
                    <p className="detected-lang">{t("loading.detectedLang")}: {detectedLang}</p>
                  )}

                  {liveText && (
                    <div className="live-text" ref={liveTextRef}>
                      <p className="live-text__content">{liveText}</p>
                    </div>
                  )}

                  <button type="button" className="btn-cancel" onClick={handleCancel}>
                    {t("loading.cancel")}
                  </button>
                </>
              ) : (
                <>
                  <div className="loading-pulse" />
                  <p className="loading-text">{stepLabel}</p>
                  <p className="loading-hint">{t("loading.hint")}</p>
                </>
              )}
            </div>
          )}

          {state === "history" && (
            <TranscriptionHistory
              onSelect={handleHistorySelect}
              onBack={handleReset}
            />
          )}

          {state === "done" && (
            <TranscriptionResult
              text={transcription}
              onReset={handleReset}
              isPartial={isPartial}
            />
          )}
        </section>
      </main>
    </LangContext.Provider>
  );
}

export default App;
