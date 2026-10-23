-- A child exists while at least one family follows them (docs/design.md 7.1, 10.4, 14.1). Children belong to no family,
-- so deleting a family (or its last link to a child) cascades only to family_students; this removes the child, and
-- with it every child-owned row, once the last link is gone.
CREATE FUNCTION drop_unfollowed_student() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM students s
  WHERE s.id = OLD.student_id
    AND NOT EXISTS (SELECT 1 FROM family_students fs WHERE fs.student_id = OLD.student_id);
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER family_students_last_link
AFTER DELETE ON family_students
FOR EACH ROW EXECUTE FUNCTION drop_unfollowed_student();
