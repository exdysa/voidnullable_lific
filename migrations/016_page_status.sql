ALTER TABLE pages ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','complete','archived'));
CREATE INDEX idx_pages_status ON pages(status);
