from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
import bcrypt
import re
import sqlite3

# Resolve every file relative to this script, so the server works from any working directory
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "database.db"

app = FastAPI(title="Movie Finder API")

# 1. Enable CORS for Frontend Communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Serve Static Frontend Directories (CSS & JS)
if (BASE_DIR / "css").is_dir():
    app.mount("/css", StaticFiles(directory=BASE_DIR / "css"), name="css")
if (BASE_DIR / "js").is_dir():
    app.mount("/js", StaticFiles(directory=BASE_DIR / "js"), name="js")

# 3. Password Hashing (bcrypt directly: passlib is unmaintained and crashes with bcrypt >= 4.1)
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], hashed.encode("utf-8"))
    except ValueError:
        return False

# 4. Initialize SQLite Database
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            password TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

init_db()

# 5. Pydantic Request Schemas (Using 'str' to avoid email-validator dependency)
class RegisterSchema(BaseModel):
    fullName: str
    username: str
    email: str
    password: str

class LoginSchema(BaseModel):
    username: str
    password: str

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")

def bad_request(detail: str):
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

# Helper Database Connection
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# --- HTML FRONTEND PAGE ROUTES ---

@app.get("/")
def serve_landing():
    landing = BASE_DIR / "landing.html"
    if landing.exists():
        return FileResponse(landing)
    return {"message": "Movie Finder API is running!"}

@app.get("/{page_name}.html")
def serve_html_pages(page_name: str):
    # Only plain file names: blocks any attempt to read files outside the project folder
    file_path = BASE_DIR / f"{page_name}.html"
    if re.fullmatch(r"[A-Za-z0-9_-]+", page_name) and file_path.is_file():
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Page not found")

# --- BACKEND DATABASE API ENDPOINTS ---

@app.post("/api/register")
def register(user: RegisterSchema):
    full_name = user.fullName.strip()
    username = user.username.strip()
    email = user.email.strip()

    if not full_name:
        bad_request("Full name required")
    if not USERNAME_RE.match(username):
        bad_request("Username must be 3-30 characters: letters, numbers, _ . -")
    if not EMAIL_RE.match(email):
        bad_request("Invalid email address")
    if len(user.password) < 4:
        bad_request("Password must be at least 4 characters")
    if len(user.password.encode("utf-8")) > 72:
        bad_request("Password is too long (max 72 bytes)")

    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (full_name, username, email, password) VALUES (?, ?, ?, ?)",
            (full_name, username, email, hash_password(user.password))
        )
        conn.commit()
        return {"success": True, "message": "User registered successfully!"}
    except sqlite3.IntegrityError:
        bad_request("Username already exists")
    finally:
        conn.close()

@app.post("/api/login")
def login(user: LoginSchema):
    conn = get_db()
    db_user = conn.execute("SELECT * FROM users WHERE username = ?", (user.username.strip(),)).fetchone()
    conn.close()

    if not db_user or not verify_password(user.password, db_user["password"]):
        bad_request("Invalid username or password")

    return {
        "success": True,
        "message": "Login successful!",
        "user": {"username": db_user["username"], "fullName": db_user["full_name"]}
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
