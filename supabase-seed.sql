-- ============================================================
-- INNO Department Evaluation — Seed Data
-- Run in: Supabase Dashboard → SQL Editor
-- This CLEARS all existing data and reloads from the CSV sources.
-- Default password for ALL accounts: Inno@2025
-- Super-admin password: Admin@2025
-- ============================================================

-- Clear everything in dependency order
TRUNCATE
  public.evaluation_scores,
  public.evaluations,
  public.evaluation_matrix,
  public.criteria,
  public.evaluation_periods,
  public.users,
  public.departments
RESTART IDENTITY CASCADE;

DO $$
DECLARE
  -- ── Department IDs ────────────────────────────────────────
  d_as1   uuid := gen_random_uuid();
  d_as3   uuid := gen_random_uuid();
  d_as4   uuid := gen_random_uuid();
  d_as8   uuid := gen_random_uuid();
  d_as9   uuid := gen_random_uuid();
  d_as10  uuid := gen_random_uuid();
  d_as11  uuid := gen_random_uuid();
  d_ls1   uuid := gen_random_uuid();
  d_bim1  uuid := gen_random_uuid();
  d_ss1   uuid := gen_random_uuid();
  d_ss2   uuid := gen_random_uuid();
  d_ss3   uuid := gen_random_uuid();
  d_ss5   uuid := gen_random_uuid();
  d_mep   uuid := gen_random_uuid();
  d_qs    uuid := gen_random_uuid();

  -- ── Period ID ─────────────────────────────────────────────
  p_id    uuid := gen_random_uuid();

