import sqlite3
import logging
import os
import threading
from pathlib import Path
from contextlib import contextmanager
from .config import Config

logger = logging.getLogger(__name__)

# Current database schema version (after rebuild)
CURRENT_SCHEMA_VERSION = 1

# Thread-local storage for connection pooling
_thread_local = threading.local()

def get_db_connection():
    # Reuse connection within same thread to reduce lock contention
    if hasattr(_thread_local, 'conn') and _thread_local.conn:
        try:
            # Test if connection is still alive
            _thread_local.conn.execute("SELECT 1")
            return _thread_local.conn
        except:
            # Connection is dead, create new one
            _thread_local.conn = None

    # 确保数据库目录存在
    db_dir = Path(Config.DB_PATH).parent
    db_dir.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(Config.DB_PATH, check_same_thread=False, timeout=30.0)
    conn.row_factory = sqlite3.Row

    # Performance optimizations for concurrent access
    # WAL mode is persistent, only needs to be set once (already enabled)
    # But we set it here to ensure it's enabled even if DB is recreated
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")  # Faster writes, still safe with WAL
    conn.execute("PRAGMA cache_size=-64000")   # 64MB cache
    conn.execute("PRAGMA temp_store=MEMORY")   # Use memory for temp tables
    conn.execute("PRAGMA busy_timeout=30000")  # 30s timeout for lock contention

    _thread_local.conn = conn
    return conn


@contextmanager
def db_connection():
    """
    Context manager for database transactions with thread-local connection pooling.

    This context manager reuses the thread-local connection and only commits/rollbacks
    transactions, without closing the connection (which would break the pooling).

    Usage:
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(...)
            # Auto-commits on success, auto-rollbacks on exception
    """
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def check_database_version() -> int:
    """
    Check the current database schema version.

    Returns:
        int: Current schema version (0 if not initialized or schema_version table doesn't exist)
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Check if schema_version table exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='schema_version'
        """)
        if not cursor.fetchone():
            return 0

        # Get current version
        cursor.execute("SELECT MAX(version) FROM schema_version")
        result = cursor.fetchone()
        return result[0] if result and result[0] is not None else 0
    except Exception as e:
        logger.error(f"Error checking database version: {e}")
        return 0


def get_all_tables() -> list[str]:
    """
    Get all table names in the database (excluding SQLite internal tables).

    Returns:
        list[str]: List of table names
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    """)
    return [row[0] for row in cursor.fetchall()]


def drop_all_tables() -> None:
    """
    Drop all tables in the database (including schema_version).

    WARNING: This will delete all data!
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    tables = get_all_tables()

    for table in tables:
        cursor.execute(f"DROP TABLE IF EXISTS {table}")
        logger.info(f"Dropped table: {table}")

    conn.commit()
    logger.info(f"Dropped {len(tables)} tables")


def init_db():
    """Initialize the database schema. Drops all tables if version mismatch."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Ensure schema_version table exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    current_version = check_database_version()
    logger.info(f"Current database schema version: {current_version}")

    # If version mismatch, drop all tables and rebuild
    if current_version > 0 and current_version != CURRENT_SCHEMA_VERSION:
        logger.warning(f"Database schema version mismatch (current: {current_version}, expected: {CURRENT_SCHEMA_VERSION}). Dropping all tables and rebuilding...")

        drop_all_tables()

        # Recreate schema_version table
        cursor.execute("""
            CREATE TABLE schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        current_version = 0
        logger.info("All tables dropped. Rebuilding database...")

    # Funds table - simplistic design, exactly what we need
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS funds (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create an index for searching names, it's cheap and speeds up "LIKE" queries
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_funds_name ON funds(name);
    """)

    # Positions table - store user holdings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS positions (
            code TEXT PRIMARY KEY,
            cost REAL NOT NULL DEFAULT 0.0,
            shares REAL NOT NULL DEFAULT 0.0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Subscriptions table - store email alert settings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            email TEXT NOT NULL,
            threshold_up REAL,
            threshold_down REAL,
            enable_digest INTEGER DEFAULT 0,
            digest_time TEXT DEFAULT '14:45',
            enable_volatility INTEGER DEFAULT 1,
            last_notified_at TIMESTAMP,
            last_digest_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(code, email)
        )
    """)

    # Settings table - store user configuration (for client/desktop)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            encrypted INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 初始化默认配置（如果不存在）
    default_settings = [
        ('OPENAI_API_KEY', '', 1),
        ('OPENAI_API_BASE', 'https://api.openai.com/v1', 0),
        ('AI_MODEL_NAME', 'gpt-3.5-turbo', 0),
        ('SMTP_HOST', 'smtp.gmail.com', 0),
        ('SMTP_PORT', '587', 0),
        ('SMTP_USER', '', 0),
        ('SMTP_PASSWORD', '', 1),
        ('EMAIL_FROM', 'noreply@fundval.live', 0),
        ('INTRADAY_COLLECT_INTERVAL', '5', 0),  # 分时数据采集间隔（分钟）
    ]

    cursor.executemany("""
        INSERT OR IGNORE INTO settings (key, value, encrypted) VALUES (?, ?, ?)
    """, default_settings)

    # Transactions table - add/reduce position log (T+1 confirm by real NAV)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            op_type TEXT NOT NULL,
            amount_cny REAL,
            shares_redeemed REAL,
            confirm_date TEXT NOT NULL,
            confirm_nav REAL,
            shares_added REAL,
            cost_after REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            applied_at TIMESTAMP
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_code ON transactions(code);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_transactions_confirm_date ON transactions(confirm_date);")

    # Fund history table - cache historical NAV data
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fund_history (
            code TEXT NOT NULL,
            date TEXT NOT NULL,
            nav REAL NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (code, date)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fund_history_code ON fund_history(code);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fund_history_date ON fund_history(date);")

    # Intraday snapshots table - store intraday valuation data for charts
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fund_intraday_snapshots (
            fund_code TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            estimate REAL NOT NULL,
            PRIMARY KEY (fund_code, date, time)
        )
    """)

    # Set schema version (all migrations removed, clean slate)
    if current_version == 0:
        cursor.execute("INSERT INTO schema_version (version) VALUES (?)", (CURRENT_SCHEMA_VERSION,))
        logger.info(f"Database initialized with schema version {CURRENT_SCHEMA_VERSION}")
    elif current_version < CURRENT_SCHEMA_VERSION:
        logger.warning(f"Database schema version {current_version} is outdated. Current version is {CURRENT_SCHEMA_VERSION}. Database rebuild required.")

    conn.commit()
    conn.close()
    logger.info("Database initialized.")
