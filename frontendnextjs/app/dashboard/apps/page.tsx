"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { useLocale } from "@/lib/locale-context";

interface App {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  is_published: boolean;
  created_at: string;
}

export default function AppsPage() {
  const { t } = useLocale();
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [newApp, setNewApp] = useState({
    name: "",
    description: "",
    category: "",
  });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadApps();
  }, []);

  const loadApps = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getApps();
      setApps(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedLoadApps);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      await apiClient.createApp(
        newApp.name,
        newApp.description,
        newApp.category,
      );
      setNewApp({ name: "", description: "", category: "" });
      await loadApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedCreate);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteApp = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;

    try {
      await apiClient.deleteApp(id);
      await loadApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedDelete);
    }
  };

  const handleTogglePublish = async (id: string, isPublished: boolean) => {
    try {
      await apiClient.updateApp(id, { is_published: !isPublished });
      await loadApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedUpdate);
    }
  };

  return (
    <div>
      <h1 className="admin-page-title">{t.appsTitle}</h1>
      <p className="admin-page-subtitle">{t.appsSubtitle}</p>

      {error && <div className="admin-alert-error">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="admin-card">
          <h2 className="admin-card-title">{t.createNewApp}</h2>
          <form onSubmit={handleCreateApp} className="space-y-4">
            <div>
              <label className="admin-label">{t.appNameLabel}</label>
              <input
                type="text"
                value={newApp.name}
                onChange={(e) => setNewApp({ ...newApp, name: e.target.value })}
                className="admin-input"
                required
                disabled={isCreating}
              />
            </div>

            <div>
              <label className="admin-label">{t.description}</label>
              <textarea
                value={newApp.description}
                onChange={(e) =>
                  setNewApp({ ...newApp, description: e.target.value })
                }
                className="admin-input resize-none"
                rows={3}
                disabled={isCreating}
              />
            </div>

            <div>
              <label className="admin-label">{t.category}</label>
              <input
                type="text"
                value={newApp.category}
                onChange={(e) =>
                  setNewApp({ ...newApp, category: e.target.value })
                }
                className="admin-input"
                placeholder={t.categoryPlaceholder}
                disabled={isCreating}
              />
            </div>
            <button
              type="submit"
              disabled={isCreating}
              className="admin-btn-primary w-full"
            >
              {isCreating ? t.creating : t.createApp}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          <div className="admin-table-wrap">
            {isLoading ? (
              <div className="admin-empty">{t.loadingApps}</div>
            ) : apps.length === 0 ? (
              <div className="admin-empty">{t.noApps}</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t.name}</th>
                    <th>{t.category}</th>
                    <th>{t.status}</th>
                    <th>{t.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((app) => (
                    <tr key={app.id}>
                      <td>
                        <Link href={`/dashboard/apps/${app.id}`} className="admin-link">
                          {app.name}
                        </Link>
                      </td>
                      <td style={{ color: "var(--admin-text-muted)" }}>
                        {app.category || "—"}
                      </td>
                      <td>
                        <button
                          onClick={() =>
                            handleTogglePublish(app.id, app.is_published)
                          }
                          className={`admin-badge ${app.is_published ? "admin-badge-green" : "admin-badge-gray"}`}
                        >
                          {app.is_published ? t.publishedStatus : t.draft}
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteApp(app.id)}
                          className="admin-btn-danger"
                        >
                          {t.delete}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
