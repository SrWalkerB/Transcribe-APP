import { useState } from "react";
import { useLang } from "../LangContext";

export interface HistoryEntry {
  id: string;
  fileName: string;
  text: string;
  model: string;
  date: string;
  isPartial: boolean;
}

const STORAGE_KEY = "transcribe-history";
const MAX_ENTRIES = 50;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(entry: Omit<HistoryEntry, "id" | "date">): void {
  const history = loadHistory();
  const newEntry: HistoryEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
  };
  history.unshift(newEntry);
  if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function deleteFromHistory(id: string): void {
  const history = loadHistory().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

interface TranscriptionHistoryProps {
  onSelect: (entry: HistoryEntry) => void;
  onBack: () => void;
}

export default function TranscriptionHistory({ onSelect, onBack }: TranscriptionHistoryProps) {
  const { t } = useLang();
  const [entries, setEntries] = useState(loadHistory);

  function handleDelete(id: string) {
    deleteFromHistory(id);
    setEntries(loadHistory());
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="history-wrapper">
      <div className="history-header">
        <button type="button" className="btn-icon" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>{t("history.back")}</span>
        </button>
        <h2 className="history-title">{t("history.title")}</h2>
      </div>

      {entries.length === 0 ? (
        <div className="history-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.3 }}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p>{t("history.empty")}</p>
        </div>
      ) : (
        <div className="history-list">
          {entries.map((entry) => (
            <div key={entry.id} className="history-item" onClick={() => onSelect(entry)}>
              <div className="history-item__info">
                <span className="history-item__name">{entry.fileName}</span>
                <span className="history-item__meta">
                  {formatDate(entry.date)} · {entry.model}
                  {entry.isPartial && ` · ${t("result.partial")}`}
                </span>
                <span className="history-item__preview">
                  {entry.text.slice(0, 120)}{entry.text.length > 120 ? "..." : ""}
                </span>
              </div>
              <button
                type="button"
                className="history-item__delete"
                onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                title={t("history.delete")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
