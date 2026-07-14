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

type DeviceHandler struct{}

func NewDeviceHandler() *DeviceHandler {
	return &DeviceHandler{}
}

// onlineThreshold: a device is considered online if its last heartbeat is
// within this window. The client sends heartbeats roughly every 45s.
const onlineThreshold = 2 * time.Minute

// Register request
type RegisterDeviceRequest struct {
	DeviceName string `json:"device_name" binding:"required"`
	Hostname   string `json:"hostname"`
	MachineID  string `json:"machine_id" binding:"required"`
	IPAddress  string `json:"ip_address"`
	DeviceID   string `json:"device_id"`
}

// ActiveAppSession describes a launcher app currently running on the client.
type ActiveAppSession struct {
	AppID uuid.UUID `json:"app_id" binding:"required"`
	PID   int       `json:"pid"`
}

// Heartbeat request
type HeartbeatRequest struct {
	IPAddress  string             `json:"ip_address"`
	ActiveApps []ActiveAppSession `json:"active_apps"`
}

// currentUserID reads the authenticated user id from the gin context.
func currentUserID(c *gin.Context) *uuid.UUID {
	val, exists := c.Get("userID")
	if !exists {
		return nil
	}
	if id, ok := val.(uuid.UUID); ok {
		return &id
	}
	return nil
}

// Sync apps request
type SyncAppRequest struct {
	AppID                uuid.UUID `json:"app_id" binding:"required"`
	InstalledVersionCode int64     `json:"installed_version_code"`
	InstalledVersionName string    `json:"installed_version_name"`
}

type SyncAppsRequest struct {
	Apps []SyncAppRequest `json:"apps" binding:"required"`
}

// Register - POST /api/devices/register
func (h *DeviceHandler) Register(c *gin.Context) {
	var req RegisterDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	userID := currentUserID(c)

	// Check if device already exists
	var existingDevice models.Device

	// First, try to find by Device ID if provided
	if req.DeviceID != "" {
		result := database.DB.Where("id = ?", req.DeviceID).First(&existingDevice)
		if result.Error == nil {
			// Found by ID, update it. A different user may now be signed in on
			// the same machine, so always refresh current_user_id.
			now := time.Now()
			if err := database.DB.Model(&existingDevice).Updates(map[string]interface{}{
				"device_name":     req.DeviceName,
				"hostname":        req.Hostname,
				"machine_id":      req.MachineID,
				"ip_address":      req.IPAddress,
				"current_user_id": userID,
				"last_seen":       now,
			}).Error; err != nil {
				utils.Error(c, http.StatusInternalServerError, "Failed to update device")
				return
			}
			database.DB.First(&existingDevice, "id = ?", req.DeviceID)
			utils.Success(c, http.StatusOK, existingDevice)
			return
		}
	}

	// Otherwise, try to find by Machine ID (Windows Machine GUID)
	result := database.DB.Where("machine_id = ?", req.MachineID).First(&existingDevice)
	if result.Error == nil {
		// Device exists, update it
		now := time.Now()
		if err := database.DB.Model(&existingDevice).Updates(map[string]interface{}{
			"device_name":     req.DeviceName,
			"hostname":        req.Hostname,
			"ip_address":      req.IPAddress,
			"current_user_id": userID,
			"last_seen":       now,
		}).Error; err != nil {
			utils.Error(c, http.StatusInternalServerError, "Failed to update device")
			return
		}
		database.DB.First(&existingDevice, "id = ?", existingDevice.ID)
		utils.Success(c, http.StatusOK, existingDevice)
		return
	}

	// Create new device
	device := models.Device{
		ID:            uuid.New(),
		DeviceName:    req.DeviceName,
		Hostname:      req.Hostname,
		MachineID:     req.MachineID,
		IPAddress:     req.IPAddress,
		CurrentUserID: userID,
		IsActive:      true,
		LastSeen:      utils.TimePtr(time.Now()),
	}

	if err := database.DB.Create(&device).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to register device")
		return
	}

	utils.Success(c, http.StatusCreated, device)
}

// Heartbeat - POST /api/devices/:id/heartbeat
func (h *DeviceHandler) Heartbeat(c *gin.Context) {
	deviceID := c.Param("id")

	var device models.Device
	if err := database.DB.First(&device, "id = ?", deviceID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Device not found")
		return
	}

	var req HeartbeatRequest
	c.ShouldBindJSON(&req)

	userID := currentUserID(c)
	now := time.Now()

	updates := map[string]interface{}{
		"last_seen": now,
	}
	if req.IPAddress != "" {
		updates["ip_address"] = req.IPAddress
	}
	if userID != nil {
		updates["current_user_id"] = userID
	}
	if err := database.DB.Model(&device).Updates(updates).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to update heartbeat")
		return
	}

	// Reconcile running app sessions with what the client reports.
	reconcileSessions(device.ID, userID, req.ActiveApps, now)

	utils.Success(c, http.StatusOK, gin.H{"message": "Heartbeat received"})
}

