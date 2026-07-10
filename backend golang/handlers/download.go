package handlers

import (
	"net/http"
	"time"

	"backend/database"
	"backend/models"
	"backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type DownloadHandler struct{}

func NewDownloadHandler() *DownloadHandler {
	return &DownloadHandler{}
}

type UpdateDownloadStatusRequest struct {
	Status         models.DownloadStatus `json:"download_status"`
	LegacyStatus   models.DownloadStatus `json:"status"`
	DownloadedSize int64                 `json:"downloaded_size"`
	ProgressDetail string                `json:"progress_detail"`
}

type DownloadHistoryItem struct {
	ID             uuid.UUID             `json:"id"`
	AppVersionID   uuid.UUID             `json:"app_version_id"`
	AppID          uuid.UUID             `json:"app_id"`
	AppName        string                `json:"app_name"`
	VersionName    string                `json:"version_name"`
	VersionCode    int64                 `json:"version_code"`
	DownloadedSize int64                 `json:"downloaded_size"`
	DownloadStatus models.DownloadStatus `json:"download_status"`
	ProgressDetail string                `json:"progress_detail,omitempty"`
	StartedAt      time.Time             `json:"started_at"`
	CompletedAt    *time.Time            `json:"completed_at"`
	CreatedAt      time.Time             `json:"created_at"`
}

// Start - POST /api/downloads/:appVersionId/start
func (h *DownloadHandler) Start(c *gin.Context) {
	appVersionID := c.Param("appVersionId")

	// Check version exists and is released
	var version models.AppVersion
	if err := database.DB.First(&version, "id = ?", appVersionID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Version not found")
		return
	}
	if !version.IsReleased {
		utils.Error(c, http.StatusBadRequest, "Version is not released")
		return
	}

	var app models.Application
	if err := database.DB.First(&app, "id = ?", version.AppID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "App not found")
		return
	}
	if !app.IsPublished {
		utils.Error(c, http.StatusBadRequest, "App is not published")
		return
	}

	versionUUID, _ := uuid.Parse(appVersionID)

	// Get user ID (can be nil for anonymous)
	var userID *uuid.UUID
	if uid, exists := c.Get("userID"); exists {
		if id, ok := uid.(uuid.UUID); ok {
			userID = &id
		}
	}

	download := models.Download{
		UserID:         userID,
		AppVersionID:   versionUUID,
		DownloadStatus: models.DownloadPending,
		StartedAt:      time.Now(),
		IPAddress:      c.ClientIP(),
	}

	if err := database.DB.Create(&download).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to create download record")
		return
	}

	utils.Success(c, http.StatusCreated, download)
}

// ListMy - GET /api/downloads
func (h *DownloadHandler) ListMy(c *gin.Context) {
	uid, exists := c.Get("userID")
	if !exists {
		utils.Error(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	userID, ok := uid.(uuid.UUID)
	if !ok {
		utils.Error(c, http.StatusUnauthorized, "Invalid user context")
		return
	}

	var history []DownloadHistoryItem
	if err := database.DB.Table("downloads AS d").
		Select(`
			d.id,
			d.app_version_id,
			v.app_id,
			COALESCE(a.name, '') AS app_name,
			v.version_name,
			v.version_code,
			d.downloaded_size,
			d.download_status,
			COALESCE(d.progress_detail, '') AS progress_detail,
			d.started_at,
			d.completed_at,
			d.created_at
		`).
		Joins("JOIN app_versions v ON v.id = d.app_version_id").
		Joins("LEFT JOIN applications a ON a.id = v.app_id").
		Where("d.user_id = ?", userID).
		Order("d.created_at DESC").
		Scan(&history).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to fetch download history")
		return
	}

	utils.Success(c, http.StatusOK, history)
}

// UpdateStatus - PUT /api/downloads/:downloadId/status
func (h *DownloadHandler) UpdateStatus(c *gin.Context) {
	downloadID := c.Param("downloadId")

	var download models.Download
	if err := database.DB.First(&download, "id = ?", downloadID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Download not found")
		return
	}

	var req UpdateDownloadStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	status := req.Status
	if status == "" {
		status = req.LegacyStatus
	}
	if status == "" {
		utils.Error(c, http.StatusBadRequest, "download_status is required")
		return
	}

	updates := map[string]interface{}{
		"download_status": status,
		"downloaded_size": req.DownloadedSize,
		"progress_detail": req.ProgressDetail,
	}

	if status == models.DownloadCompleted || status == models.DownloadFailed {
		now := time.Now()
		updates["completed_at"] = now
	}

	if err := database.DB.Model(&download).Updates(updates).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to update download status")
		return
	}

	database.DB.First(&download, "id = ?", downloadID)
	utils.Success(c, http.StatusOK, download)
}

// GetByID - GET /api/downloads/:downloadId
func (h *DownloadHandler) GetByID(c *gin.Context) {
	downloadID := c.Param("downloadId")

	var download models.Download
	if err := database.DB.Preload("AppVersion").First(&download, "id = ?", downloadID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Download not found")
		return
	}

	utils.Success(c, http.StatusOK, download)
}

// DeleteMy - DELETE /api/downloads/:downloadId
func (h *DownloadHandler) DeleteMy(c *gin.Context) {
	downloadID := c.Param("downloadId")

	uid, exists := c.Get("userID")
	if !exists {
		utils.Error(c, http.StatusUnauthorized, "Unauthorized")
		return
	}

	userID, ok := uid.(uuid.UUID)
	if !ok {
		utils.Error(c, http.StatusUnauthorized, "Invalid user context")
		return
	}

	result := database.DB.Where("id = ? AND user_id = ?", downloadID, userID).Delete(&models.Download{})
	if result.Error != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to delete download history")
		return
	}

	if result.RowsAffected == 0 {
		utils.Error(c, http.StatusNotFound, "Download history not found")
		return
	}

	utils.Success(c, http.StatusOK, gin.H{"message": "Download history deleted"})
}
