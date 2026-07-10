"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import {
  nextVersionCode,
  validateUploadForm,
  validateVersionForRelease,
} from "@/lib/versionValidation";
import { useLocale } from "@/lib/locale-context";

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
  version_name?: string;
  is_required: boolean;
  is_released: boolean;
  release_date: string;
  file_hash: string;
  manifest_url: string;
  distribution_type?: "portable" | "installer" | "url";
  launch_url?: string;
  installer_kind?: string;
  installer_silent_args?: string;
  installer_launch_path?: string;
  installer_product_code?: string;
  installer_uninstall_path?: string;
  installer_uninstall_args?: string;
}

export default function AppDetailPage() {
  const { t } = useLocale();
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
  const [distributionType, setDistributionType] = useState<
    "portable" | "installer" | "url"
  >("portable");
  const [launchUrl, setLaunchUrl] = useState("");
  const [installerSilentArgs, setInstallerSilentArgs] = useState("");
  const [installerLaunchPath, setInstallerLaunchPath] = useState("");
  const [installerProductCode, setInstallerProductCode] = useState("");
  const [installerUninstallPath, setInstallerUninstallPath] = useState("");
  const [installerUninstallArgs, setInstallerUninstallArgs] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const uploadValidationError = validateUploadForm({
    distributionType,
    uploadingFile,
    launchUrl,
    entryPoint,
    installerLaunchPath,
    installerProductCode,
  });

  const isMsiUpload = uploadingFile?.name.toLowerCase().endsWith(".msi") ?? false;
  const uploadDisabled =
    isUploading ||
    Boolean(uploadValidationError) ||
    (distributionType === "installer" && isMsiUpload && !installerProductCode.trim());

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
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedLoad);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateUploadForm({
      distributionType,
      uploadingFile,
      launchUrl,
      entryPoint,
      installerLaunchPath,
      installerProductCode,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsUploading(true);
    setError("");
    try {
      const newCode = nextVersionCode(versions);
      const formData = new FormData();
      formData.append("distribution_type", distributionType);
      if (distributionType !== "url" && uploadingFile) {
        formData.append("file", uploadingFile);
      }
      formData.append("version_code", String(newCode));
      formData.append("version_name", `v${newCode}`);
      formData.append("is_required", String(isRequired));
      if (entryPoint.trim()) {
        formData.append("entry_point", entryPoint.trim());
      }
      if (distributionType === "url") {
        formData.append("launch_url", launchUrl.trim());
      }
      if (distributionType === "installer") {
        if (installerSilentArgs.trim()) {
          formData.append("installer_silent_args", installerSilentArgs.trim());
        }
        formData.append("installer_launch_path", installerLaunchPath.trim());
        if (installerProductCode.trim()) {
          formData.append("installer_product_code", installerProductCode.trim());
        }
        if (installerUninstallPath.trim()) {
          formData.append("installer_uninstall_path", installerUninstallPath.trim());
        }
        if (installerUninstallArgs.trim()) {
          formData.append("installer_uninstall_args", installerUninstallArgs.trim());
        }
      }

      await apiClient.uploadVersion(appId, formData);
      setUploadingFile(null);
      setFileInputKey((k) => k + 1);
      setIsRequired(false);
      setEntryPoint("");
      setDistributionType("portable");
      setLaunchUrl("");
      setInstallerSilentArgs("");
      setInstallerLaunchPath("");
      setInstallerProductCode("");
      setInstallerUninstallPath("");
      setInstallerUninstallArgs("");
      await loadAppData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedUpload);
    } finally {
      setIsUploading(false);
    }
  };

  const handleReleaseVersion = async (version: AppVersion) => {
    const validationError = validateVersionForRelease(version);
    if (validationError) {
      setError(validationError);
      return;
    }

    setReleasingId(version.id);
    setError("");
    try {
      await apiClient.releaseVersion(appId, version.id);
      await loadAppData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t.failedRelease,
      );
    } finally {
      setReleasingId(null);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!confirm(t.confirmDeleteVersion)) return;

    setDeletingId(versionId);
    setError("");
    try {
      await apiClient.deleteVersion(appId, versionId);
      await loadAppData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedDeleteVersion);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) return <div className="admin-empty">{t.loading}</div>;
  if (!app) return <div className="admin-alert-error">{t.appNotFound}</div>;

  return (
    <div>
      <button onClick={() => router.back()} className="admin-btn-ghost mb-6">
        {t.back}
      </button>

      <div className="admin-card mb-6">
        <h1 className="admin-page-title" style={{ marginBottom: "0.5rem" }}>
          {app.name}
        </h1>
        <p style={{ color: "var(--admin-text-muted)", marginBottom: "1.5rem" }}>
          {app.description}
        </p>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="admin-label">{t.category}</p>
            <p>{app.category || "—"}</p>
          </div>
          <div>
            <p className="admin-label">{t.status}</p>
            <span
              className={`admin-badge ${app.is_published ? "admin-badge-green" : "admin-badge-gray"}`}
            >
              {app.is_published ? t.publishedStatus : t.draft}
            </span>
          </div>
          <div>
            <p className="admin-label">{t.slug}</p>
            <p className="font-mono text-xs">{app.slug}</p>
          </div>
          <div>
            <p className="admin-label">{t.created}</p>
            <p>{new Date(app.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {error && <div className="admin-alert-error">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Version */}
        <div className="admin-card">
          <h2 className="admin-card-title">{t.uploadVersion}</h2>

          <form onSubmit={handleUploadVersion} className="space-y-4">
            <div>
              <label className="admin-label">
                Distribution Type
              </label>
              <select
                value={distributionType}
                onChange={(e) =>
                  setDistributionType(
                    e.target.value as "portable" | "installer" | "url",
                  )
                }
                className="admin-input text-sm"
                disabled={isUploading}
              >
                <option value="portable">{t.portable}</option>
                <option value="installer">{t.installer}</option>
                <option value="url">{t.url}</option>
              </select>
            </div>

            {distributionType === "url" && (
              <div>
                <label className="admin-label">
                  Launch URL
                </label>
                <input
                  type="url"
                  value={launchUrl}
                  onChange={(e) => setLaunchUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="admin-input text-sm"
                  disabled={isUploading}
                />
                <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
                  Launcher will open this URL (no file upload).
                </p>
              </div>
            )}

            <div style={{ display: distributionType === "url" ? "none" : "block" }}>
              <label className="admin-label">
                Build File (.exe, .msi, .zip)
              </label>
              <input
                key={fileInputKey}
                type="file"
                onChange={(e) => setUploadingFile(e.target.files?.[0] || null)}
                className="admin-input"
                disabled={isUploading}
              />
            </div>
            {distributionType !== "url" && (
              <div>
                <label className="admin-label">
                  Entry Point (optional)
                </label>
                <input
                  type="text"
                  value={entryPoint}
                  onChange={(e) => setEntryPoint(e.target.value)}
                  placeholder="e.g., app.exe (auto-detected if empty)"
                  className="admin-input text-sm"
                  disabled={isUploading}
                />
                <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
                  Main executable inside the build. Auto-detected for .exe/.msi.
                </p>
              </div>
            )}

            {distributionType === "installer" && (
              <>
                <div>
                  <label className="admin-label">
                    Installer Silent Args (optional)
                  </label>
                  <input
                    type="text"
                    value={installerSilentArgs}
                    onChange={(e) => setInstallerSilentArgs(e.target.value)}
                    placeholder='e.g., /qn /norestart (MSI) or /S (EXE)'
                    className="admin-input text-sm"
                    disabled={isUploading}
                  />
                </div>
                <div>
                  <label className="admin-label">
                    Launch Path After Install (required)
                  </label>
                  <input
                    type="text"
                    value={installerLaunchPath}
                    onChange={(e) => setInstallerLaunchPath(e.target.value)}
                    placeholder="e.g., C:\\Program Files\\MyApp\\MyApp.exe"
                    className="admin-input text-sm"
                    disabled={isUploading}
                  />
                  <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
                    Absolute path to the app executable after silent install.
                  </p>
                </div>
                <div>
                  <label className="admin-label">
                    MSI Product Code (required for .msi)
                  </label>
                  <input
                    type="text"
                    value={installerProductCode}
                    onChange={(e) => setInstallerProductCode(e.target.value)}
                    placeholder="e.g., {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                    className="admin-input text-sm"
                    disabled={isUploading}
                  />
                  <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
                    Used for msiexec /x uninstall.
                  </p>
                </div>
                <div>
                  <label className="admin-label">
                    Uninstall Path (EXE installers)
                  </label>
                  <input
                    type="text"
                    value={installerUninstallPath}
                    onChange={(e) => setInstallerUninstallPath(e.target.value)}
                    placeholder="e.g., C:\\Program Files\\MyApp\\uninstall.exe"
                    className="admin-input text-sm"
                    disabled={isUploading}
                  />
                </div>
                <div>
                  <label className="admin-label">
                    Uninstall Silent Args (optional)
                  </label>
                  <input
                    type="text"
                    value={installerUninstallArgs}
                    onChange={(e) => setInstallerUninstallArgs(e.target.value)}
                    placeholder='e.g., /qn (MSI) or /S (EXE)'
                    className="admin-input text-sm"
                    disabled={isUploading}
                  />
                </div>
              </>
            )}
            <div>
              <label className="flex items-center gap-2 admin-label">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  disabled={isUploading}
                  className="rounded"
                />
                Force Update (Mark as Required)
              </label>
              <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
                Users must update to this version
              </p>
            </div>{" "}
            {uploadValidationError && (
              <p className="text-sm" style={{ color: "var(--admin-warning)" }}>{uploadValidationError}</p>
            )}
            <button
              type="submit"
              disabled={uploadDisabled}
              className="admin-btn-primary w-full"
            >
              {isUploading ? t.uploading : t.uploadVersionBtn}
            </button>
          </form>

          <p className="text-xs mt-4" style={{ color: "var(--admin-text-muted)" }}>
            ✓ Files hashed with SHA256
            <br />✓ Manifest generated automatically
            <br />✓ ZIP files extracted &amp; uploaded individually
          </p>
        </div>

        {/* Versions List */}
        <div className="lg:col-span-2 admin-table-wrap">
          <div className="p-6" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <h2 className="admin-card-title" style={{ marginBottom: 0 }}>
              Versions ({versions.length})
            </h2>
          </div>

          {versions.length === 0 ? (
            <div className="admin-empty">
              No versions yet. Upload one to get started!
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Manifest</th>
                  <th>Type</th>
                  <th>Hash</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td>v{v.version_code}</td>
                    <td>
                      <div className="space-y-1">
                        <span
                          className={`admin-badge ${v.is_released ? "admin-badge-green" : "admin-badge-yellow"}`}
                        >
                          {v.is_released ? t.released : t.draft}
                        </span>
                        {v.is_required && (
                          <span className="admin-badge admin-badge-red ml-2">
                            Required
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {v.manifest_url && (
                        <a
                          href={v.manifest_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-link text-sm"
                        >
                          Manifest
                        </a>
                      )}
                      {!v.manifest_url && v.launch_url && (
                        <a
                          href={v.launch_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-link text-sm"
                        >
                          Open URL
                        </a>
                      )}
                    </td>
                    <td className="text-sm">
                      <div>{v.distribution_type || "portable"}</div>
                      {v.distribution_type === "url" && v.launch_url && (
                        <div className="text-xs truncate max-w-[200px]" style={{ color: "var(--admin-text-muted)" }} title={v.launch_url}>
                          {v.launch_url}
                        </div>
                      )}
                      {v.distribution_type === "installer" && (
                        <div className="text-xs space-y-0.5" style={{ color: "var(--admin-text-muted)" }}>
                          {v.installer_kind && <div>Kind: {v.installer_kind}</div>}
                          {v.installer_launch_path && (
                            <div className="truncate max-w-[200px]" title={v.installer_launch_path}>
                              Launch: {v.installer_launch_path}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="font-mono text-xs">
                      {v.file_hash ? `${v.file_hash.substring(0, 16)}...` : "-"}
                    </td>
                    <td className="space-x-2">
                      {!v.is_released && (
                        <button
                          onClick={() => handleReleaseVersion(v)}
                          disabled={releasingId === v.id || deletingId === v.id}
                          className="admin-btn-success disabled:opacity-50"
                        >
                          {releasingId === v.id ? t.releasing : t.release}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteVersion(v.id)}
                        disabled={releasingId === v.id || deletingId === v.id}
                        className="admin-btn-danger disabled:opacity-50"
                      >
                        {deletingId === v.id ? t.deleting : t.delete}
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
