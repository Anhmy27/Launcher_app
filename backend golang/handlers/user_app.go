package handlers

import (
	"net/http"

	"backend/database"
	"backend/models"
	"backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type UserAppHandler struct{}

func NewUserAppHandler() *UserAppHandler {
	return &UserAppHandler{}
}

// List - GET /api/me/apps
func (h *UserAppHandler) List(c *gin.Context) {
	userID, _ := c.Get("userID")

	var userApps []models.UserApp
	if err := database.DB.
		Preload("App").
		Where("user_id = ?", userID).
		Find(&userApps).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to fetch apps")
		return
	}

	utils.Success(c, http.StatusOK, userApps)
}

// Install - POST /api/me/apps/:appId/install
// Just adds the app to user's library (no version tracking here)
func (h *UserAppHandler) Install(c *gin.Context) {
	userID, _ := c.Get("userID")
	appID := c.Param("appId")

	uid, ok := userID.(uuid.UUID)
	if !ok {
		utils.Error(c, http.StatusUnauthorized, "Invalid user")
		return
	}

	// Check app exists
	var app models.Application
	if err := database.DB.First(&app, "id = ?", appID).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "App not found")
		return
	}

	appUUID, _ := uuid.Parse(appID)

	// Check if already in library
	var existing models.UserApp
	if err := database.DB.Where("user_id = ? AND app_id = ?", uid, appUUID).First(&existing).Error; err == nil {
		database.DB.Preload("App").First(&existing, "id = ?", existing.ID)
		utils.Success(c, http.StatusOK, existing)
		return
	}

	// Add to user's library
	userApp := models.UserApp{
		UserID: uid,
		AppID:  appUUID,
	}

	if err := database.DB.Create(&userApp).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to add app to library")
		return
	}

	database.DB.Preload("App").First(&userApp, "id = ?", userApp.ID)
	utils.Success(c, http.StatusCreated, userApp)
}

// Uninstall - DELETE /api/me/apps/:appId
// Removes app from user's library
func (h *UserAppHandler) Uninstall(c *gin.Context) {
	userID, _ := c.Get("userID")
	appID := c.Param("appId")

	var userApp models.UserApp
	if err := database.DB.Where("user_id = ? AND app_id = ?", userID, appID).First(&userApp).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "App not in library")
		return
	}

	if err := database.DB.Delete(&userApp).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to remove app from library")
		return
	}

	utils.Success(c, http.StatusOK, gin.H{"message": "App removed from library"})
}
