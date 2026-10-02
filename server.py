import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
import sqlite3
import datetime
from typing import Optional, List
from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "activations.db")
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS activations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            screen_code TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending',
            ip_address TEXT
        )
    """)
    conn.commit()
    conn.close()

init_db()

app = FastAPI(title="Screen Activator")

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
jinja_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=True)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

class SimpleSubmit(BaseModel):
    screen_code: str

@app.get("/", response_class=HTMLResponse)
async def index_page():
    template = jinja_env.get_template("index.html")
    return HTMLResponse(template.render())

@app.get("/admin", response_class=HTMLResponse)
async def admin_page():
    template = jinja_env.get_template("admin.html")
    return HTMLResponse(template.render())

# 1. العميل يرسل الكود فقط
@app.post("/api/submit")
async def submit_code(req: SimpleSubmit, request: Request):
    code = req.screen_code.strip()
    if not code:
        return JSONResponse({"status": "error", "message": "يرجى كتابة كود الشاشة أولاً."}, status_code=400)

    client_ip = request.client.host if request.client else "unknown"

    conn = get_db()
    cursor = conn.cursor()

    # فحص إذا كان الكود مضاف بالفعل في قائمة الانتظار
    cursor.execute("SELECT id FROM activations WHERE screen_code = ? AND status = 'pending'", (code,))
    exists = cursor.fetchone()
    if exists:
        conn.close()
        return {"status": "success", "message": "تم استلام الكود مسبقاً وهو في قائمة الانتظار للتفعيل!"}

    cursor.execute("INSERT INTO activations (screen_code, ip_address) VALUES (?, ?)", (code, client_ip))
    conn.commit()
    conn.close()

    return {"status": "success", "message": "تم إرسال كود شاشتك بنجاح! سيتم تفعيله حالاً."}

# 2. جلب كل الأكواد المعلقة للإدارة
@app.get("/api/admin/codes")
async def get_all_codes(password: Optional[str] = None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, screen_code, created_at, status FROM activations WHERE status = 'pending' ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()

    codes = [r["screen_code"] for r in rows]
    items = [{"id": r["id"], "code": r["screen_code"], "time": r["created_at"]} for r in rows]

    return {
        "status": "success",
        "count": len(codes),
        "codes_text": "\n".join(reversed(codes)),
        "items": items
    }

# 3. نسخ أو تحميل كملف txt
@app.get("/api/admin/download-txt")
async def download_txt():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT screen_code FROM activations WHERE status = 'pending' ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    
    codes = [r["screen_code"] for r in rows]
    filename = f"codes_{datetime.date.today().strftime('%Y%m%d_%H%M')}.txt"
    return PlainTextResponse("\n".join(codes), headers={"Content-Disposition": f"attachment; filename={filename}"})

# 4. تفريغ أو تحديد كـ "تم التفعيل"
@app.post("/api/admin/mark-activated")
async def mark_activated():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE activations SET status = 'activated' WHERE status = 'pending'")
    count = cursor.rowcount
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"تم تفعيل وتفريغ {count} كود بنجاح!"}

# 5. حذف كود معين
@app.delete("/api/admin/delete/{item_id}")
async def delete_item(item_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM activations WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

# 6. مسح الكل
@app.delete("/api/admin/clear-all")
async def clear_all():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM activations")
    conn.commit()
    conn.close()
    return {"status": "success", "message": "تم مسح جميع الأكواد."}

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  🚀 Starting Screen Activator Server...")
    print("  🌐 Customer Portal: http://localhost:8000")
    print("  ⚙️  Admin Dashboard: http://localhost:8000/admin")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 80)))


