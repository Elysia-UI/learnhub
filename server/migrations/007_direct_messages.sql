CREATE TABLE IF NOT EXISTS dm_conversations (
 id VARCHAR(64) PRIMARY KEY,
 user_low_id VARCHAR(64) NOT NULL,
 user_high_id VARCHAR(64) NOT NULL,
 last_message_id BIGINT UNSIGNED NULL,
 last_message_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_dm_pair(user_low_id,user_high_id),
 INDEX idx_dm_low_recent(user_low_id,last_message_id),
 INDEX idx_dm_high_recent(user_high_id,last_message_id),
 FOREIGN KEY(user_low_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(user_high_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT chk_dm_pair_different CHECK(user_low_id<>user_high_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS dm_messages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 conversation_id VARCHAR(64) NOT NULL,
 sender_id VARCHAR(64) NOT NULL,
 recipient_id VARCHAR(64) NOT NULL,
 client_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 content TEXT NOT NULL,
 read_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_dm_client(sender_id,client_id),
 INDEX idx_dm_history(conversation_id,id),
 INDEX idx_dm_unread(recipient_id,read_at,conversation_id,id),
 INDEX idx_dm_sender_time(sender_id,created_at),
 FOREIGN KEY(conversation_id) REFERENCES dm_conversations(id) ON DELETE CASCADE,
 FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(recipient_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT chk_dm_message_different CHECK(sender_id<>recipient_id),
 CONSTRAINT chk_dm_content_length CHECK(CHAR_LENGTH(content) BETWEEN 1 AND 2000)
) ENGINE=InnoDB;
