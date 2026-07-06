-- Create applications table
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    banner_url VARCHAR(500),
    category VARCHAR(100),
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on slug
CREATE INDEX IF NOT EXISTS idx_applications_slug ON applications(slug);

-- Create index on category
CREATE INDEX IF NOT EXISTS idx_applications_category ON applications(category);

-- Create index on is_published
CREATE INDEX IF NOT EXISTS idx_applications_published ON applications(is_published);
