ALTER TABLE posts MODIFY status ENUM('published','pending','rejected') NOT NULL DEFAULT 'pending', ADD review_reason VARCHAR(500) NOT NULL DEFAULT '', ADD reviewed_at DATETIME(3) NULL, ADD INDEX idx_posts_status_created(status,created_at);
ALTER TABLE categories ADD enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE announcements ADD status ENUM('draft','published') NOT NULL DEFAULT 'published', ADD INDEX idx_announcements_status(status,created_at);
CREATE TABLE course_reviews (
 id VARCHAR(64) PRIMARY KEY, course_id VARCHAR(64) NOT NULL, user_id VARCHAR(64) NOT NULL,
 rating TINYINT UNSIGNED NOT NULL, content TEXT NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_course_review(course_id,user_id), INDEX idx_reviews_created(course_id,created_at),
 FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, CHECK(rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;
UPDATE courses SET rating=0;
ALTER TABLE questions ADD bounty_status ENUM('none','held','paid','refunded') NOT NULL DEFAULT 'none';
UPDATE questions SET bounty=0 WHERE bounty_status='none';
CREATE TABLE user_badges (
 user_id VARCHAR(64) NOT NULL, badge VARCHAR(40) NOT NULL, earned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(user_id,badge), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
ALTER TABLE ai_conversations ADD kind ENUM('draft','chat') NOT NULL DEFAULT 'draft', ADD updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ADD INDEX idx_ai_owner(user_id,kind,updated_at);
CREATE TABLE ai_messages (
 id VARCHAR(64) PRIMARY KEY, conversation_id VARCHAR(64) NOT NULL, request_key VARCHAR(64) NOT NULL,
 role ENUM('user','assistant') NOT NULL, content MEDIUMTEXT NOT NULL,
 status ENUM('pending','complete','failed','cancelled') NOT NULL DEFAULT 'complete', error VARCHAR(500) NOT NULL DEFAULT '',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_ai_request(conversation_id,request_key,role), INDEX idx_ai_messages(conversation_id,created_at),
 FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE request_receipts (
 user_id VARCHAR(64) NOT NULL, request_key VARCHAR(64) NOT NULL, route VARCHAR(255) NOT NULL, body_hash CHAR(64) NOT NULL,
 response JSON NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(user_id,request_key), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
