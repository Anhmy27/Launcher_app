package handlers

import (
	"net/http"

	"backend/database"
	"backend/models"
	"backend/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type UserHandler struct{}

func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

type ResetPasswordRequest struct {
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// List - GET /api/users (admin)
func (h *UserHandler) List(c *gin.Context) {
	var users []models.User
	query := database.DB

	if role := c.Query("role"); role != "" {
		query = query.Where("role = ?", role)
	}

	if search := c.Query("search"); search != "" {
		query = query.Where("full_name ILIKE ? OR email ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	if err := query.Order("created_at DESC").Find(&users).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to fetch users")
		return
	}

	utils.Success(c, http.StatusOK, users)
}

// GetByID - GET /api/users/:id (admin)
func (h *UserHandler) GetByID(c *gin.Context) {
	id := c.Param("id")

	var user models.User
	if err := database.DB.First(&user, "id = ?", id).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "User not found")
		return
	}

	utils.Success(c, http.StatusOK, user)
}

// ToggleActive - PUT /api/users/:id/toggle-active (admin ban/unban)
func (h *UserHandler) ToggleActive(c *gin.Context) {
	id := c.Param("id")

	var user models.User
	if err := database.DB.First(&user, "id = ?", id).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "User not found")
		return
	}

	user.IsActive = !user.IsActive
	if err := database.DB.Save(&user).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to update user")
		return
	}

	utils.Success(c, http.StatusOK, user)
}

// ResetPassword - PUT /api/users/:id/reset-password (admin)
func (h *UserHandler) ResetPassword(c *gin.Context) {
	id := c.Param("id")

	var user models.User
	if err := database.DB.First(&user, "id = ?", id).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "User not found")
		return
	}

	var req ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, err.Error())
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	if err := database.DB.Model(&user).Update("password_hash", string(hashedPassword)).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "Failed to reset password")
		return
	}

	utils.Success(c, http.StatusOK, gin.H{"message": "Password reset successfully"})
}
