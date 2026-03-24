-- Add email to users table and set a default for the existing user.
ALTER TABLE users ADD COLUMN email TEXT;
UPDATE users SET email = 'default@example.com' WHERE id = 1 AND email IS NULL;

-- Note for developer:
-- pv_allocations.user_id and actual_costs.user_id are expected to already exist
-- from the initial schema. This migration only adds user email functionality.
