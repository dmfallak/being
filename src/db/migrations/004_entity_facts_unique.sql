ALTER TABLE entity_facts ADD CONSTRAINT entity_facts_user_content_unique UNIQUE (user_id, content);
