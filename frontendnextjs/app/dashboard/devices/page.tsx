"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiClient,
  DevicePresence,
  DeviceDetail,
} from "@/lib/api";
import { useLocale } from "@/lib/locale-context";

const WS_RECONNECT_MS = 3000;

type RealtimeStatus = "connecting" | "live" | "reconnecting" | "offline";

interface PresenceEvent {
  type: string;
  at: string;
  data: DevicePresence[];
}

export default function DevicesPage() {
  const { t } = useLocale();
  const [devices, setDevices] = useState<DevicePresence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<DeviceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const reconnectTimerRef = useRef<number | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const data = await apiClient.getDevices();
      setDevices(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedLoadDevices);
    } finally {
      setIsLoading(false);
    }
  }, [t.failedLoadDevices]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    let isUnmounted = false;
    let ws: WebSocket | null = null;

    const applySnapshot = (snapshot: DevicePresence[]) => {
      setDevices(snapshot);
      setError("");
      setIsLoading(false);
      setDetail((prev) => {
        if (!prev) return prev;
        const nextDevice = snapshot.find((d) => d.id === prev.device.id);
        if (!nextDevice) return prev;
        return {
          ...prev,
          device: nextDevice,
          is_online: nextDevice.is_online,
          running_apps: nextDevice.running_apps,
        };
      });
    };

    const connect = (isReconnect: boolean) => {
      const wsUrl = apiClient.getDevicesWebSocketUrl();
      const protocols = apiClient.getDevicesWebSocketProtocols();
      if (!wsUrl || protocols.length === 0) {
        setRealtimeStatus("offline");
        return;
      }

      setRealtimeStatus(isReconnect ? "reconnecting" : "connecting");
      ws = new WebSocket(wsUrl, protocols);

      ws.onopen = () => {
        if (isUnmounted) {
          ws?.close();
          return;
        }
        setRealtimeStatus("live");
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as PresenceEvent;
          if (message?.type === "devices.snapshot" && Array.isArray(message.data)) {
            applySnapshot(message.data);
          }
        } catch {
          // Ignore malformed events and keep socket open.
        }
      };

      ws.onclose = () => {
        if (isUnmounted) return;
        setRealtimeStatus("reconnecting");
        reconnectTimerRef.current = window.setTimeout(() => {
          connect(true);
        }, WS_RECONNECT_MS);
      };
    };

    connect(false);

    return () => {
      isUnmounted = true;
      setRealtimeStatus("offline");
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      ws?.close();
    };
  }, []);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await apiClient.getDeviceDetail(id);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedLoadDevices);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.confirmDeleteDevice)) return;
    try {
      await apiClient.deleteDevice(id);
      setDetail(null);
      await loadDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedLoadDevices);
    }
  };

  const formatTime = (value: string | null) => {
    if (!value) return t.never;
    const d = new Date(value);
    return d.toLocaleString();
  };

  const realtimeLabel =
    realtimeStatus === "live"
      ? t.realtimeLive
      : realtimeStatus === "reconnecting"
        ? t.realtimeReconnecting
        : realtimeStatus === "connecting"
          ? t.realtimeConnecting
          : t.realtimeOffline;

  const onlineCount = devices.filter((d) => d.is_online).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="admin-page-title">{t.devicesTitle}</h1>
          <p className="admin-page-subtitle">{t.devicesSubtitle}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className={`admin-badge ${
              realtimeStatus === "live" ? "admin-badge-green" : "admin-badge-yellow"
            }`}
          >
            ● {t.realtimeStatus}: {realtimeLabel}
          </span>
          <button className="admin-btn-ghost" onClick={loadDevices}>
            ⟳ {t.refresh}
          </button>
        </div>
      </div>

      {error && <div className="admin-alert-error">{error}</div>}

      <p className="admin-page-subtitle" style={{ marginTop: 0 }}>
        <span className="admin-badge admin-badge-green">
          {onlineCount} {t.online}
        </span>{" "}
        <span className="admin-badge admin-badge-gray">
          {devices.length - onlineCount} {t.offline}
        </span>
      </p>

      <div className="admin-table-wrap">
        {isLoading ? (
          <div className="admin-empty">{t.loadingDevices}</div>
        ) : devices.length === 0 ? (
          <div className="admin-empty">{t.noDevices}</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t.status}</th>
                <th>{t.device}</th>
                <th>{t.currentUser}</th>
                <th>{t.runningApps}</th>
                <th>{t.ipAddress}</th>
                <th>{t.lastSeen}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span
                      className={`admin-badge ${d.is_online ? "admin-badge-green" : "admin-badge-gray"}`}
                    >
                      ● {d.is_online ? t.online : t.offline}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{d.device_name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--admin-text-muted)" }}>
                      {d.hostname}
                    </div>
                  </td>
                  <td>
                    {d.current_user ? (
                      <div>
                        <div>{d.current_user.full_name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--admin-text-muted)" }}>
                          {d.current_user.email}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "var(--admin-text-muted)" }}>{t.noUser}</span>
                    )}
                  </td>
                  <td>
                    {d.running_apps && d.running_apps.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {d.running_apps.map((a) => (
                          <span key={a.app_id} className="admin-badge admin-badge-blue">
                            {a.name || a.slug}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: "var(--admin-text-muted)" }}>—</span>
                    )}
                  </td>
                  <td>{d.ip_address || "—"}</td>
                  <td style={{ fontSize: "0.8rem" }}>{formatTime(d.last_seen)}</td>
                  <td>
                    <button className="admin-btn-ghost" onClick={() => openDetail(d.id)}>
                      {t.viewDetail}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(detail || detailLoading) && (
        <div className="admin-modal-overlay" onClick={() => setDetail(null)}>
          <div
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 560 }}
          >
            {detailLoading || !detail ? (
              <div className="admin-empty">{t.loadingDevices}</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="admin-page-title" style={{ marginBottom: 0 }}>
                    {detail.device.device_name}
                  </h2>
                  <span
                    className={`admin-badge ${detail.is_online ? "admin-badge-green" : "admin-badge-gray"}`}
                  >
                    ● {detail.is_online ? t.online : t.offline}
                  </span>
                </div>

                <div className="admin-detail-grid">
                  <div>
                    <span className="admin-detail-label">{t.currentUser}</span>
                    <span>
                      {detail.device.current_user
                        ? `${detail.device.current_user.full_name} (${detail.device.current_user.email})`
                        : t.noUser}
                    </span>
                  </div>
                  <div>
                    <span className="admin-detail-label">{t.hostname}</span>
                    <span>{detail.device.hostname || "—"}</span>
                  </div>
                  <div>
                    <span className="admin-detail-label">{t.ipAddress}</span>
                    <span>{detail.device.ip_address || "—"}</span>
                  </div>
                  <div>
                    <span className="admin-detail-label">{t.machineId}</span>
                    <span style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>
                      {detail.device.machine_id || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="admin-detail-label">{t.lastSeen}</span>
                    <span>{formatTime(detail.device.last_seen)}</span>
                  </div>
                </div>

                <h3 className="admin-section-title">{t.runningApps}</h3>
                {detail.running_apps.length === 0 ? (
                  <p style={{ color: "var(--admin-text-muted)" }}>{t.noRunningApps}</p>
                ) : (
                  <ul className="admin-app-list">
                    {detail.running_apps.map((a) => (
                      <li key={a.app_id}>
                        <span className="admin-badge admin-badge-blue">{a.name || a.slug}</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--admin-text-muted)" }}>
                          {t.pid}: {a.pid} · {t.startedAt}: {formatTime(a.started_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <h3 className="admin-section-title">{t.installedApps}</h3>
                {detail.installed_apps.length === 0 ? (
                  <p style={{ color: "var(--admin-text-muted)" }}>{t.noInstalledApps}</p>
                ) : (
                  <ul className="admin-app-list">
                    {detail.installed_apps.map((a) => (
                      <li key={a.app_id}>
                        <span>{a.name || a.slug}</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--admin-text-muted)" }}>
                          v{a.installed_version_name || a.installed_version_code}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center justify-between" style={{ marginTop: 20 }}>
                  <button
                    className="admin-btn-danger"
                    onClick={() => handleDelete(detail.device.id)}
                  >
                    {t.deleteDevice}
                  </button>
                  <button className="admin-btn-ghost" onClick={() => setDetail(null)}>
                    {t.back}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
