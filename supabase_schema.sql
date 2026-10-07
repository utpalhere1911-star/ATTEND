    -- ==========================================
    -- PHASE 1: DATABASE SCHEMA
    -- ==========================================

    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Table: admin_users
    CREATE TABLE admin_users (
        user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Table: attendance_sessions
    CREATE TABLE attendance_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        subject TEXT NOT NULL,
        attendance_date DATE NOT NULL,
        attendance_code TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'ended')) DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ NULL
    );

    -- Constraint: Only one open session
    CREATE UNIQUE INDEX only_one_open_session ON attendance_sessions (status) WHERE status = 'open';

    -- Table: students
    CREATE TABLE students (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        roll_number TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Table: attendance_submissions
    CREATE TABLE attendance_submissions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        photo_path TEXT NULL,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        status TEXT NOT NULL CHECK (status IN ('verified', 'duplicate')),
        source TEXT NOT NULL CHECK (source IN ('student_submission', 'admin_added')),
        UNIQUE(session_id, student_id)
    );

    -- Helper function: is_admin()
    CREATE OR REPLACE FUNCTION is_admin()
    RETURNS BOOLEAN
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
        SELECT EXISTS (
            SELECT 1 FROM admin_users WHERE user_id = auth.uid()
        );
    $$;

    -- ==========================================
    -- ROW LEVEL SECURITY (RLS)
    -- ==========================================

    ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE attendance_submissions ENABLE ROW LEVEL SECURITY;

    -- admin_users policies
    CREATE POLICY "Admins can read admin_users" ON admin_users FOR SELECT TO authenticated USING (is_admin());

    -- attendance_sessions policies
    CREATE POLICY "Anyone can read open sessions" ON attendance_sessions FOR SELECT USING (status = 'open');
    CREATE POLICY "Admins can manage sessions" ON attendance_sessions FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

    -- students policies
    CREATE POLICY "Admins can manage students" ON students FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

    -- attendance_submissions policies
    CREATE POLICY "Admins can manage submissions" ON attendance_submissions FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

    -- ==========================================
    -- RPC FUNCTIONS
    -- ==========================================

    ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

    CREATE OR REPLACE FUNCTION prepare_attendance_student(
        p_session_id UUID,
        p_roll_number TEXT,
        p_name TEXT
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
        v_clean_roll TEXT;
        v_clean_name TEXT;
        v_session_status TEXT;
        v_student_id UUID;
    BEGIN
        v_clean_roll := trim(p_roll_number);
        v_clean_name := trim(p_name);

        IF v_clean_roll = '' OR v_clean_roll IS NULL THEN
            RAISE EXCEPTION 'Roll number cannot be empty.';
        END IF;
        IF v_clean_name = '' OR v_clean_name IS NULL THEN
            RAISE EXCEPTION 'Name cannot be empty.';
        END IF;

        SELECT status INTO v_session_status FROM attendance_sessions WHERE id = p_session_id;
        IF v_session_status IS NULL OR v_session_status != 'open' THEN
            RAISE EXCEPTION 'Attendance session is not open or does not exist.';
        END IF;

        SELECT id INTO v_student_id FROM students WHERE roll_number = v_clean_roll;
        IF v_student_id IS NULL THEN
            INSERT INTO students (roll_number, name) VALUES (v_clean_roll, v_clean_name) RETURNING id INTO v_student_id;
        ELSE
            UPDATE students SET name = v_clean_name WHERE id = v_student_id;
        END IF;

        RETURN v_student_id;
    END;
    $$;

    GRANT EXECUTE ON FUNCTION prepare_attendance_student(UUID, TEXT, TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION prepare_attendance_student(UUID, TEXT, TEXT) TO authenticated;

    CREATE OR REPLACE FUNCTION submit_attendance(
        p_session_id UUID,
        p_roll_number TEXT,
        p_name TEXT,
        p_photo_path TEXT
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
        v_clean_roll TEXT;
        v_clean_name TEXT;
        v_session_status TEXT;
        v_student_id UUID;
        v_expected_path_prefix TEXT;
        v_submission_id UUID;
    BEGIN
        -- 1. Trim roll_number and name
        v_clean_roll := trim(p_roll_number);
        v_clean_name := trim(p_name);

        -- 2. Reject empty roll number or name
        IF v_clean_roll = '' OR v_clean_roll IS NULL THEN
            RAISE EXCEPTION 'Roll number cannot be empty.';
        END IF;
        IF v_clean_name = '' OR v_clean_name IS NULL THEN
            RAISE EXCEPTION 'Name cannot be empty.';
        END IF;

        -- 3. Verify session exists and is exactly 'open'
        SELECT status INTO v_session_status FROM attendance_sessions WHERE id = p_session_id;
        IF v_session_status IS NULL OR v_session_status != 'open' THEN
            RAISE EXCEPTION 'Attendance session is not open or does not exist.';
        END IF;

        -- 4 & 5 & 6. Find student, create if not exists, update name if exists
        SELECT id INTO v_student_id FROM students WHERE roll_number = v_clean_roll;
        IF v_student_id IS NULL THEN
            INSERT INTO students (roll_number, name) VALUES (v_clean_roll, v_clean_name) RETURNING id INTO v_student_id;
        ELSE
            UPDATE students SET name = v_clean_name WHERE id = v_student_id;
        END IF;

        -- 7. Verify photo_path is NOT NULL
        IF p_photo_path IS NULL THEN
            RAISE EXCEPTION 'Photo path cannot be null.';
        END IF;

        -- 8. Verify the photo path follows exactly: attendance/{session_id}/{student_id}/...
        v_expected_path_prefix := 'attendance/' || p_session_id::text || '/' || v_student_id::text || '/';
        IF p_photo_path NOT LIKE (v_expected_path_prefix || '%') THEN
            RAISE EXCEPTION 'Invalid photo path structure.';
        END IF;

        -- 9 & 10. Insert into attendance_submissions (UNIQUE constraint handles duplicates)
        INSERT INTO attendance_submissions (session_id, student_id, photo_path, status, source)
        VALUES (p_session_id, v_student_id, p_photo_path, 'verified', 'student_submission')
        RETURNING id INTO v_submission_id;

        -- 11. Return the created attendance_submissions.id
        RETURN v_submission_id;
    END;
    $$;

    -- 14. Grant EXECUTE on this function to anon, authenticated
    GRANT EXECUTE ON FUNCTION submit_attendance(UUID, TEXT, TEXT, TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION submit_attendance(UUID, TEXT, TEXT, TEXT) TO authenticated;


    CREATE OR REPLACE FUNCTION is_session_open_for_storage(p_path TEXT)
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
        v_session_id_text TEXT;
    BEGIN
        v_session_id_text := split_part(p_path, '/', 2);
        IF v_session_id_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            RETURN EXISTS (
                SELECT 1 FROM attendance_sessions 
                WHERE id::text = v_session_id_text
                AND status = 'open'
            );
        END IF;
        RETURN FALSE;
    END;
    $$;

    REVOKE EXECUTE ON FUNCTION is_session_open_for_storage(TEXT) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION is_session_open_for_storage(TEXT) TO authenticated, anon, service_role;

    -- ==========================================
    -- STORAGE BUCKET INSTRUCTIONS & POLICIES
    -- ==========================================

    /*
    IMPORTANT: Do NOT execute bucket creation via SQL.
    
    Create the bucket manually in the Supabase Dashboard:
    1. Go to Storage -> New Bucket
    2. Name: blackboard-photos
    3. Private: YES
    4. Allowed MIME types: image/jpeg, image/png, image/webp
    5. Maximum file size: 5 MB
    */

    -- Storage RLS Policies
    CREATE POLICY "Anon can upload photos to open sessions" ON storage.objects
        FOR INSERT TO anon WITH CHECK (
            bucket_id = 'blackboard-photos' 
            AND is_session_open_for_storage(name)
        );

    CREATE POLICY "Admins can manage photos" ON storage.objects
        FOR ALL TO authenticated USING (
            bucket_id = 'blackboard-photos' AND is_admin()
        ) WITH CHECK (
            bucket_id = 'blackboard-photos' AND is_admin()
        );

    -- ==========================================
    -- PHASE 3: MIGRATIONS
    -- ==========================================

    -- Add attendance_code to existing attendance_sessions if it doesn't exist
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'attendance_sessions' 
            AND column_name = 'attendance_code'
        ) THEN
            ALTER TABLE attendance_sessions ADD COLUMN attendance_code TEXT NOT NULL DEFAULT 'DEFAULT_CODE';
        END IF;
    END $$;
