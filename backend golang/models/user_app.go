package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type UserApp struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	AppID     uuid.UUID `gorm:"type:uuid;not null;index" json:"app_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	User User        `gorm:"foreignKey:UserID" json:"-"`
	App  Application `gorm:"foreignKey:AppID" json:"app,omitempty"`
}

func (ua *UserApp) BeforeCreate(tx *gorm.DB) error {
	if ua.ID == uuid.Nil {
		ua.ID = uuid.New()
	}
	return nil
}
