ALTER TABLE courses ADD COLUMN featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE courses ADD INDEX idx_course_featured (featured,created_at);
UPDATE courses SET featured=TRUE WHERE id IN ('course-ai','course-figma','course-spring','course-study');
UPDATE post_comments c JOIN posts p ON p.id=c.post_id SET c.created_at=DATE_ADD(p.created_at,INTERVAL 1 MINUTE) WHERE c.id LIKE 'seed-comment-%' AND c.created_at<p.created_at;
UPDATE answers a JOIN questions q ON q.id=a.question_id SET a.created_at=DATE_ADD(q.created_at,INTERVAL 1 MINUTE) WHERE a.id LIKE 'seed-answer-%' AND a.created_at<q.created_at;
UPDATE point_records p JOIN answers a ON p.event_key=CONCAT('answer:',a.id) SET p.created_at=a.created_at WHERE p.id LIKE 'seed-points-%' AND p.created_at<a.created_at;
UPDATE point_records p JOIN questions q ON p.event_key=CONCAT('accepted:',q.id) JOIN answers a ON a.id=q.accepted_answer_id SET p.created_at=DATE_ADD(a.created_at,INTERVAL 1 MINUTE) WHERE p.id LIKE 'seed-points-%' AND p.created_at<a.created_at;
