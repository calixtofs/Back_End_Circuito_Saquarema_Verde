PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS administrators (
    slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 0 AND 6),
    username TEXT COLLATE NOCASE UNIQUE,
    password_hash TEXT,
    is_master INTEGER NOT NULL DEFAULT 0 CHECK (is_master IN (0, 1)),
    CHECK (
        (slot = 0 AND username = 'Admin' AND password_hash IS NOT NULL AND is_master = 1)
        OR
        (
            slot BETWEEN 1 AND 6
            AND is_master = 0
            AND (
                (username IS NULL AND password_hash IS NULL)
                OR (username IS NOT NULL AND password_hash IS NOT NULL)
            )
        )
    )
);

CREATE TABLE IF NOT EXISTS administrator_sessions (
    token_hash TEXT PRIMARY KEY,
    administrator_slot INTEGER NOT NULL REFERENCES administrators(slot) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_administrator_sessions_expiry
    ON administrator_sessions(expires_at);
