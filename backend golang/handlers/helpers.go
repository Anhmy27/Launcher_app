package handlers

import (
	"backend/models"

	"github.com/gin-gonic/gin"
)

func isAdmin(c *gin.Context) bool {
	role, ok := c.Get("userRole")
	return ok && role == models.RoleAdmin
}
