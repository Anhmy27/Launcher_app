package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"backend/config"
	"backend/database"
	"backend/models"
	"backend/services"
	"backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const maxVersionUploadBytes = 1 << 30 // 1 GiB

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

// Manifest describes the full set of files for a version.
type Manifest struct {
	Version     int            `json:"version"` // manifest format version (always 1 for now)
	AppID       string         `json:"app_id"`
	VersionID   string         `json:"version_id"`
	VersionName string         `json:"version_name"`
	VersionCode int64          `json:"version_code"`
	EntryPoint  string         `json:"entry_point"` // relative path to main executable
	Files       []ManifestFile `json:"files"`
	TotalSize   int64          `json:"total_size"`
	CreatedAt   string         `json:"created_at"`
}

// ManifestFile describes a single file inside a version.
type ManifestFile struct {
	Path   string `json:"path"`   // relative path inside install dir
	SHA256 string `json:"sha256"` // hex-encoded sha256
	Size   int64  `json:"size"`
	URL    string `json:"url"` // MinIO public URL
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

type AppVersionHandler struct {
	Config *config.Config
}

func NewAppVersionHandler(cfg *config.Config) *AppVersionHandler {
	return &AppVersionHandler{Config: cfg}
}

type CreateVersionRequest struct {
	VersionName string `form:"version_name" binding:"required"`
	VersionCode int64  `form:"version_code" binding:"required"`
	Description string `form:"description"`
	IsRequired  bool   `form:"is_required"`
	EntryPoint  string `form:"entry_point"` // optional – auto-detected if empty
	DistributionType     string `form:"distribution_type"` // portable|installer|url (default portable)
	LaunchURL            string `form:"launch_url"`        // required for url
	InstallerSilentArgs    string `form:"installer_silent_args"`
	InstallerLaunchPath    string `form:"installer_launch_path"`
	InstallerProductCode   string `form:"installer_product_code"`
	InstallerUninstallPath string `form:"installer_uninstall_path"`
	InstallerUninstallArgs string `form:"installer_uninstall_args"`
}

type UpdateVersionRequest struct {
	VersionName *string `json:"version_name"`
	Description *string `json:"description"`
	IsRequired  *bool   `json:"is_required"`
}

// Create - POST /api/apps/:id/versions (multipart/form-data with file)
//
// Accepts a single build file (exe, msi, …) **or** a ZIP archive.
// Also supports URL-only releases (no file upload) when distribution_type=url.
//
//   - ZIP  → extracted; every file is uploaded individually.
//   - Other → uploaded as a single-file version.
//
// A manifest.json is generated and uploaded alongside the files.
// Only the manifest URL is stored in the database.
func (h *AppVersionHandler) Create(c *gin.Context) {
	appID := c.Param("id")

	// Check app exists
	var app models.Application
	if err := database.DB.First(&app, "id = ?", appID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "App not found")
		return
	}

	var req CreateVersionRequest
	if err := c.ShouldBind(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	// Normalize distribution type
	distType := strings.ToLower(strings.TrimSpace(req.DistributionType))
	if distType == "" {
		distType = "portable"
	}
	if distType != "portable" && distType != "installer" && distType != "url" {
		utils.Error(c, http.StatusBadRequest, "Invalid distribution_type (must be portable|installer|url)")
		return
	}

	if req.VersionCode <= 0 {
		utils.Error(c, http.StatusBadRequest, "version_code must be greater than 0")
		return
	}

	var existingCount int64
	if err := database.DB.Model(&models.AppVersion{}).
		Where("app_id = ? AND version_code = ?", appID, req.VersionCode).
		Count(&existingCount).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to validate version_code")
		return
	}
	if existingCount > 0 {
		utils.Error(c, http.StatusConflict, "version_code already exists for this app")
		return
	}

	// URL-only release: no file upload, no manifest
	if distType == "url" {
		launchURL := strings.TrimSpace(req.LaunchURL)
		if launchURL == "" {
			utils.Error(c, http.StatusBadRequest, "launch_url is required for distribution_type=url")
			return
		}
		if !isValidLaunchURL(launchURL) {
			utils.Error(c, http.StatusBadRequest, "launch_url must start with http:// or https://")
			return
		}

		appUUID, _ := uuid.Parse(appID)
		version := models.AppVersion{
			ID:               uuid.New(),
			AppID:            appUUID,
			VersionName:      req.VersionName,
			VersionCode:      req.VersionCode,
			Description:      req.Description,
			FileSize:         0,
			FileHash:         "",
			ManifestURL:      "",
			DistributionType: "url",
			LaunchURL:        launchURL,
			IsReleased:       false,
			IsRequired:       req.IsRequired,
		}

		if err := database.DB.Create(&version).Error; err != nil {
			if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "UNIQUE") {
				utils.Error(c, http.StatusConflict, "version_code already exists for this app")
				return
			}
			utils.Error(c, http.StatusInternalServerError, "Failed to create version")
			return
		}

		utils.Success(c, http.StatusCreated, version)
		return
	}

	// Handle file upload (portable/installer)
	file, err := c.FormFile("file")
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "Build file is required for portable/installer")
		return
	}

	src, err := file.Open()
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to open file")
		return
	}
	defer src.Close()

	fileContent, err := io.ReadAll(io.LimitReader(src, maxVersionUploadBytes+1))
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to read file")
		return
	}
	if int64(len(fileContent)) > maxVersionUploadBytes {
		utils.Error(c, http.StatusBadRequest, "File exceeds maximum upload size (1 GiB)")
		return
	}

	if distType == "portable" && !isZipFile(file.Filename) && isInstallerOnlyFile(file.Filename) {
		utils.Error(c, http.StatusBadRequest, "Portable versions cannot upload .msi files; use distribution_type=installer")
		return
	}

	if distType == "installer" && strings.TrimSpace(req.InstallerLaunchPath) == "" {
		utils.Error(c, http.StatusBadRequest, "installer_launch_path is required for distribution_type=installer")
		return
	}

	versionID := uuid.New()
	ctx := context.Background()
	minioSvc, err := services.NewMinIOStorageService(&h.Config.MinIO)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to initialize MinIO storage")
		return
	}

	var manifestFiles []ManifestFile
	var entryPoint string
	installerKind := ""

	if isZipFile(file.Filename) {
		// ── ZIP: extract and upload every file ──────────────────────────
		zipReader, zerr := zip.NewReader(bytes.NewReader(fileContent), int64(len(fileContent)))
		if zerr != nil {
			utils.Error(c, http.StatusBadRequest, "Invalid ZIP file: "+zerr.Error())
			return
		}

		for _, zf := range zipReader.File {
			if zf.FileInfo().IsDir() {
				continue
			}

			safeName, serr := sanitizeZipEntryPath(zf.Name)
			if serr != nil {
				utils.Error(c, http.StatusBadRequest, serr.Error())
				return
			}

			rc, err := zf.Open()
			if err != nil {
				utils.Error(c, http.StatusBadRequest, "Cannot open zip entry "+safeName+": "+err.Error())
				return
			}
			data, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				utils.Error(c, http.StatusBadRequest, "Cannot read zip entry "+safeName+": "+err.Error())
				return
			}

			hash := calculateHashFromBytes(data)
			objectPath := fmt.Sprintf("apps/%s/%s/files/%s", appID, versionID, safeName)

			log.Printf("Uploading zip entry %s (%d bytes)", safeName, len(data))
			url, err := minioSvc.UploadFile(ctx, objectPath, data)
			if err != nil {
				log.Printf("Error uploading %s: %v", safeName, err)
				cleanupVersionFolder(minioSvc, appID, versionID.String())
				utils.Error(c, http.StatusInternalServerError, "Failed to upload file: "+safeName)
				return
			}

			manifestFiles = append(manifestFiles, ManifestFile{
				Path:   safeName,
				SHA256: hash,
				Size:   int64(len(data)),
				URL:    url,
			})

			// Auto-detect entry point
			if entryPoint == "" && isZipEntryPointCandidate(safeName, distType) {
				entryPoint = safeName
			}
		}

		if len(manifestFiles) == 0 {
			utils.Error(c, http.StatusBadRequest, "ZIP file is empty")
			return
		}
	} else {
		// ── Single file ────────────────────────────────────────────────
		hash := calculateHashFromBytes(fileContent)
		objectPath := fmt.Sprintf("apps/%s/%s/files/%s", appID, versionID, file.Filename)

		log.Printf("Uploading file %s (%d bytes)", file.Filename, len(fileContent))
		url, err := minioSvc.UploadFile(ctx, objectPath, fileContent)
		if err != nil {
			log.Printf("MinIO upload error: %v", err)
			cleanupVersionFolder(minioSvc, appID, versionID.String())
			utils.Error(c, http.StatusInternalServerError, "Failed to upload file: "+err.Error())
			return
		}

		manifestFiles = append(manifestFiles, ManifestFile{
			Path:   file.Filename,
			SHA256: hash,
			Size:   file.Size,
			URL:    url,
		})
		entryPoint = file.Filename
	}

	// Override entry_point if explicitly provided by admin
	if req.EntryPoint != "" {
		entryPoint = req.EntryPoint
	}

	if entryPoint == "" {
		utils.Error(c, http.StatusBadRequest, "Could not detect entry_point; specify it manually")
		return
	}

	if err := validateEntryPointForDistribution(distType, entryPoint); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	// Calculate total size
	var totalSize int64
	for _, f := range manifestFiles {
		totalSize += f.Size
	}

	// Determine installer kind (if installer)
	if distType == "installer" {
		lowerEntry := strings.ToLower(entryPoint)
		if strings.HasSuffix(lowerEntry, ".msi") {
			installerKind = "msi"
		} else if strings.HasSuffix(lowerEntry, ".exe") {
			installerKind = "exe"
		} else {
			utils.Error(c, http.StatusBadRequest, "installer entry_point must be .msi or .exe")
			return
		}
		if err := validateInstallerMetadata(installerKind, req); err != nil {
			utils.Error(c, http.StatusBadRequest, err.Error())
			return
		}
	}

	// Build manifest
	manifest := Manifest{
		Version:     1,
		AppID:       appID,
		VersionID:   versionID.String(),
		VersionName: req.VersionName,
		VersionCode: req.VersionCode,
		EntryPoint:  entryPoint,
		Files:       manifestFiles,
		TotalSize:   totalSize,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	// Add optional metadata for installer/portable clients (backwards-compatible)
	manifestJSONMap := map[string]interface{}{}
	manifestBytes, _ := json.Marshal(manifest)
	_ = json.Unmarshal(manifestBytes, &manifestJSONMap)
	manifestJSONMap["distribution_type"] = distType
	if distType == "installer" {
		manifestJSONMap["installer_kind"] = installerKind
		manifestJSONMap["installer_silent_args"] = req.InstallerSilentArgs
		manifestJSONMap["installer_launch_path"] = req.InstallerLaunchPath
		manifestJSONMap["installer_product_code"] = req.InstallerProductCode
		manifestJSONMap["installer_uninstall_path"] = req.InstallerUninstallPath
		manifestJSONMap["installer_uninstall_args"] = req.InstallerUninstallArgs
	}

	manifestJSON, err := json.MarshalIndent(manifestJSONMap, "", "  ")
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to generate manifest")
		return
	}
	manifestHash := calculateHashFromBytes(manifestJSON)

	// Upload manifest.json
	manifestPath := fmt.Sprintf("apps/%s/%s/manifest.json", appID, versionID)
	manifestURL, err := minioSvc.UploadFile(ctx, manifestPath, manifestJSON, "application/json")
	if err != nil {
		log.Printf("Failed to upload manifest: %v", err)
		cleanupVersionFolder(minioSvc, appID, versionID.String())
		utils.Error(c, http.StatusInternalServerError, "Failed to upload manifest")
		return
	}
	log.Printf("Manifest uploaded: %s (%d files, %d bytes total)", manifestURL, len(manifestFiles), totalSize)

	// Save to DB
	appUUID, _ := uuid.Parse(appID)
	version := models.AppVersion{
		ID:          versionID,
		AppID:       appUUID,
		VersionName: req.VersionName,
		VersionCode: req.VersionCode,
		Description: req.Description,
		FileSize:    totalSize,
		FileHash:    manifestHash,
		ManifestURL: manifestURL,
		DistributionType:       distType,
		InstallerKind:          installerKind,
		InstallerSilentArgs:    req.InstallerSilentArgs,
		InstallerLaunchPath:    req.InstallerLaunchPath,
		InstallerProductCode:   req.InstallerProductCode,
		InstallerUninstallPath: req.InstallerUninstallPath,
		InstallerUninstallArgs: req.InstallerUninstallArgs,
		IsReleased:  false,
		IsRequired:  req.IsRequired,
	}

	if err := database.DB.Create(&version).Error; err != nil {
		cleanupVersionFolder(minioSvc, appID, versionID.String())
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "UNIQUE") {
			utils.Error(c, http.StatusConflict, "version_code already exists for this app")
			return
		}
		utils.Error(c, http.StatusInternalServerError, "Failed to create version")
		return
	}

	utils.Success(c, http.StatusCreated, version)
}

