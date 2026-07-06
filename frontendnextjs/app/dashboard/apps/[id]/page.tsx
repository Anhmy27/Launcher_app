"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";

interface App {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  is_published: boolean;
  icon_url: string;
  banner_url: string;
  created_at: string;
}

interface AppVersion {
  id: string;
  version_code: number;
  is_required: boolean;
  is_released: boolean;
  release_date: string;
  file_hash: string;
  manifest_url: string;
}

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params.id as string;

  const [app, setApp] = useState<App | null>(null);
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRequired, setIsRequired] = useState(false);
  const [entryPoint, setEntryPoint] = useState("");

  useEffect(() => {
    loadAppData();
  }, [appId]);

  const loadAppData = async () => {
    try {
      const [appData, versionsData] = await Promise.all([
        apiClient.getApp(appId),
        apiClient.getAppVersions(appId),
      ]);
      setApp(appData);
      setVersions(versionsData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load app");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadingFile) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadingFile);
      formData.append(
        "version_code",
        String(Math.max(0, ...versions.map((v) => v.version_code)) + 1),
      );
      formData.append(
        "version_name",
        `v${Math.max(0, ...versions.map((v) => v.version_code)) + 1}`,
      );
      formData.append("is_required", String(isRequired));
      if (entryPoint.trim()) {
        formData.append("entry_point", entryPoint.trim());
      }

      await apiClient.uploadVersion(appId, formData);
      setUploadingFile(null);
      setIsRequired(false);
      setEntryPoint("");
      await loadAppData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload version");
    } finally {
      setIsUploading(false);
    }
  };

  const handleReleaseVersion = async (versionId: string) => {
    try {
      await apiClient.releaseVersion(appId, versionId);
      await loadAppData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to release version",
      );
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!confirm("Delete this version?")) return;

    try {
      await apiClient.deleteVersion(appId, versionId);
      await loadAppData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete version");
    }
  };

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (!app) return <div className="p-8 text-red-600">App not found</div>;

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="mb-4 text-blue-600 hover:underline"
      >
        ← Back
      </button>

      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h1 className="text-3xl font-bold mb-2">{app.name}</h1>
        <p className="text-gray-600 mb-4">{app.description}</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">
              Category
            </label>
            <p className="text-lg">{app.category}</p>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">
              Status
            </label>
            <p
              className={`text-lg font-semibold ${app.is_published ? "text-green-600" : "text-gray-600"}`}
            >
              {app.is_published ? "Published" : "Draft"}
            </p>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Slug</label>
            <p className="text-sm font-mono">{app.slug}</p>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">
              Created
            </label>
            <p className="text-sm">
              {new Date(app.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Version */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Upload New Version</h2>

          <form onSubmit={handleUploadVersion} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Build File (.exe, .zip, etc.)
              </label>
              <input
                type="file"
                onChange={(e) => setUploadingFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={isUploading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entry Point (optional)
              </label>
              <input
                type="text"
                value={entryPoint}
                onChange={(e) => setEntryPoint(e.target.value)}
                placeholder="e.g., app.exe (auto-detected if empty)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                disabled={isUploading}
              />
              <p className="text-xs text-gray-500 mt-1">
                Main executable inside the build. Auto-detected for .exe/.msi.
              </p>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  disabled={isUploading}
                  className="rounded"
                />
                Force Update (Mark as Required)
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Users must update to this version
              </p>
            </div>{" "}
            <button
              type="submit"
              disabled={!uploadingFile || isUploading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isUploading ? "Uploading..." : "Upload Version"}
            </button>
          </form>

          <p className="text-xs text-gray-500 mt-4">
            ✓ Files hashed with SHA256
            <br />✓ Manifest generated automatically
            <br />✓ ZIP files extracted &amp; uploaded individually
          </p>
        </div>

        {/* Versions List */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold">Versions ({versions.length})</h2>
          </div>

          {versions.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No versions yet. Upload one to get started!
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                    Version
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                    Manifest
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                    Hash
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {versions.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">v{v.version_code}</td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            v.is_released
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {v.is_released ? "Released" : "Draft"}
                        </span>
                        {v.is_required && (
                          <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                            Required
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {v.manifest_url && (
                        <a
                          href={v.manifest_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-sm"
                        >
                          View Manifest 📋
                        </a>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      {v.file_hash.substring(0, 16)}...
                    </td>
                    <td className="px-6 py-4 space-x-2">
                      {!v.is_released && (
                        <button
                          onClick={() => handleReleaseVersion(v.id)}
                          className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 text-sm"
                        >
                          Release
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteVersion(v.id)}
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
  );
}
