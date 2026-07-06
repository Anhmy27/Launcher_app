package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"backend/config"
	"backend/database"
	"backend/models"
	"backend/services"
	"backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/gosimple/slug"
	"gorm.io/gorm"
)

type AppHandler struct {
	Config *config.Config
}

func NewAppHandler(cfg *config.Config) *AppHandler {
	return &AppHandler{Config: cfg}
}

type CreateAppRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	Category    string `json:"category"`
}

type UpdateAppRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	IconURL     *string `json:"icon_url"`
	BannerURL   *string `json:"banner_url"`
	Category    *string `json:"category"`
	IsPublished *bool   `json:"is_published"`
}

// Create - POST /api/apps
func (h *AppHandler) Create(c *gin.Context) {
	var req CreateAppRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	app := models.Application{
		Name:        req.Name,
		Slug:        slug.Make(req.Name),
		Description: req.Description,
		Category:    req.Category,
		IsPublished: false,
	}

	if err := database.DB.Create(&app).Error; err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "UNIQUE") {
			utils.Error(c, http.StatusConflict, "App with this name already exists")
			return
		}
		utils.Error(c, http.StatusInternalServerError, "Failed to create app")
		return
	}

	utils.Success(c, http.StatusCreated, app)
}

// List - GET /api/apps
func (h *AppHandler) List(c *gin.Context) {
	var apps []models.Application
	query := database.DB

	if category := c.Query("category"); category != "" {
		query = query.Where("category = ?", category)
	}

	if published := c.Query("published"); published == "true" {
		query = query.Where("is_published = ?", true)
	}

	if search := c.Query("search"); search != "" {
		query = query.Where("name ILIKE ?", "%"+search+"%")
	}

	if err := query.Order("created_at DESC").Find(&apps).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to fetch apps")
		return
	}

	utils.Success(c, http.StatusOK, apps)
}

// GetByID - GET /api/apps/:id
func (h *AppHandler) GetByID(c *gin.Context) {
	id := c.Param("id")

	var app models.Application
	if err := database.DB.Preload("Versions", func(db *gorm.DB) *gorm.DB {
		return db.Order("version_code DESC")
	}).First(&app, "id = ?", id).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "App not found")
		return
	}

	utils.Success(c, http.StatusOK, app)
}

// Update - PUT /api/apps/:id
func (h *AppHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var app models.Application
	if err := database.DB.First(&app, "id = ?", id).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "App not found")
		return
	}

	var req UpdateAppRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
		updates["slug"] = slug.Make(*req.Name)
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.IconURL != nil {
		updates["icon_url"] = *req.IconURL
	}
	if req.BannerURL != nil {
		updates["banner_url"] = *req.BannerURL
	}
	if req.Category != nil {
		updates["category"] = *req.Category
	}
	if req.IsPublished != nil {
		updates["is_published"] = *req.IsPublished
	}

	if err := database.DB.Model(&app).Updates(updates).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to update app")
		return
	}

	database.DB.First(&app, "id = ?", id)
	utils.Success(c, http.StatusOK, app)
}

// Delete - DELETE /api/apps/:id
func (h *AppHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	var app models.Application
	if err := database.DB.First(&app, "id = ?", id).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "App not found")
		return
	}

	// Delete all version files from MinIO Storage before deleting from DB
	var versions []models.AppVersion
	database.DB.Where("app_id = ?", id).Find(&versions)

	minioSvc, err := services.NewMinIOStorageService(&h.Config.MinIO)
	if err != nil {
		log.Printf("Warning: failed to initialize MinIO storage: %v", err)
	} else {
		for _, version := range versions {
			folderPath := fmt.Sprintf("apps/%s/%s", id, version.ID.String())
			if err := minioSvc.DeleteFolder(context.Background(), folderPath); err != nil {
				log.Printf("Warning: failed to delete MinIO folder %s: %v", folderPath, err)
			}
		}
	}

	if err := database.DB.Delete(&app).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to delete app")
		return
	}

	utils.Success(c, http.StatusOK, gin.H{"message": "App deleted successfully"})
}

// ListVersions - GET /api/apps/:id/versions
func (h *AppHandler) ListVersions(c *gin.Context) {
	id := c.Param("id")

	var versions []models.AppVersion
	if err := database.DB.Where("app_id = ?", id).Order("version_code DESC").Find(&versions).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to fetch versions")
		return
	}

	utils.Success(c, http.StatusOK, versions)
}