func cleanupVersionFolder(minioSvc *services.MinIOStorageService, appID, versionID string) {
	if minioSvc == nil {
		return
	}
	folderPath := fmt.Sprintf("apps/%s/%s", appID, versionID)
	if err := minioSvc.DeleteFolder(context.Background(), folderPath); err != nil {
		log.Printf("Warning: failed to cleanup MinIO folder %s: %v", folderPath, err)
	}
}

// GetByID - GET /api/apps/:id/versions/:versionId
func (h *AppVersionHandler) GetByID(c *gin.Context) {
	versionID := c.Param("versionId")

	var version models.AppVersion
	query := database.DB.Where("id = ?", versionID)
	if !isAdmin(c) {
		query = query.Where("is_released = ?", true)
	}
	if err := query.First(&version).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Version not found")
		return
	}

	utils.Success(c, http.StatusOK, version)
}

// Update - PUT /api/apps/:id/versions/:versionId
func (h *AppVersionHandler) Update(c *gin.Context) {
	versionID := c.Param("versionId")

	var version models.AppVersion
	if err := database.DB.First(&version, "id = ?", versionID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Version not found")
		return
	}

	var req UpdateVersionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	updates := map[string]interface{}{}
	if req.VersionName != nil {
		updates["version_name"] = *req.VersionName
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.IsRequired != nil {
		updates["is_required"] = *req.IsRequired
	}

	if err := database.DB.Model(&version).Updates(updates).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to update version")
		return
	}

	database.DB.First(&version, "id = ?", versionID)
	utils.Success(c, http.StatusOK, version)
}

