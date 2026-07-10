"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";
import { useLocale } from "@/lib/locale-context";

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLocale();
  const [stats, setStats] = useState({ apps: 0, users: 0, published: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [apps, users] = await Promise.all([
          apiClient.getApps(),
          apiClient.getUsers(),
        ]);
        setStats({
          apps: apps.length,
          users: users.length,
          published: apps.filter((a: { is_published: boolean }) => a.is_published).length,
        });
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div>
      <h1 className="admin-page-title">{t.overview}</h1>
      <p className="admin-page-subtitle">
        {t.overviewSubtitle.replace("{name}", user?.full_name || "")}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t.yourRole}</p>
          <p className="admin-stat-value" style={{ fontSize: "1.25rem" }}>
            {user?.role.toUpperCase()}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t.applications}</p>
          <p className="admin-stat-value">{loading ? "—" : stats.apps}</p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t.published}</p>
          <p className="admin-stat-value" style={{ color: "var(--admin-success)" }}>
            {loading ? "—" : stats.published}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-label">{t.users}</p>
          <p className="admin-stat-value">{loading ? "—" : stats.users}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="admin-card">
          <h2 className="admin-card-title">{t.account}</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--admin-text-muted)" }}>{t.email}</dt>
              <dd style={{ color: "var(--admin-text)" }}>{user?.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--admin-text-muted)" }}>{t.fullName}</dt>
              <dd style={{ color: "var(--admin-text)" }}>{user?.full_name}</dd>
            </div>
            <div className="flex justify-between gap-4 items-center">
              <dt style={{ color: "var(--admin-text-muted)" }}>{t.status}</dt>
              <dd>
                <span
                  className={`admin-badge ${user?.is_active ? "admin-badge-green" : "admin-badge-red"}`}
                >
                  {user?.is_active ? t.active : t.inactive}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="admin-card">
          <h2 className="admin-card-title">{t.quickActions}</h2>
          <div className="flex flex-col gap-2">
            <a href="/dashboard/apps" className="admin-btn-primary text-center">
              {t.manageApps}
            </a>
            <a href="/dashboard/users" className="admin-btn-ghost text-center">
              {t.viewUsers}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
