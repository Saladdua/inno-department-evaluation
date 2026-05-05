-- Run in Supabase SQL Editor
-- Adds the superadmin account (no department needed for super_admin role)

INSERT INTO public.users (name, email, password_hash, role, department_id)
VALUES ('Minh Nghĩa', 'minhnghia14603@gmail.com', 'innojsc2025', 'super_admin', NULL)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role          = EXCLUDED.role;