// Delete - DELETE /api/apps/:id/versions/:versionId
func (h *AppVersionHandler) Delete(c *gin.Context) {
	appID := c.Param("id")
	versionID := c.Param("versionId")

	var version models.AppVersion
	if err := database.DB.First(&version, "id = ?", versionID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Version not found")
		return
	}

	// Delete entire version folder from MinIO Storage (apps/{appID}/{versionID}/...)
	minioSvc, err := services.NewMinIOStorageService(&h.Config.MinIO)
	if err != nil {
		log.Printf("Warning: failed to initialize MinIO storage: %v", err)
	} else {
		folderPath := fmt.Sprintf("apps/%s/%s", appID, versionID)
		if err := minioSvc.DeleteFolder(context.Background(), folderPath); err != nil {
			log.Printf("Warning: failed to delete MinIO folder %s: %v", folderPath, err)
		}
	}

	if err := database.DB.Delete(&version).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to delete version")
		return
	}

	utils.Success(c, http.StatusOK, gin.H{"message": "Version deleted successfully"})
}

// Release - POST /api/apps/:id/versions/:versionId/release
func (h *AppVersionHandler) Release(c *gin.Context) {
	versionID := c.Param("versionId")

	var version models.AppVersion
	if err := database.DB.First(&version, "id = ?", versionID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Version not found")
		return
	}

	if err := validateVersionForRelease(version); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	now := time.Now()
	if err := database.DB.Model(&version).Updates(map[string]interface{}{
		"is_released":  true,
		"release_date": now,
	}).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to release version")
		return
	}

	database.DB.First(&version, "id = ?", versionID)
	utils.Success(c, http.StatusOK, version)
}

