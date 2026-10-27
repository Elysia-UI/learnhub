-- Run as a database administrator on the intended MySQL 8 instance.
-- This script does not reset an existing schema or contain credentials.
CREATE DATABASE IF NOT EXISTS learnhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create a dedicated account through your database console/secret manager.
-- Replace the host scope with the application server's allowed source.
-- CREATE USER 'learnhub_app'@'APP_SOURCE_HOST' IDENTIFIED BY 'SUPPLY_A_RANDOM_SECRET_PRIVATELY';
-- GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,REFERENCES ON learnhub.* TO 'learnhub_app'@'APP_SOURCE_HOST';
-- Supply DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD only to the server.
-- Then run npm run db:init from the project root.
