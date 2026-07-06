package config

import (
	"os"
	"time"
)

type Config struct {
	DB     DBConfig
	JWT    JWTConfig
	Server ServerConfig
	MinIO  MinIOConfig
}

type DBConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
}

type JWTConfig struct {
	Secret        string
	Expiry        time.Duration
	RefreshExpiry time.Duration
}

type ServerConfig struct {
	Port string
}

type MinIOConfig struct {
	Endpoint      string
	AccessKey     string
	SecretKey     string
	Bucket        string
	UseSSL        bool
	PublicRead    bool
	PublicBaseURL string
}

func Load() *Config {
	return &Config{
		DB: DBConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "launcher"),
			Password: getEnv("DB_PASSWORD", "launcher123"),
			Name:     getEnv("DB_NAME", "launcher_app"),
		},
		JWT: JWTConfig{
			Secret:        getEnv("JWT_SECRET", "your-super-secret-key-change-this-in-production"),
			Expiry:        parseDuration(getEnv("JWT_EXPIRY", "24h")),
			RefreshExpiry: parseDuration(getEnv("JWT_REFRESH_EXPIRY", "168h")),
		},
		Server: ServerConfig{
			Port: getEnv("SERVER_PORT", "8080"),
		},
		MinIO: MinIOConfig{
			Endpoint:      getEnv("MINIO_ENDPOINT", "localhost:9000"),
			AccessKey:     getEnv("MINIO_ACCESS_KEY", ""),
			SecretKey:     getEnv("MINIO_SECRET_KEY", ""),
			Bucket:        getEnv("MINIO_BUCKET", "test-minio"),
			UseSSL:        getEnvAsBool("MINIO_USE_SSL", false),
			PublicRead:    getEnvAsBool("MINIO_PUBLIC_READ", true),
			PublicBaseURL: getEnv("MINIO_PUBLIC_BASE_URL", "http://localhost:9000"),
		},
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return 24 * time.Hour
	}
	return d
}

func getEnvAsBool(key string, fallback bool) bool {
	value, exists := os.LookupEnv(key)
	if !exists {
		return fallback
	}

	switch value {
	case "1", "true", "TRUE", "True", "yes", "YES", "on", "ON":
		return true
	case "0", "false", "FALSE", "False", "no", "NO", "off", "OFF":
		return false
	default:
		return fallback
	}
}