// reconcileSessions makes the open sessions for a device match the set of apps
// the client currently reports as running. New apps are opened, missing apps
// are closed (ended_at set).
func reconcileSessions(deviceID uuid.UUID, userID *uuid.UUID, active []ActiveAppSession, now time.Time) {
	var openSessions []models.DeviceAppSession
	database.DB.Where("device_id = ? AND ended_at IS NULL", deviceID).Find(&openSessions)

	activeByApp := make(map[uuid.UUID]ActiveAppSession, len(active))
	for _, a := range active {
		activeByApp[a.AppID] = a
	}

	openByApp := make(map[uuid.UUID]models.DeviceAppSession, len(openSessions))
	for _, s := range openSessions {
		// Close sessions for apps no longer running.
		if _, stillRunning := activeByApp[s.AppID]; !stillRunning {
			database.DB.Model(&models.DeviceAppSession{}).
				Where("id = ?", s.ID).
				Updates(map[string]interface{}{"ended_at": now, "last_seen": now})
			continue
		}
		openByApp[s.AppID] = s
	}

	for appID, a := range activeByApp {
		if existing, ok := openByApp[appID]; ok {
			// Refresh existing open session.
			database.DB.Model(&models.DeviceAppSession{}).
				Where("id = ?", existing.ID).
				Updates(map[string]interface{}{"last_seen": now, "pid": a.PID})
			continue
		}
		// Start a new session.
		session := models.DeviceAppSession{
			ID:        uuid.New(),
			DeviceID:  deviceID,
			AppID:     appID,
			UserID:    userID,
			PID:       a.PID,
			StartedAt: now,
			LastSeen:  now,
		}
		database.DB.Create(&session)
	}
}

// Logout - POST /api/devices/:id/logout
// Clears the current user and closes all open app sessions for the device.
func (h *DeviceHandler) Logout(c *gin.Context) {
	deviceID := c.Param("id")

	var device models.Device
	if err := database.DB.First(&device, "id = ?", deviceID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Device not found")
		return
	}

	now := time.Now()
	database.DB.Model(&models.DeviceAppSession{}).
		Where("device_id = ? AND ended_at IS NULL", device.ID).
		Updates(map[string]interface{}{"ended_at": now, "last_seen": now})

	database.DB.Model(&device).Updates(map[string]interface{}{
		"current_user_id": nil,
		"last_seen":       now,
	})

	utils.Success(c, http.StatusOK, gin.H{"message": "Device logged out"})
}

// SyncApps - POST /api/devices/:id/apps/sync
func (h *DeviceHandler) SyncApps(c *gin.Context) {
	deviceID := c.Param("id")

	var device models.Device
	if err := database.DB.First(&device, "id = ?", deviceID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Device not found")
		return
	}

	var req SyncAppsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	deviceUUID, _ := uuid.Parse(deviceID)
	now := time.Now()

	// Upsert each app status
	for _, app := range req.Apps {
		var status models.DeviceAppStatus
		result := database.DB.Where("device_id = ? AND app_id = ?", deviceUUID, app.AppID).
			First(&status)

		if result.Error == nil {
			// Update existing
			database.DB.Model(&status).Updates(map[string]interface{}{
				"installed_version_code": app.InstalledVersionCode,
				"installed_version_name": app.InstalledVersionName,
				"last_checked":           now,
			})
		} else {
			// Create new
			newStatus := models.DeviceAppStatus{
				ID:                   uuid.New(),
				DeviceID:             deviceUUID,
				AppID:                app.AppID,
				InstalledVersionCode: app.InstalledVersionCode,
				InstalledVersionName: app.InstalledVersionName,
				LastChecked:          utils.TimePtr(now),
			}
			database.DB.Create(&newStatus)
		}
	}

	utils.Success(c, http.StatusOK, gin.H{"message": "Apps synced successfully"})
}

// GetDeviceStatus - GET /api/devices/:id/status
func (h *DeviceHandler) GetDeviceStatus(c *gin.Context) {
	deviceID := c.Param("id")

	var device models.Device
	if err := database.DB.First(&device, "id = ?", deviceID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Device not found")
		return
	}

	// Get app status for this device
	var appStatus []models.DeviceAppStatus
	database.DB.Where("device_id = ?", deviceID).
		Preload("Application").
		Find(&appStatus)

	result := gin.H{
		"device":     device,
		"app_status": appStatus,
	}

	utils.Success(c, http.StatusOK, result)
}

