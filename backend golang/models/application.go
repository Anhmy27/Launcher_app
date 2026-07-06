package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Application struct {
	ID          uuid.UUID    `gorm:"type:uuid;primaryKey" json:"id"`
	Name        string       `gorm:"type:varchar(255);not null" json:"name"`
	Slug        string       `gorm:"type:varchar(255);uniqueIndex;not null" json:"slug"`
	Description string       `gorm:"type:text" json:"description"`
	IconURL     string       `gorm:"type:varchar(500)" json:"icon_url"`
	BannerURL   string       `gorm:"type:varchar(500)" json:"banner_url"`
	Category    string       `gorm:"type:varchar(100)" json:"category"`
	IsPublished bool         `gorm:"not null;default:false" json:"is_published"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
	Versions    []AppVersion `gorm:"foreignKey:AppID" json:"versions,omitempty"`
}

func (a *Application) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}
