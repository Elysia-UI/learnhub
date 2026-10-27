ALTER TABLE resource_downloads DROP FOREIGN KEY resource_downloads_ibfk_1;
ALTER TABLE resource_downloads ADD CONSTRAINT fk_resource_download FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE;
