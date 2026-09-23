CREATE TRIGGER IF NOT EXISTS exception_created_audit
AFTER INSERT ON exceptions
BEGIN
  INSERT INTO audit_log (id, action, entity, record_id, before_json, after_json, actor, created_at)
  VALUES (
    lower(hex(randomblob(16))),
    'EXCEPTION_CREATED',
    'exception',
    NEW.id,
    NULL,
    json_object('id', NEW.id, 'staffId', NEW.staff_id, 'status', NEW.status, 'date', NEW.date, 'updatedAt', NEW.updated_at),
    NEW.created_by,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;

CREATE TRIGGER IF NOT EXISTS exception_corrected_audit
AFTER UPDATE OF status, date, created_by ON exceptions
BEGIN
  INSERT INTO audit_log (id, action, entity, record_id, before_json, after_json, actor, created_at)
  VALUES (
    lower(hex(randomblob(16))),
    'EXCEPTION_CORRECTED',
    'exception',
    NEW.id,
    json_object('id', OLD.id, 'staffId', OLD.staff_id, 'status', OLD.status, 'date', OLD.date, 'updatedAt', OLD.updated_at),
    json_object('id', NEW.id, 'staffId', NEW.staff_id, 'status', NEW.status, 'date', NEW.date, 'updatedAt', NEW.updated_at),
    NEW.created_by,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;
