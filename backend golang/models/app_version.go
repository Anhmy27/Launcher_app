package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AppVersion struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	AppID       uuid.UUID  `gorm:"type:uuid;not null;index" json:"app_id"`
	VersionName string     `gorm:"type:varchar(50);not null" json:"version_name"`
	VersionCode int64      `gorm:"not null" json:"version_code"`
	Description string     `gorm:"type:text" json:"description"`
	FileSize    int64      `gorm:"not null;default:0" json:"file_size"`
	FileHash    string     `gorm:"type:varchar(255)" json:"file_hash"`
	ManifestURL string     `gorm:"column:manifest_url;type:varchar(500)" json:"manifest_url"`
	DistributionType   string `gorm:"type:varchar(20);not null;default:'portable'" json:"distribution_type"`
	InstallerKind      string `gorm:"type:varchar(20)" json:"installer_kind"`
	InstallerSilentArgs string `gorm:"type:varchar(1000)" json:"installer_silent_args"`
	InstallerLaunchPath string `gorm:"type:varchar(1000)" json:"installer_launch_path"`
	InstallerProductCode   string `gorm:"type:varchar(100)" json:"installer_product_code"`
	InstallerUninstallPath string `gorm:"type:varchar(1000)" json:"installer_uninstall_path"`
	InstallerUninstallArgs string `gorm:"type:varchar(1000)" json:"installer_uninstall_args"`
	IsReleased  bool       `gorm:"not null;default:false" json:"is_released"`
	IsRequired  bool       `gorm:"not null;default:false" json:"is_required"`
	ReleaseDate *time.Time `json:"release_date"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`

	App Application `gorm:"foreignKey:AppID" json:"-"`
}

func (v *AppVersion) BeforeCreate(tx *gorm.DB) error {
	if v.ID == uuid.Nil {
		v.ID = uuid.New()
	}
	return nil
}
