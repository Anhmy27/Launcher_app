import { useCallback, useEffect, useState } from "react";
import apiClient from "../lib/api";
import type { DownloadHistoryItem } from "../lib/api";
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
): string {
  if (!detail) {
    return item.download_status;
  }

  if (detail.stage === "fetching_manifest") {
    return "Fetching manifest...";
  }

  if (detail.stage === "comparing") {
    return "Comparing files...";
  }

  if (detail.stage === "downloading") {
    const downloaded = detail.downloaded_files ?? 0;
    const total = detail.total_files ?? "?";
    const progress = Number(detail.progress ?? 0).toFixed(0);
    return `Installing... ${downloaded}/${total} files (${progress}%)`;
  }

  if (detail.stage === "running_installer") {
    return "Running installer...";
  }

  if (detail.file_name?.startsWith("http://") || detail.file_name?.startsWith("https://")) {
    return "🔗 Opened web link";
  }

  if (item.download_status === "completed") {
    return "✅ Installed";
  }

  if (item.download_status === "failed") {
    return "❌ Failed";
  }

  return item.download_status;
}

export default function Downloads() {
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
      // ignore for now
    }
  };

  const formatDateTime = (input: string) =>
    new Date(input).toLocaleString("vi-VN", {
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
    if (status === "failed") return Number(detail?.progress ?? 0);
    return Number(detail?.progress ?? 0);
  };

  return (
    <div className="downloads-page">
      <div className="downloads-header">
        <h2>⬇️ Downloads</h2>
        <p>
          Showing your account download history (including current progress)
        </p>
      </div>

      {!loading && history.length === 0 ? (
        <div className="store-empty">
          <span className="empty-icon">🗂️</span>
          <p>No downloads yet for this account.</p>
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
                  <h4>{item.app_name || "Unknown App"}</h4>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${item.download_status === "failed" ? "failed" : ""}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="dl-status">
                    v{item.version_name} • {statusLabel(item, detail)}
                  </span>
                  {detail?.file_name && (
                    <span className="dl-path">File: {detail.file_name}</span>
                  )}
                  {detail?.download_path &&
                    item.download_status === "completed" && (
                      <span className="dl-path">{detail.download_path}</span>
                    )}
                  <span className="dl-path">
                    Started: {formatDateTime(item.started_at)}
                  </span>
                  {item.completed_at && (
                    <span className="dl-path">
                      Completed: {formatDateTime(item.completed_at)}
                    </span>
                  )}
                </div>
                <button
                  className="dl-remove-btn"
                  onClick={() => handleDeleteHistory(item.id)}
                  title="Delete history"
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
