export type DistributionType = "portable" | "installer" | "url";

export interface VersionLike {
  version_code?: number;
  distribution_type?: DistributionType;
  launch_url?: string;
  manifest_url?: string;
  installer_kind?: string;
  installer_launch_path?: string;
  installer_product_code?: string;
}

export interface UploadFormInput {
  distributionType: DistributionType;
  uploadingFile: File | null;
  launchUrl: string;
  entryPoint: string;
  installerLaunchPath: string;
  installerProductCode: string;
}

export function nextVersionCode(versions: VersionLike[]): number {
  const codes = versions
    .map((v) => v.version_code)
    .filter((code): code is number => typeof code === "number" && code > 0);
  return (codes.length > 0 ? Math.max(...codes) : 0) + 1;
}

export function isValidLaunchUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

export function validateUploadForm(input: UploadFormInput): string | null {
  const { distributionType, uploadingFile, launchUrl, entryPoint, installerLaunchPath, installerProductCode } = input;

  if (distributionType === "url") {
    if (!launchUrl.trim()) return "Launch URL is required";
    if (!isValidLaunchUrl(launchUrl)) return "Launch URL must start with http:// or https://";
    return null;
  }

  if (!uploadingFile) return "Build file is required";

  const fileName = uploadingFile.name.toLowerCase();
  const isMsi = fileName.endsWith(".msi");
  const isExe = fileName.endsWith(".exe");
  const isZip = fileName.endsWith(".zip");

  if (distributionType === "portable") {
    if (isMsi) return "Portable versions cannot upload .msi files";
    if (!isZip && !isExe) return "Portable upload must be a .exe or .zip file";
    if (entryPoint.trim() && !entryPoint.trim().toLowerCase().endsWith(".exe")) {
      return "Portable entry point must be a .exe file";
    }
  }

  if (distributionType === "installer") {
    if (!installerLaunchPath.trim()) return "Launch path after install is required";
    if (!isZip && !isMsi && !isExe) return "Installer upload must be .msi, .exe, or .zip";
    if (isMsi && !installerProductCode.trim()) {
      return "MSI Product Code is required for .msi installers";
    }
    if (entryPoint.trim()) {
      const ep = entryPoint.trim().toLowerCase();
      if (!ep.endsWith(".msi") && !ep.endsWith(".exe")) {
        return "Installer entry point must be .msi or .exe";
      }
    }
  }

  return null;
}

export function validateVersionForRelease(version: VersionLike): string | null {
  const dist = version.distribution_type || "portable";

  if (dist === "url") {
    if (!version.launch_url?.trim()) return "launch_url is required before release";
    if (!isValidLaunchUrl(version.launch_url)) return "launch_url must start with http:// or https://";
    return null;
  }

  if (!version.manifest_url?.trim()) return "manifest is required before release";

  if (dist === "installer") {
    if (!version.installer_launch_path?.trim()) {
      return "installer_launch_path is required before release";
    }
    const kind = (version.installer_kind || "").toLowerCase();
    if (kind === "msi" && !version.installer_product_code?.trim()) {
      return "installer_product_code is required for MSI installers before release";
    }
  }

  return null;
}
