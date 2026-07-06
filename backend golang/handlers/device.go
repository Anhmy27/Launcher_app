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

// Register request
type RegisterDeviceRequest struct {
	DeviceName string `json:"device_name" binding:"required"`
	Hostname   string `json:"hostname"`
	MachineID  string `json:"machine_id" binding:"required"`
	IPAddress  string `json:"ip_address"`
	DeviceID   string `json:"device_id"`
}

// Heartbeat request
type HeartbeatRequest struct {
	IPAddress string `json:"ip_address"`
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

	// Check if device already exists
	var existingDevice models.Device

	// First, try to find by Device ID if provided
	if req.DeviceID != "" {
		result := database.DB.Where("id = ?", req.DeviceID).First(&existingDevice)
		if result.Error == nil {
			// Found by ID, update it
			now := time.Now()
			if err := database.DB.Model(&existingDevice).Updates(map[string]interface{}{
				"device_name": req.DeviceName,
				"hostname":    req.Hostname,
				"machine_id":  req.MachineID,
				"ip_address":  req.IPAddress,
				"last_seen":   now,
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
			"device_name": req.DeviceName,
			"hostname":    req.Hostname,
			"ip_address":  req.IPAddress,
			"last_seen":   now,
		}).Error; err != nil {
			utils.Error(c, http.StatusInternalServerError, "Failed to update device")
			return
		}
		utils.Success(c, http.StatusOK, existingDevice)
		return
	}

	// Create new device
	device := models.Device{
		ID:         uuid.New(),
		DeviceName: req.DeviceName,
		Hostname:   req.Hostname,
		MachineID:  req.MachineID,
		IPAddress:  req.IPAddress,
		IsActive:   true,
		LastSeen:   utils.TimePtr(time.Now()),
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

	now := time.Now()
	if err := database.DB.Model(&device).Updates(map[string]interface{}{
		"last_seen":  now,
		"ip_address": req.IPAddress,
	}).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to update heartbeat")
		return
	}

	utils.Success(c, http.StatusOK, gin.H{"message": "Heartbeat received"})
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

// GetAllDevices - GET /api/admin/devices
func (h *DeviceHandler) GetAllDevices(c *gin.Context) {
	var devices []models.Device

	if err := database.DB.Preload("AppStatus").
		Order("created_at DESC").
		Find(&devices).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to fetch devices")
		return
	}

	utils.Success(c, http.StatusOK, devices)
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
