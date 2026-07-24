package routes

import (
	"backend/config"
	"backend/handlers"
	"backend/middleware"

	"github.com/gin-gonic/gin"
)

func Setup(r *gin.Engine, cfg *config.Config) {
	// Init handlers
	authHandler := handlers.NewAuthHandler(cfg)
	appHandler := handlers.NewAppHandler(cfg)
	versionHandler := handlers.NewAppVersionHandler(cfg)
	userAppHandler := handlers.NewUserAppHandler()
	downloadHandler := handlers.NewDownloadHandler()
	userHandler := handlers.NewUserHandler()
	deviceHandler := handlers.NewDeviceHandler(cfg)

	api := r.Group("/api")
	{
		// ==================== Public routes ====================
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
			auth.POST("/refresh", authHandler.Refresh)
		}
		api.GET("/ws/devices", deviceHandler.SubscribeDevicesWS)

		// ==================== Protected routes ====================
		protected := api.Group("")
		protected.Use(middleware.AuthMiddleware(cfg))
		{
			// Auth
			protected.GET("/auth/me", authHandler.Me)

			// Apps - listing (authenticated users)
			protected.GET("/apps", appHandler.List)
			protected.GET("/apps/:id", appHandler.GetByID)
			protected.GET("/apps/:id/versions", appHandler.ListVersions)
			protected.GET("/apps/:id/versions/:versionId", versionHandler.GetByID)

			// User apps - customer
			me := protected.Group("/me")
			{
				me.GET("/apps", userAppHandler.List)
				me.POST("/apps/:appId/install", userAppHandler.Install)
				me.DELETE("/apps/:appId", userAppHandler.Uninstall)
			}

			// Downloads
			protected.GET("/downloads", downloadHandler.ListMy)
			protected.POST("/downloads/:appVersionId/start", downloadHandler.Start)
			protected.PUT("/downloads/:downloadId/status", downloadHandler.UpdateStatus)
			protected.GET("/downloads/:downloadId", downloadHandler.GetByID)
			protected.DELETE("/downloads/:downloadId", downloadHandler.DeleteMy)

			// Device management (client)
			protected.POST("/devices/register", deviceHandler.Register)
			protected.POST("/devices/:id/heartbeat", deviceHandler.Heartbeat)
			protected.POST("/devices/:id/logout", deviceHandler.Logout)
			protected.POST("/devices/:id/apps/sync", deviceHandler.SyncApps)
			protected.DELETE("/devices/:id/apps/:appId", deviceHandler.DeleteDeviceApp)
			protected.GET("/devices/:id/status", deviceHandler.GetDeviceStatus)

			// ==================== Admin only ====================
			admin := protected.Group("")
			admin.Use(middleware.AdminOnly())
			{
				// App management
				admin.POST("/apps", appHandler.Create)
				admin.PUT("/apps/:id", appHandler.Update)
				admin.DELETE("/apps/:id", appHandler.Delete)

				// Version management
				admin.POST("/apps/:id/versions", versionHandler.Create)
				admin.PUT("/apps/:id/versions/:versionId", versionHandler.Update)
				admin.DELETE("/apps/:id/versions/:versionId", versionHandler.Delete)
				admin.POST("/apps/:id/versions/:versionId/release", versionHandler.Release)

				// User management
				admin.GET("/users", userHandler.List)
				admin.GET("/users/:id", userHandler.GetByID)
				admin.PUT("/users/:id/toggle-active", userHandler.ToggleActive)
				admin.PUT("/users/:id/reset-password", userHandler.ResetPassword)

				// Device management
				admin.GET("/devices", deviceHandler.GetAllDevices)
				admin.GET("/devices/:id", deviceHandler.GetDeviceDetail)
				admin.PUT("/devices/:id", deviceHandler.UpdateDevice)
				admin.DELETE("/devices/:id", deviceHandler.DeleteDevice)
			}
		}
	}
}
