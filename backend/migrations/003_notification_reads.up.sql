-- Additive migration: broadcast read state belongs to each recipient.
CREATE TABLE IF NOT EXISTS arena_notification_reads (
    notification_id VARCHAR(64) NOT NULL REFERENCES arena_notifications(id) ON DELETE CASCADE,
    recipient_id VARCHAR(64) NOT NULL,
    read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id, recipient_id)
);