// Calculate SHA256 hash of file bytes
func calculateHashFromBytes(data []byte) string {
	h := sha256.New()
	h.Write(data)
	return fmt.Sprintf("%x", h.Sum(nil))
}

// isZipFile checks whether the filename looks like a ZIP archive.
func isZipFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	return ext == ".zip"
}

func sanitizeZipEntryPath(name string) (string, error) {
	normalized := strings.ReplaceAll(name, "\\", "/")
	for strings.HasPrefix(normalized, "/") {
		normalized = normalized[1:]
	}
	if normalized == "" || strings.Contains(normalized, "..") {
		return "", fmt.Errorf("invalid zip entry path: %s", name)
	}
	return normalized, nil
}

func isInstallerOnlyFile(filename string) bool {
	return strings.ToLower(filepath.Ext(filename)) == ".msi"
}

func isZipEntryPointCandidate(filename, distType string) bool {
	if strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return false
	}
	ext := strings.ToLower(filepath.Ext(filename))
	if distType == "installer" {
		return ext == ".msi" || ext == ".exe"
	}
	return ext == ".exe"
}

func isValidLaunchURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	return (scheme == "http" || scheme == "https") && parsed.Host != ""
}

func validateEntryPointForDistribution(distType, entryPoint string) error {
	lower := strings.ToLower(entryPoint)
	switch distType {
	case "installer":
		if !strings.HasSuffix(lower, ".msi") && !strings.HasSuffix(lower, ".exe") {
			return fmt.Errorf("installer entry_point must be .msi or .exe")
		}
	case "portable":
		if strings.HasSuffix(lower, ".msi") {
			return fmt.Errorf("portable entry_point cannot be .msi")
		}
		if !strings.HasSuffix(lower, ".exe") {
			return fmt.Errorf("portable entry_point must be .exe")
		}
	}
	return nil
}

