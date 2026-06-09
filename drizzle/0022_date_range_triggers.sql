-- Issue #86 (1): course_confirmations.date と regular_assignments の effective_from/to
-- が紐付く期 (periods / regular_shift_periods) の範囲内にあることを DB 層 trigger で
-- 強制する。アプリ層 (saveCourseConfirmations / saveMonthlyConfirmation /
-- saveRegularConfirmation) で検証しているが、service_role 直接 SQL や CSV import の
-- bypass 経路を塞ぐ最終防御。
--
-- DB CHECK は外部キー先の値参照ができないため、trigger で対応する (0015 の
-- validate_shift_submission_status_transition と同パターン)。

CREATE OR REPLACE FUNCTION validate_course_confirmation_date_in_period()
RETURNS TRIGGER AS $$
DECLARE
  p_start DATE;
  p_end DATE;
BEGIN
  SELECT start_date, end_date INTO p_start, p_end
    FROM periods WHERE id = NEW.period_id;
  IF p_start IS NULL THEN
    RAISE EXCEPTION 'course_confirmations.period_id % not found', NEW.period_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.date < p_start OR NEW.date > p_end THEN
    RAISE EXCEPTION
      'course_confirmations.date % is outside period range [%, %]',
      NEW.date, p_start, p_end
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS course_confirmations_date_in_period_trg ON course_confirmations;
--> statement-breakpoint
CREATE TRIGGER course_confirmations_date_in_period_trg
  BEFORE INSERT OR UPDATE OF date, period_id ON course_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION validate_course_confirmation_date_in_period();
--> statement-breakpoint

-- regular_assignments の effective_from / effective_to が紐付く regular_shift_periods
-- の [start_date, end_date] 範囲内にあることを強制。effective_to が NULL の場合は
-- 「期末まで」(saveMonthlyConfirmation 等が tx 内で period.end_date に解決する) と
-- 等価なのでチェック対象外。
CREATE OR REPLACE FUNCTION validate_regular_assignment_range_in_period()
RETURNS TRIGGER AS $$
DECLARE
  p_start DATE;
  p_end DATE;
BEGIN
  SELECT start_date, end_date INTO p_start, p_end
    FROM regular_shift_periods WHERE id = NEW.period_id;
  IF p_start IS NULL THEN
    RAISE EXCEPTION 'regular_assignments.period_id % not found', NEW.period_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.effective_from < p_start OR NEW.effective_from > p_end THEN
    RAISE EXCEPTION
      'regular_assignments.effective_from % is outside period range [%, %]',
      NEW.effective_from, p_start, p_end
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.effective_to IS NOT NULL AND
     (NEW.effective_to < p_start OR NEW.effective_to > p_end) THEN
    RAISE EXCEPTION
      'regular_assignments.effective_to % is outside period range [%, %]',
      NEW.effective_to, p_start, p_end
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS regular_assignments_range_in_period_trg ON regular_assignments;
--> statement-breakpoint
CREATE TRIGGER regular_assignments_range_in_period_trg
  BEFORE INSERT OR UPDATE OF effective_from, effective_to, period_id ON regular_assignments
  FOR EACH ROW
  EXECUTE FUNCTION validate_regular_assignment_range_in_period();