// RunningAppInfo is a compact view of an app running on a device.
type RunningAppInfo struct {
	AppID     uuid.UUID `json:"app_id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	IconURL   string    `json:"icon_url"`
	PID       int       `json:"pid"`
	StartedAt time.Time `json:"started_at"`
}

// DevicePresence is the admin-facing presence view of a device.
type DevicePresence struct {
	models.Device
	IsOnline    bool             `json:"is_online"`
	RunningApps []RunningAppInfo `json:"running_apps"`
}

// buildRunningApps loads open sessions for a device as compact app info.
func buildRunningApps(deviceID uuid.UUID, online bool) []RunningAppInfo {
	running := []RunningAppInfo{}
	if !online {
		return running
	}
	var sessions []models.DeviceAppSession
	database.DB.Where("device_id = ? AND ended_at IS NULL", deviceID).
		Preload("Application").
		Order("started_at ASC").
		Find(&sessions)
	for _, s := range sessions {
		running = append(running, RunningAppInfo{
			AppID:     s.AppID,
			Name:      s.Application.Name,
			Slug:      s.Application.Slug,
			IconURL:   s.Application.IconURL,
			PID:       s.PID,
			StartedAt: s.StartedAt,
		})
	}
	return running
}

// GetAllDevices - GET /api/admin/devices
func (h *DeviceHandler) GetAllDevices(c *gin.Context) {
	var devices []models.Device

	if err := database.DB.
		Preload("CurrentUser").
		Order("last_seen DESC NULLS LAST").
		Find(&devices).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to fetch devices")
		return
	}

	cutoff := time.Now().Add(-onlineThreshold)
	result := make([]DevicePresence, 0, len(devices))
	for _, d := range devices {
		online := d.LastSeen != nil && d.LastSeen.After(cutoff)
		result = append(result, DevicePresence{
			Device:      d,
			IsOnline:    online,
			RunningApps: buildRunningApps(d.ID, online),
		})
	}

	utils.Success(c, http.StatusOK, result)
}

// GetDeviceDetail - GET /api/admin/devices/:id
// Full presence detail: machine info, current user, running apps, installed apps.
func (h *DeviceHandler) GetDeviceDetail(c *gin.Context) {
	deviceID := c.Param("id")

	var device models.Device
	if err := database.DB.Preload("CurrentUser").First(&device, "id = ?", deviceID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Device not found")
		return
	}

	online := device.LastSeen != nil && device.LastSeen.After(time.Now().Add(-onlineThreshold))

	var appStatus []models.DeviceAppStatus
	database.DB.Where("device_id = ?", device.ID).
		Preload("Application").
		Find(&appStatus)

	installed := make([]gin.H, 0, len(appStatus))
	for _, s := range appStatus {
		installed = append(installed, gin.H{
			"app_id":                 s.AppID,
			"name":                   s.Application.Name,
			"slug":                   s.Application.Slug,
			"icon_url":               s.Application.IconURL,
			"installed_version_code": s.InstalledVersionCode,
			"installed_version_name": s.InstalledVersionName,
			"last_checked":           s.LastChecked,
		})
	}

	utils.Success(c, http.StatusOK, gin.H{
		"device":         device,
		"is_online":      online,
		"running_apps":   buildRunningApps(device.ID, online),
		"installed_apps": installed,
	})
}

// UpdateDevice - PUT /api/admin/devices/:id
func (h *DeviceHandler) UpdateDevice(c *gin.Context) {
	deviceID := c.Param("id")

	var device models.Device
	if err := database.DB.First(&device, "id = ?", deviceID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Device not found")
		return
	}

	var req struct {
		DeviceName *string `json:"device_name"`
		IsActive   *bool   `json:"is_active"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	updates := map[string]interface{}{}
	if req.DeviceName != nil {
		updates["device_name"] = *req.DeviceName
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}

	if err := database.DB.Model(&device).Updates(updates).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to update device")
		return
	}

	database.DB.First(&device, "id = ?", deviceID)
	utils.Success(c, http.StatusOK, device)
}

// DeleteDeviceApp - DELETE /api/devices/:id/apps/:appId
// Removes the device_app_status record when app is uninstalled from a device
func (h *DeviceHandler) DeleteDeviceApp(c *gin.Context) {
	deviceID := c.Param("id")
	appID := c.Param("appId")

	result := database.DB.Where("device_id = ? AND app_id = ?", deviceID, appID).
		Delete(&models.DeviceAppStatus{})

	if result.Error != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to delete device app status")
		return
	}

	utils.Success(c, http.StatusOK, gin.H{"message": "Device app status deleted"})
}

// DeleteDevice - DELETE /api/admin/devices/:id
func (h *DeviceHandler) DeleteDevice(c *gin.Context) {
	deviceID := c.Param("id")

	var device models.Device
	if err := database.DB.First(&device, "id = ?", deviceID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "Device not found")
		return
	}

	if err := database.DB.Delete(&device).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to delete device")
		return
	}

	utils.Success(c, http.StatusOK, gin.H{"message": "Device deleted successfully"})
}
