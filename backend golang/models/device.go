package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Device struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	DeviceName string     `gorm:"type:varchar(255);not null" json:"device_name"`
	Hostname   string     `gorm:"type:varchar(255)" json:"hostname"`
	MachineID  string     `gorm:"type:varchar(100);uniqueIndex" json:"machine_id"`
	IPAddress  string     `gorm:"type:varchar(50);index" json:"ip_address"`
	LastSeen   *time.Time `json:"last_seen"`
	IsActive   bool       `gorm:"not null;default:true" json:"is_active"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`

	// Relations
	AppStatus []DeviceAppStatus `gorm:"foreignKey:DeviceID;constraint:OnDelete:CASCADE" json:"-"`
}

func (d *Device) BeforeCreate(tx *gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}

type DeviceAppStatus struct {
	ID                   uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	DeviceID             uuid.UUID  `gorm:"type:uuid;not null;index" json:"device_id"`
	AppID                uuid.UUID  `gorm:"type:uuid;not null;index" json:"app_id"`
	InstalledVersionCode int64      `gorm:"not null;default:0" json:"installed_version_code"`
	InstalledVersionName string     `gorm:"type:varchar(50)" json:"installed_version_name"`
	LastChecked          *time.Time `json:"last_checked"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`

	// Relations
	Device      Device      `gorm:"foreignKey:DeviceID" json:"-"`
	Application Application `gorm:"foreignKey:AppID" json:"-"`
}

func (das *DeviceAppStatus) BeforeCreate(tx *gorm.DB) error {
	if das.ID == uuid.Nil {
		das.ID = uuid.New()
	}
	return nil
}