BEGIN

  -- ══════════════════════════════════════════════════════════
  -- 1. DEPARTMENTS
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.departments (id, name, code) VALUES
    (d_as1,  'AS1',  'AS1'),
    (d_as3,  'AS3',  'AS3'),
    (d_as4,  'AS4',  'AS4'),
    (d_as8,  'AS8',  'AS8'),
    (d_as9,  'AS9',  'AS9'),
    (d_as10, 'AS10', 'AS10'),
    (d_as11, 'AS11', 'AS11'),
    (d_ls1,  'LS1',  'LS1'),
    (d_bim1, 'BIM1', 'BIM1'),
    (d_ss1,  'SS1',  'SS1'),
    (d_ss2,  'SS2',  'SS2'),
    (d_ss3,  'SS3',  'SS3'),
    (d_ss5,  'SS5',  'SS5'),
    (d_mep,  'MEP',  'MEP'),
    (d_qs,   'QS',   'QS');

  -- ══════════════════════════════════════════════════════════
  -- 2. USERS
  --    Source: TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ - USER.csv
  --    Role mapping: TP → department, BLĐ → leadership
  -- ══════════════════════════════════════════════════════════

  -- Department accounts (one per phòng ban)
  INSERT INTO public.users (name, email, role, password_hash, department_id) VALUES
    ('AS1',  'AS1@innojsc.com',     'department', 'Inno@2025', d_as1),
    ('AS3',  'AS3@innojsc.com',     'department', 'Inno@2025', d_as3),
    ('AS4',  'AS4@innojsc.com',     'department', 'Inno@2025', d_as4),
    ('AS8',  'AS8@innojsc.com',     'department', 'Inno@2025', d_as8),
    ('AS9',  'AS9.inno@gmail.com',  'department', 'Inno@2025', d_as9),
    ('AS10', 'AS10@innojsc.com',    'department', 'Inno@2025', d_as10),
    ('AS11', 'AS11@innojsc.com',    'department', 'Inno@2025', d_as11),
    ('LS1',  'ls1@innojsc.com',     'department', 'Inno@2025', d_ls1),
    ('BIM1', 'BIM1@innojsc.com',    'department', 'Inno@2025', d_bim1),
    ('SS1',  'SS1@innojsc.com',     'department', 'Inno@2025', d_ss1),
    ('SS2',  'SS2@innojsc.com',     'department', 'Inno@2025', d_ss2),
    ('SS3',  'SS3@innojsc.com',     'department', 'Inno@2025', d_ss3),
    ('SS5',  'ss5@innojsc.com',     'department', 'Inno@2025', d_ss5),
    ('MEP',  'MEP1@innojsc.com',    'department', 'Inno@2025', d_mep),
    ('QS',   'leader12@innojsc.com','department', 'Inno@2025', d_qs);

  -- Ban lãnh đạo (no department_id)
  INSERT INTO public.users (name, email, role, password_hash) VALUES
    ('Nguyễn Tuấn Ngọc', 'leader@innojsc.com',   'leadership', 'Inno@2025'),
    ('Nguyễn Khắc Tâm',  'leader4@innojsc.com',  'leadership', 'Inno@2025'),
    ('Đoàn Văn Động',    'leader5@innojsc.com',  'leadership', 'Inno@2025'),
    ('Trần Hoàng San',   'leader10@innojsc.com', 'leadership', 'Inno@2025'),
    ('Đỗ Hoàng Anh',     'leader8@innojsc.com',  'leadership', 'Inno@2025'),
    ('Phạm Quốc Huy',    'leader3@innojsc.com',  'leadership', 'Inno@2025'),
    ('Đỗ Tất Kiên',      'leader2@innojsc.com',  'leadership', 'Inno@2025'),
    ('Lưu Giang Nam',    'leader9@innojsc.com',  'leadership', 'Inno@2025');

  -- Super admin
  INSERT INTO public.users (name, email, role, password_hash) VALUES
    ('Admin', 'admin@innojsc.com', 'super_admin', 'Admin@2025');

  -- ══════════════════════════════════════════════════════════
  -- 3. EVALUATION PERIOD — Quý 2, 2025
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.evaluation_periods (id, quarter, year, start_date, end_date, status) VALUES
    (p_id, 2, 2025, '2025-04-01', '2025-06-30', 'open');

  -- ══════════════════════════════════════════════════════════
  -- 4. CRITERIA
  --    Source: DS TIÊU CHÍ & HỆ SỐ.csv  (HS QUÝ 2 = same as QUÝ 1 = weight)
  --    input_type: 'Đánh giá chéo' / 'Ban lãnh đạo' → manual
  --                'Dữ liệu từ báo cáo'              → auto
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.criteria
    (period_id, code, name, weight, input_type, auto_source, display_order)
  VALUES
    (p_id, 'TC1',  'Chất lượng công việc',                                3, 'manual', null,            1),
    (p_id, 'TC2',  'Tín nhiệm của đồng nghiệp',                           1, 'manual', null,            2),
    (p_id, 'TC3',  'Tinh thần hỗ trợ đội nhóm khác',                      1, 'manual', null,            3),
    (p_id, 'TC4',  'Công tác chuẩn hóa, số hóa',                          1, 'manual', null,            4),
    (p_id, 'TC5',  'Chấp hành quy định công ty',                           1, 'auto',   'google_sheets', 5),
    (p_id, 'TC6',  'Hỗ trợ công tác truyền thông của INNO và 360HOME',     1, 'auto',   'google_sheets', 6),
    (p_id, 'TC7',  'Khai báo Timesheet',                                   1, 'auto',   'google_sheets', 7),
    (p_id, 'TC8',  'Phối hợp với thầu phụ thực hiện các dự án',            3, 'manual', null,            8),
    (p_id, 'TC9',  'Tham gia vào công tác đào tạo của công ty',            1, 'auto',   'google_sheets', 9),
    (p_id, 'TC10', 'Phát triển nhóm',                                      2, 'manual', null,           10),
    (p_id, 'TC11', 'Sản lượng công việc',                                  3, 'manual', null,           11),
    (p_id, 'TC12', 'Tín nhiệm của khách hàng',                             3, 'manual', null,           12);

  -- ══════════════════════════════════════════════════════════
  -- 5. EVALUATION MATRIX
  --    Source: MA TRẬN ĐÁNH GIÁ - MA TRẬN ĐG.csv (upper triangle)
  --    Each selection is bidirectional: A→B and B→A both stored.
  --    selected_by is NULL for seeded data (not a user action).
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.evaluation_matrix (period_id, evaluator_id, target_id) VALUES

  -- AS1 selects: AS8, AS11, LS1, SS1, SS2, SS3, SS5, MEP
    (p_id, d_as1,  d_as8),  (p_id, d_as8,  d_as1),
    (p_id, d_as1,  d_as11), (p_id, d_as11, d_as1),
    (p_id, d_as1,  d_ls1),  (p_id, d_ls1,  d_as1),
    (p_id, d_as1,  d_ss1),  (p_id, d_ss1,  d_as1),
    (p_id, d_as1,  d_ss2),  (p_id, d_ss2,  d_as1),
    (p_id, d_as1,  d_ss3),  (p_id, d_ss3,  d_as1),
    (p_id, d_as1,  d_ss5),  (p_id, d_ss5,  d_as1),
    (p_id, d_as1,  d_mep),  (p_id, d_mep,  d_as1),

  -- AS3 selects: AS9, AS11, LS1, SS3, MEP, QS
    (p_id, d_as3,  d_as9),  (p_id, d_as9,  d_as3),
    (p_id, d_as3,  d_as11), (p_id, d_as11, d_as3),
    (p_id, d_as3,  d_ls1),  (p_id, d_ls1,  d_as3),
    (p_id, d_as3,  d_ss3),  (p_id, d_ss3,  d_as3),
    (p_id, d_as3,  d_mep),  (p_id, d_mep,  d_as3),
    (p_id, d_as3,  d_qs),   (p_id, d_qs,   d_as3),

  -- AS4 selects: AS9, AS11, LS1, BIM1, SS2, SS3, MEP
    (p_id, d_as4,  d_as9),  (p_id, d_as9,  d_as4),
    (p_id, d_as4,  d_as11), (p_id, d_as11, d_as4),
    (p_id, d_as4,  d_ls1),  (p_id, d_ls1,  d_as4),
    (p_id, d_as4,  d_bim1), (p_id, d_bim1, d_as4),
    (p_id, d_as4,  d_ss2),  (p_id, d_ss2,  d_as4),
    (p_id, d_as4,  d_ss3),  (p_id, d_ss3,  d_as4),
    (p_id, d_as4,  d_mep),  (p_id, d_mep,  d_as4),

  -- AS8 selects: AS10, LS1, SS2, SS5, MEP, QS
    (p_id, d_as8,  d_as10), (p_id, d_as10, d_as8),
    (p_id, d_as8,  d_ls1),  (p_id, d_ls1,  d_as8),
    (p_id, d_as8,  d_ss2),  (p_id, d_ss2,  d_as8),
    (p_id, d_as8,  d_ss5),  (p_id, d_ss5,  d_as8),
    (p_id, d_as8,  d_mep),  (p_id, d_mep,  d_as8),
    (p_id, d_as8,  d_qs),   (p_id, d_qs,   d_as8),

  -- AS9 selects: LS1, BIM1, SS2, SS3, MEP
    (p_id, d_as9,  d_ls1),  (p_id, d_ls1,  d_as9),
    (p_id, d_as9,  d_bim1), (p_id, d_bim1, d_as9),
    (p_id, d_as9,  d_ss2),  (p_id, d_ss2,  d_as9),
    (p_id, d_as9,  d_ss3),  (p_id, d_ss3,  d_as9),
    (p_id, d_as9,  d_mep),  (p_id, d_mep,  d_as9),

  -- AS10 selects: LS1, SS2, SS3, SS5, MEP, QS
    (p_id, d_as10, d_ls1),  (p_id, d_ls1,  d_as10),
    (p_id, d_as10, d_ss2),  (p_id, d_ss2,  d_as10),
    (p_id, d_as10, d_ss3),  (p_id, d_ss3,  d_as10),
    (p_id, d_as10, d_ss5),  (p_id, d_ss5,  d_as10),
    (p_id, d_as10, d_mep),  (p_id, d_mep,  d_as10),
    (p_id, d_as10, d_qs),   (p_id, d_qs,   d_as10),

  -- AS11 selects: LS1, SS3, MEP, QS
    (p_id, d_as11, d_ls1),  (p_id, d_ls1,  d_as11),
    (p_id, d_as11, d_ss3),  (p_id, d_ss3,  d_as11),
    (p_id, d_as11, d_mep),  (p_id, d_mep,  d_as11),
    (p_id, d_as11, d_qs),   (p_id, d_qs,   d_as11),

  -- LS1 selects: BIM1, SS1, SS3, QS
    (p_id, d_ls1,  d_bim1), (p_id, d_bim1, d_ls1),
    (p_id, d_ls1,  d_ss1),  (p_id, d_ss1,  d_ls1),
    (p_id, d_ls1,  d_ss3),  (p_id, d_ss3,  d_ls1),
    (p_id, d_ls1,  d_qs),   (p_id, d_qs,   d_ls1),

  -- BIM1 selects: SS1, SS2, SS3, MEP
    (p_id, d_bim1, d_ss1),  (p_id, d_ss1,  d_bim1),
    (p_id, d_bim1, d_ss2),  (p_id, d_ss2,  d_bim1),
    (p_id, d_bim1, d_ss3),  (p_id, d_ss3,  d_bim1),
    (p_id, d_bim1, d_mep),  (p_id, d_mep,  d_bim1),

  -- SS1 selects: SS2, SS3, SS5
    (p_id, d_ss1,  d_ss2),  (p_id, d_ss2,  d_ss1),
    (p_id, d_ss1,  d_ss3),  (p_id, d_ss3,  d_ss1),
    (p_id, d_ss1,  d_ss5),  (p_id, d_ss5,  d_ss1),

  -- SS2 selects: SS3, SS5, MEP, QS
    (p_id, d_ss2,  d_ss3),  (p_id, d_ss3,  d_ss2),
    (p_id, d_ss2,  d_ss5),  (p_id, d_ss5,  d_ss2),
    (p_id, d_ss2,  d_mep),  (p_id, d_mep,  d_ss2),
    (p_id, d_ss2,  d_qs),   (p_id, d_qs,   d_ss2),

  -- SS3 selects: SS5, MEP, QS
    (p_id, d_ss3,  d_ss5),  (p_id, d_ss5,  d_ss3),
    (p_id, d_ss3,  d_mep),  (p_id, d_mep,  d_ss3),
    (p_id, d_ss3,  d_qs),   (p_id, d_qs,   d_ss3),

  -- SS5 selects: MEP, QS
    (p_id, d_ss5,  d_mep),  (p_id, d_mep,  d_ss5),
    (p_id, d_ss5,  d_qs),   (p_id, d_qs,   d_ss5),

  -- MEP selects: QS
    (p_id, d_mep,  d_qs),   (p_id, d_qs,   d_mep);

END $$;
