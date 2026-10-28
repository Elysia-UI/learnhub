CREATE TABLE IF NOT EXISTS user_follows (
 follower_id VARCHAR(64) NOT NULL,
 followee_id VARCHAR(64) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(follower_id,followee_id),
 INDEX idx_following_time(follower_id,created_at,followee_id),
 INDEX idx_followers_time(followee_id,created_at,follower_id),
 FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(followee_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT chk_follow_different_users CHECK(follower_id<>followee_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS follow_notification_events (
 follower_id VARCHAR(64) NOT NULL,
 followee_id VARCHAR(64) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(follower_id,followee_id),
 FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(followee_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT chk_follow_event_different_users CHECK(follower_id<>followee_id)
) ENGINE=InnoDB;
