package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"path"
	"strings"

	"backend/config"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIOStorageService struct {
	config *config.MinIOConfig
	client *minio.Client
}

func NewMinIOStorageService(cfg *config.MinIOConfig) (*MinIOStorageService, error) {
	minioClient, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create minio client: %w", err)
	}

	service := &MinIOStorageService{
		config: cfg,
		client: minioClient,
	}

	if err := service.ensureBucket(context.Background()); err != nil {
		return nil, err
	}

	return service, nil
}

func (s *MinIOStorageService) UploadFile(ctx context.Context, objectPath string, fileContent []byte, contentType ...string) (string, error) {
	ct := "application/octet-stream"
	if len(contentType) > 0 && contentType[0] != "" {
		ct = contentType[0]
	}

	cleanPath := strings.TrimPrefix(path.Clean("/"+objectPath), "/")
	_, err := s.client.PutObject(ctx, s.config.Bucket, cleanPath, bytes.NewReader(fileContent), int64(len(fileContent)), minio.PutObjectOptions{
		ContentType: ct,
	})
	if err != nil {
		return "", fmt.Errorf("minio upload failed: %w", err)
	}

	return s.buildPublicURL(cleanPath), nil
}

func (s *MinIOStorageService) DeleteFile(ctx context.Context, objectPath string) error {
	cleanPath := strings.TrimPrefix(path.Clean("/"+objectPath), "/")
	err := s.client.RemoveObject(ctx, s.config.Bucket, cleanPath, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("minio delete failed for %s: %w", cleanPath, err)
	}

	return nil
}

func (s *MinIOStorageService) DeleteFiles(ctx context.Context, objectPaths []string) error {
	if len(objectPaths) == 0 {
		return nil
	}

	for _, objectPath := range objectPaths {
		if err := s.DeleteFile(ctx, objectPath); err != nil {
			return err
		}
	}

	return nil
}

func (s *MinIOStorageService) ListFiles(ctx context.Context, prefix string) ([]string, error) {
	cleanPrefix := strings.TrimPrefix(path.Clean("/"+prefix), "/")
	if cleanPrefix != "" && !strings.HasSuffix(cleanPrefix, "/") {
		cleanPrefix += "/"
	}

	var paths []string
	for objectInfo := range s.client.ListObjects(ctx, s.config.Bucket, minio.ListObjectsOptions{
		Prefix:    cleanPrefix,
		Recursive: true,
	}) {
		if objectInfo.Err != nil {
			return nil, fmt.Errorf("minio list failed: %w", objectInfo.Err)
		}
		paths = append(paths, objectInfo.Key)
	}

	return paths, nil
}

func (s *MinIOStorageService) DeleteFolder(ctx context.Context, prefix string) error {
	files, err := s.ListFiles(ctx, prefix)
	if err != nil {
		log.Printf("Warning: failed to list files in %s: %v", prefix, err)
		return err
	}

	if len(files) == 0 {
		log.Printf("No files found in folder: %s", prefix)
		return nil
	}

	log.Printf("Deleting %d files from MinIO folder: %s", len(files), prefix)
	return s.DeleteFiles(ctx, files)
}

func (s *MinIOStorageService) ensureBucket(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.config.Bucket)
	if err != nil {
		return fmt.Errorf("failed to check minio bucket: %w", err)
	}

	if !exists {
		if err := s.client.MakeBucket(ctx, s.config.Bucket, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("failed to create minio bucket %s: %w", s.config.Bucket, err)
		}
	}

	if s.config.PublicRead {
		if err := s.ensurePublicReadPolicy(ctx); err != nil {
			return err
		}
	}

	return nil
}

func (s *MinIOStorageService) ensurePublicReadPolicy(ctx context.Context) error {
	policy := map[string]interface{}{
		"Version": "2012-10-17",
		"Statement": []map[string]interface{}{
			{
				"Effect":    "Allow",
				"Principal": map[string]interface{}{"AWS": []string{"*"}},
				"Action":    []string{"s3:GetObject"},
				"Resource":  []string{fmt.Sprintf("arn:aws:s3:::%s/*", s.config.Bucket)},
			},
		},
	}

	policyJSON, err := json.Marshal(policy)
	if err != nil {
		return fmt.Errorf("failed to build minio public policy: %w", err)
	}

	if err := s.client.SetBucketPolicy(ctx, s.config.Bucket, string(policyJSON)); err != nil {
		return fmt.Errorf("failed to set minio public policy for bucket %s: %w", s.config.Bucket, err)
	}

	return nil
}

func (s *MinIOStorageService) buildPublicURL(objectPath string) string {
	base := strings.TrimSuffix(s.config.PublicBaseURL, "/")
	return fmt.Sprintf("%s/%s/%s", base, s.config.Bucket, encodeObjectPath(objectPath))
}

func encodeObjectPath(objectPath string) string {
	parts := strings.Split(objectPath, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	return strings.Join(parts, "/")
}
