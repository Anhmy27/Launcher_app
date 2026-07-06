"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load apps");
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
      setError(err instanceof Error ? err.message : "Failed to create app");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteApp = async (id: string) => {
    if (!confirm("Are you sure?")) return;

    try {
      await apiClient.deleteApp(id);
      await loadApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete app");
    }
  };

  const handleTogglePublish = async (id: string, isPublished: boolean) => {
    try {
      await apiClient.updateApp(id, { is_published: !isPublished });
      await loadApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update app");
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Applications</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create App Form */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Create New App</h2>
          <form onSubmit={handleCreateApp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                App Name
              </label>
              <input
                type="text"
                value={newApp.name}
                onChange={(e) => setNewApp({ ...newApp, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={isCreating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={newApp.description}
                onChange={(e) =>
                  setNewApp({ ...newApp, description: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                disabled={isCreating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <input
                type="text"
                value={newApp.category}
                onChange={(e) =>
                  setNewApp({ ...newApp, category: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="game, tool, utility, etc."
                disabled={isCreating}
              />
            </div>
            <button
              type="submit"
              disabled={isCreating}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isCreating ? "Creating..." : "Create App"}
            </button>
          </form>
        </div>

        {/* Apps List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {isLoading ? (
              <div className="p-6 text-center">Loading apps...</div>
            ) : apps.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No apps yet</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {apps.map((app) => (
                    <tr key={app.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <a
                          href={`/dashboard/apps/${app.id}`}
                          className="text-blue-600 hover:underline font-semibold"
                        >
                          {app.name}
                        </a>
                      </td>
                      <td className="px-6 py-4 text-sm">{app.category}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() =>
                            handleTogglePublish(app.id, app.is_published)
                          }
                          className={`px-3 py-1 rounded text-sm font-medium ${
                            app.is_published
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {app.is_published ? "Published" : "Draft"}
                        </button>
                      </td>
                      <td className="px-6 py-4 space-x-2">
                        <button
                          onClick={() => handleDeleteApp(app.id)}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
                        >
                          Delete
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
