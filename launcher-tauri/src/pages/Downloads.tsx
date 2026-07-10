import { useCallback, useEffect, useState } from "react";
import apiClient from "../lib/api";
import type { DownloadHistoryItem } from "../lib/api";
import { useLocale, type Messages } from "../context/LocaleContext";
import "./Downloads.css";

interface PersistedProgressDetail {
  stage?:
    | "fetching_manifest"
    | "comparing"
    | "downloading"
    | "running_installer"
    | "completed"
    | "failed";
  file_name?: string;
  progress?: number;
  downloaded_files?: number;
  total_files?: number;
  download_path?: string;
}

function parseProgressDetail(raw?: string): PersistedProgressDetail | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedProgressDetail;
  } catch {
    return null;
  }
}

function statusLabel(
  item: DownloadHistoryItem,
  detail: PersistedProgressDetail | null,
  t: Messages,
): string {
  if (!detail) {
    return item.download_status;
  }

  if (detail.stage === "fetching_manifest") return t.fetchingManifest;
  if (detail.stage === "comparing") return t.comparingFiles;

  if (detail.stage === "downloading") {
    const downloaded = detail.downloaded_files ?? 0;
    const total = detail.total_files ?? "?";
    const progress = Number(detail.progress ?? 0).toFixed(0);
    return `${t.installing}... ${downloaded}/${total} file (${progress}%)`;
  }

  if (detail.stage === "running_installer") return t.runningInstaller;

  if (detail.file_name?.startsWith("http://") || detail.file_name?.startsWith("https://")) {
    return t.openedWebLink;
  }

  if (item.download_status === "completed") return t.installedOk;
  if (item.download_status === "failed") return t.failedOk;

  return item.download_status;
}

export default function Downloads() {
  const { locale, t } = useLocale();
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      const data = await apiClient.getMyDownloads();
      setHistory(data || []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 2000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  const handleDeleteHistory = async (downloadId: string) => {
    try {
      await apiClient.deleteMyDownload(downloadId);
      setHistory((prev) => prev.filter((item) => item.id !== downloadId));
    } catch {
      // ignore
    }
  };

  const formatDateTime = (input: string) =>
    new Date(input).toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const iconFor = (status: DownloadHistoryItem["download_status"]) => {
    if (status === "completed") return "✅";
    if (status === "failed") return "❌";
    return "⏳";
  };

  const progressFor = (
    status: DownloadHistoryItem["download_status"],
    detail: PersistedProgressDetail | null,
  ) => {
    if (status === "completed") return 100;
    return Number(detail?.progress ?? 0);
  };

  return (
    <div className="downloads-page">
      <div className="downloads-header">
        <h2>{t.downloadsTitle}</h2>
        <p>{t.downloadsSubtitle}</p>
      </div>

      {!loading && history.length === 0 ? (
        <div className="store-empty">
          <span className="empty-icon">📥</span>
          <p>{t.noDownloads}</p>
        </div>
      ) : (
        <div className="downloads-list">
          {history.map((item) => {
            const detail = parseProgressDetail(item.progress_detail);
            const progress = progressFor(item.download_status, detail);

            return (
              <div key={item.id} className="download-item">
                <div className="dl-icon">{iconFor(item.download_status)}</div>
                <div className="dl-info">
                  <h4>{item.app_name || t.unknownApp}</h4>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${item.download_status === "failed" ? "failed" : ""}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="dl-status">
                    v{item.version_name} • {statusLabel(item, detail, t)}
                  </span>
                  {detail?.file_name && (
                    <span className="dl-path">{t.file}: {detail.file_name}</span>
                  )}
                  {detail?.download_path &&
                    item.download_status === "completed" && (
                      <span className="dl-path">{detail.download_path}</span>
                    )}
                  <span className="dl-path">
                    {t.started}: {formatDateTime(item.started_at)}
                  </span>
                  {item.completed_at && (
                    <span className="dl-path">
                      {t.completed}: {formatDateTime(item.completed_at)}
                    </span>
                  )}
                </div>
                <button
                  className="dl-remove-btn"
                  onClick={() => handleDeleteHistory(item.id)}
                  title={t.deleteHistory}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