func validateVersionForRelease(version models.AppVersion) error {
	distType := strings.ToLower(strings.TrimSpace(version.DistributionType))
	if distType == "" {
		distType = "portable"
	}

	switch distType {
	case "url":
		if strings.TrimSpace(version.LaunchURL) == "" {
			return fmt.Errorf("launch_url is required before releasing a URL version")
		}
		if !isValidLaunchURL(version.LaunchURL) {
			return fmt.Errorf("launch_url must start with http:// or https://")
		}
	case "installer":
		if strings.TrimSpace(version.InstallerLaunchPath) == "" {
			return fmt.Errorf("installer_launch_path is required before releasing an installer version")
		}
		if strings.TrimSpace(version.ManifestURL) == "" {
			return fmt.Errorf("manifest is required before releasing an installer version")
		}
		if strings.ToLower(version.InstallerKind) == "msi" && strings.TrimSpace(version.InstallerProductCode) == "" {
			return fmt.Errorf("installer_product_code is required before releasing an MSI installer")
		}
	case "portable":
		if strings.TrimSpace(version.ManifestURL) == "" {
			return fmt.Errorf("manifest is required before releasing a portable version")
		}
	}
	return nil
}

func validateInstallerMetadata(kind string, req CreateVersionRequest) error {
	switch strings.ToLower(kind) {
	case "msi":
		if strings.TrimSpace(req.InstallerProductCode) == "" {
			return fmt.Errorf("installer_product_code is required for MSI installers (for uninstall)")
		}
	case "exe":
		// EXE uninstall is optional — cache-only removal if uninstall path is not set
	}
	return nil
}
