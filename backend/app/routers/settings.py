import logging
import re
from typing import Optional
from fastapi import APIRouter, HTTPException, Body, Depends
from ..db import get_db_connection
from ..crypto import encrypt_value, decrypt_value
from ..config import Config
from ..auth import User, get_current_user, require_auth

logger = logging.getLogger(__name__)
router = APIRouter()

ENCRYPTED_FIELDS = {"OPENAI_API_KEY", "SMTP_PASSWORD"}


def validate_url(url: str) -> bool:
    return bool(re.match(r'^https?://[^\s]+$', url))

@router.get("/settings")
def get_settings(current_user: Optional[User] = Depends(get_current_user)):
    """获取设置（加密字段用 *** 掩码）。未登录时使用 user_id=NULL 的系统设置。"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = current_user.id if current_user is not None else None

        cursor.execute("SELECT key, value, encrypted FROM settings WHERE user_id IS ?", (user_id,))
        rows = cursor.fetchall()

        settings = {}
        for row in rows:
            key = row["key"]
            value = row["value"]
            encrypted = row["encrypted"]
            if encrypted and value:
                settings[key] = "***"
            else:
                settings[key] = value

        if not settings:
            settings = {
                "OPENAI_API_KEY": "***" if Config.OPENAI_API_KEY else "",
                "OPENAI_API_BASE": Config.OPENAI_API_BASE,
                "AI_MODEL_NAME": Config.AI_MODEL_NAME,
            }

        return {"settings": settings}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/settings")
def update_settings(data: dict = Body(...), current_user: Optional[User] = Depends(get_current_user)):
    """更新设置（部分更新）。未登录时写入 user_id=NULL。"""
    try:
        settings = data.get("settings", {})
        errors = {}

        if "OPENAI_API_BASE" in settings and settings["OPENAI_API_BASE"]:
            if not validate_url(settings["OPENAI_API_BASE"]):
                errors["OPENAI_API_BASE"] = "URL 格式不正确"

        if errors:
            raise HTTPException(status_code=400, detail={"errors": errors})

        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = current_user.id if current_user is not None else None

        for key, value in settings.items():
            if value == "***":
                continue
            encrypted = 1 if key in ENCRYPTED_FIELDS else 0
            if encrypted and value:
                value = encrypt_value(value)

            cursor.execute("""
                INSERT INTO settings (key, value, encrypted, user_id, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key, user_id) DO UPDATE SET
                    value = excluded.value,
                    encrypted = excluded.encrypted,
                    updated_at = CURRENT_TIMESTAMP
            """, (key, value, encrypted, user_id))

        conn.commit()

        return {"message": "设置已保存"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/preferences")
def get_preferences(current_user: Optional[User] = Depends(get_current_user)):
    """获取用户偏好（自选列表、当前账户、排序选项）。未登录时使用 user_id=NULL 的默认偏好。"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = current_user.id if current_user is not None else None

        cursor.execute("SELECT value FROM settings WHERE user_id IS ? AND key = 'user_watchlist'", (user_id,))
        watchlist_row = cursor.fetchone()
        watchlist = watchlist_row["value"] if watchlist_row else "[]"

        cursor.execute("SELECT value FROM settings WHERE user_id IS ? AND key = 'user_current_account'", (user_id,))
        account_row = cursor.fetchone()
        current_account = int(account_row["value"]) if account_row and account_row["value"] else 1

        cursor.execute("SELECT value FROM settings WHERE user_id IS ? AND key = 'user_sort_option'", (user_id,))
        sort_row = cursor.fetchone()
        sort_option = sort_row["value"] if sort_row else None

        return {
            "watchlist": watchlist,
            "currentAccount": current_account,
            "sortOption": sort_option
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get preferences: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/preferences")
def update_preferences(data: dict = Body(...), current_user: Optional[User] = Depends(get_current_user)):
    """更新用户偏好。未登录时写入 user_id=NULL 的默认偏好。"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        user_id = current_user.id if current_user is not None else None

        if "watchlist" in data:
            cursor.execute("""
                INSERT INTO settings (key, value, encrypted, user_id, updated_at)
                VALUES ('user_watchlist', ?, 0, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key, user_id) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            """, (data["watchlist"], user_id))

        if "currentAccount" in data:
            cursor.execute("""
                INSERT INTO settings (key, value, encrypted, user_id, updated_at)
                VALUES ('user_current_account', ?, 0, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key, user_id) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            """, (str(data["currentAccount"]), user_id))

        if "sortOption" in data:
            cursor.execute("""
                INSERT INTO settings (key, value, encrypted, user_id, updated_at)
                VALUES ('user_sort_option', ?, 0, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key, user_id) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            """, (data["sortOption"], user_id))

        conn.commit()

        return {"message": "偏好已保存"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update preferences: {e}")
        raise HTTPException(status_code=500, detail=str(e))
