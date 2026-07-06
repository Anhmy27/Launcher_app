package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type DownloadStatus string

const (
	DownloadPending    DownloadStatus = "pending"
	DownloadInProgress DownloadStatus = "in_progress"
	DownloadCompleted  DownloadStatus = "completed"
	DownloadFailed     DownloadStatus = "failed"
)

type Download struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	UserID         *uuid.UUID     `gorm:"type:uuid;index" json:"user_id"`
	AppVersionID   uuid.UUID      `gorm:"type:uuid;not null;index" json:"app_version_id"`
	DownloadedSize int64          `gorm:"not null;default:0" json:"downloaded_size"`
	DownloadStatus DownloadStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"download_status"`
	ProgressDetail string         `gorm:"type:text" json:"progress_detail,omitempty"`
	StartedAt      time.Time      `gorm:"not null" json:"started_at"`
	CompletedAt    *time.Time     `json:"completed_at"`
	IPAddress      string         `gorm:"type:varchar(50)" json:"ip_address"`
	CreatedAt      time.Time      `json:"created_at"`

	User       *User      `gorm:"foreignKey:UserID" json:"-"`
	AppVersion AppVersion `gorm:"foreignKey:AppVersionID" json:"app_version,omitempty"`
}

func (d *Download) BeforeCreate(tx *gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}
