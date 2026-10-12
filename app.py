import os
import sqlite3
import secrets
import hashlib
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import chess

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, allow_headers=["Content-Type", "Authorization"])
DATABASE = os.environ.get("CHESS_DATABASE_PATH", os.path.join(os.path.dirname(__file__), "chessanalysis.db"))
# Sessions remain valid until the user explicitly logs out.
START_RATING = 1200
AI_RATING = 1500


def connect_db():
    conn = sqlite3.connect(DATABASE, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 15000")
    return conn


def create_database():
    db_dir = os.path.dirname(os.path.abspath(DATABASE))
    os.makedirs(db_dir, exist_ok=True)
    conn = connect_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL COLLATE NOCASE UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS auth_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT,
            opponent TEXT NOT NULL DEFAULT 'Built-in AI',
            result TEXT NOT NULL DEFAULT 'In Progress',
            date TEXT NOT NULL DEFAULT (datetime('now')),
            user_id INTEGER,
            status TEXT NOT NULL DEFAULT 'In Progress',
            client_game_key TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS moves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL,
            move_number INTEGER NOT NULL,
            player_move TEXT,
            ai_move TEXT,
            FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_moves_game ON moves(game_id, move_number);
        CREATE TABLE IF NOT EXISTS friends (
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, friend_id),
            CHECK (user_id <> friend_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(friend_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS multiplayer_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            white_user_id INTEGER NOT NULL,
            black_user_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            result TEXT NOT NULL DEFAULT 'In Progress',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(white_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(black_user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_matches_white ON multiplayer_matches(white_user_id, status, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_matches_black ON multiplayer_matches(black_user_id, status, updated_at DESC);
        CREATE TABLE IF NOT EXISTS multiplayer_moves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            ply INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            uci TEXT NOT NULL,
            san TEXT NOT NULL,
            fen TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(match_id, ply),
            FOREIGN KEY(match_id) REFERENCES multiplayer_matches(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """)
    # Upgrade older college-project databases safely.
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(games)").fetchall()}
    if "user_id" not in cols:
        conn.execute("ALTER TABLE games ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
    if "status" not in cols:
        conn.execute("ALTER TABLE games ADD COLUMN status TEXT NOT NULL DEFAULT 'In Progress'")
    if "client_game_key" not in cols:
        conn.execute("ALTER TABLE games ADD COLUMN client_game_key TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_games_user_date ON games(user_id, date DESC)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_games_user_client_key ON games(user_id, client_game_key) WHERE client_game_key IS NOT NULL")
    conn.commit()
    conn.close()


def token_digest(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def make_session(user_id):
    token = secrets.token_urlsafe(40)
    expires = datetime(9999, 12, 31, 23, 59, 59, tzinfo=timezone.utc).isoformat()
    conn = connect_db()
    conn.execute("INSERT INTO auth_sessions(user_id, token_hash, expires_at) VALUES(?,?,?)", (user_id, token_digest(token), expires))
    conn.commit()
    conn.close()
    return token


def current_user_from_request():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    conn = connect_db()
    row = conn.execute("""SELECT u.id, u.username, s.id AS session_id, s.expires_at
                          FROM auth_sessions s JOIN users u ON u.id=s.user_id
                          WHERE s.token_hash=?""", (token_digest(token),)).fetchone()
    if row:
        # The user has asked to stay signed in until Log out is selected.
        conn.close()
        return {"id": row["id"], "username": row["username"], "session_id": row["session_id"]}
    conn.close()
    return None


def login_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        user = current_user_from_request()
        if not user:
            return jsonify(success=False, message="Please log in to continue."), 401
        g.user = user
        return fn(*args, **kwargs)
    return wrapped


def auth_response(user_id, username):
    return jsonify(success=True, token=make_session(user_id), user={"id": user_id, "username": username})


@app.get("/health")
def health_check():
    try:
        conn = connect_db()
        conn.execute("SELECT 1").fetchone()
        conn.close()
        return jsonify(success=True, status="ok")
    except sqlite3.Error:
        app.logger.exception("Health check failed")
        return jsonify(success=False, status="database_unavailable"), 503


@app.get("/")
def home():
    return send_from_directory(os.path.dirname(__file__), "index.html")


@app.get("/css/<path:filename>")
def frontend_css(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), "css"), filename)


@app.get("/js/<path:filename>")
def frontend_js(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), "js"), filename)


@app.get("/assets/<path:filename>")
def frontend_assets(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), "assets"), filename)


@app.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    if not 3 <= len(username) <= 24 or not all(ch.isalnum() or ch in "_-" for ch in username):
        return jsonify(success=False, message="Username must be 3–24 characters and use only letters, numbers, _ or -."), 400
    if len(password) < 8:
        return jsonify(success=False, message="Password must be at least 8 characters."), 400
    conn = connect_db()
    try:
        cur = conn.execute("INSERT INTO users(username, password_hash) VALUES(?,?)", (username, generate_password_hash(password)))
        user_id = cur.lastrowid
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify(success=False, message="That username is already taken. Try another one."), 409
    conn.close()
    return auth_response(user_id, username)


@app.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    conn = connect_db()
    user = conn.execute("SELECT id, username, password_hash FROM users WHERE username=? COLLATE NOCASE", (username,)).fetchone()
    conn.close()
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify(success=False, message="Incorrect username or password."), 401
    return auth_response(user["id"], user["username"])


@app.get("/me")
@login_required
def me():
    return jsonify(success=True, user={"id": g.user["id"], "username": g.user["username"]})


@app.post("/logout")
@login_required
def logout():
    conn = connect_db()
    conn.execute("DELETE FROM auth_sessions WHERE id=?", (g.user["session_id"],))
    conn.commit()
    conn.close()
    return jsonify(success=True)


def normalize_moves(moves):
    normalized = []
    for idx, move in enumerate(moves or []):
        if not isinstance(move, dict):
            continue
        white = str(move.get("player_move") or "").strip()
        black = str(move.get("ai_move") or "").strip()
        if white or black:
            normalized.append({"move_number": idx + 1, "player_move": white, "ai_move": black})
    return normalized


@app.post("/games/autosave")
@login_required
def autosave_game():
    data = request.get_json(silent=True) or {}
    moves = normalize_moves(data.get("moves"))
    result = str(data.get("result", "In Progress"))[:40]
    game_id = data.get("game_id")
    game_key = str(data.get("game_key") or "").strip()[:100] or None
    conn = connect_db()
    owned = None
    if game_id:
        owned = conn.execute("SELECT id FROM games WHERE id=? AND user_id=?", (game_id, g.user["id"])).fetchone()
    if not owned and game_key:
        # Idempotency key covers the short window where a browser refresh happens
        # before the last autosave response can store its database ID locally.
        owned = conn.execute("SELECT id FROM games WHERE user_id=? AND client_game_key=?", (g.user["id"], game_key)).fetchone()
        if owned:
            game_id = owned["id"]
    if owned:
        conn.execute("UPDATE games SET result=?, status=?, client_game_key=COALESCE(client_game_key,?) WHERE id=? AND user_id=?",
                     (result, "Completed" if result != "In Progress" else "In Progress", game_key, game_id, g.user["id"]))
        conn.execute("DELETE FROM moves WHERE game_id=?", (game_id,))
    else:
        cur = conn.execute("INSERT INTO games(player_name, opponent, result, user_id, status, client_game_key) VALUES(?,?,?,?,?,?)",
                           (g.user["username"], "Built-in AI", result, g.user["id"], "Completed" if result != "In Progress" else "In Progress", game_key))
        game_id = cur.lastrowid
    for move in moves:
        conn.execute("INSERT INTO moves(game_id, move_number, player_move, ai_move) VALUES(?,?,?,?)",
                     (game_id, move["move_number"], move["player_move"], move["ai_move"]))
    conn.commit()
    conn.close()
    return jsonify(success=True, game_id=game_id, saved_moves=len(moves), result=result)


@app.post("/save-game")
@login_required
def legacy_save_game():
    # Compatibility route for older front-end code; it still saves only into the signed-in user's account.
    data = request.get_json(silent=True) or {}
    moves = normalize_moves(data.get("moves"))
    result = str(data.get("result", "Unknown"))[:40]
    conn = connect_db()
    cur = conn.execute("INSERT INTO games(player_name, opponent, result, user_id, status) VALUES(?,?,?,?,?)", (g.user["username"], "Built-in AI", result, g.user["id"], "Completed" if result != "In Progress" else "In Progress"))
    game_id = cur.lastrowid
    for move in moves:
        conn.execute("INSERT INTO moves(game_id, move_number, player_move, ai_move) VALUES(?,?,?,?)", (game_id, move["move_number"], move["player_move"], move["ai_move"]))
    conn.commit(); conn.close()
    return jsonify(success=True, game_id=game_id, message="Game saved.")


@app.get("/games")
@login_required
def get_games():
    conn = connect_db()
    rows = conn.execute("""SELECT g.id,g.player_name,g.opponent,g.result,g.date,g.status,
                           COUNT(m.id) AS move_rows FROM games g LEFT JOIN moves m ON m.game_id=g.id
                           WHERE g.user_id=? GROUP BY g.id ORDER BY g.id DESC""", (g.user["id"],)).fetchall()
    conn.close()
    return jsonify([{"id": r["id"], "player_name": r["player_name"], "opponent": r["opponent"], "result": r["result"], "date": r["date"], "status": r["status"], "move_count": r["move_rows"]} for r in rows])


@app.get("/games/<int:game_id>")
@login_required
def get_single_game(game_id):
    conn = connect_db()
    game = conn.execute("SELECT id,player_name,opponent,result,date,status FROM games WHERE id=? AND user_id=?", (game_id, g.user["id"])).fetchone()
    if not game:
        conn.close()
        return jsonify(success=False, message="Game not found."), 404
    rows = conn.execute("SELECT move_number,player_move,ai_move FROM moves WHERE game_id=? ORDER BY move_number", (game_id,)).fetchall()
    conn.close()
    return jsonify(success=True, game=dict(game), moves=[dict(r) for r in rows])


def _participant_match(conn, match_id, user_id):
    return conn.execute("""SELECT m.*, w.username AS white_username, b.username AS black_username
                          FROM multiplayer_matches m
                          JOIN users w ON w.id=m.white_user_id
                          JOIN users b ON b.id=m.black_user_id
                          WHERE m.id=? AND (m.white_user_id=? OR m.black_user_id=?)""",
                        (match_id, user_id, user_id)).fetchone()


def _match_payload(conn, match, user_id):
    moves = conn.execute("SELECT ply,user_id,uci,san,fen FROM multiplayer_moves WHERE match_id=? ORDER BY ply",
                         (match["id"],)).fetchall()
    is_white = match["white_user_id"] == user_id
    current_ply = len(moves)
    my_turn = match["status"] == "active" and ((current_ply % 2 == 0) == is_white)
    return {
        "id": match["id"], "status": match["status"], "result": match["result"],
        "white_user_id": match["white_user_id"], "black_user_id": match["black_user_id"],
        "white_username": match["white_username"], "black_username": match["black_username"],
        "my_color": "white" if is_white else "black", "my_turn": my_turn,
        "incoming": match["status"] == "pending" and match["black_user_id"] == user_id,
        "created_at": match["created_at"], "updated_at": match["updated_at"],
        "fen": moves[-1]["fen"] if moves else chess.STARTING_FEN,
        "moves": [{"ply": r["ply"], "user_id": r["user_id"], "uci": r["uci"], "san": r["san"], "fen": r["fen"]} for r in moves]
    }


def _archive_multiplayer_match(conn, match):
    """Add each finished online game to both players' normal History/Dashboard."""
    moves = conn.execute("SELECT san FROM multiplayer_moves WHERE match_id=? ORDER BY ply", (match["id"],)).fetchall()
    for user_id, username, other, color in [
        (match["white_user_id"], match["white_username"], match["black_username"], "white"),
        (match["black_user_id"], match["black_username"], match["white_username"], "black")
    ]:
        opponent_label = f"Online match #{match['id']} vs {other}"
        already_archived = conn.execute("SELECT 1 FROM games WHERE user_id=? AND opponent=? LIMIT 1",
                                        (user_id, opponent_label)).fetchone()
        if already_archived:
            continue
        if match["result"] == "Draw":
            personal_result = "Draw"
        elif match["result"] == "White Wins":
            personal_result = "Win" if color == "white" else "Loss"
        else:
            personal_result = "Win" if color == "black" else "Loss"
        cur = conn.execute("INSERT INTO games(player_name,opponent,result,user_id,status) VALUES(?,?,?,?, 'Completed')",
                           (username, opponent_label, personal_result, user_id))
        game_id = cur.lastrowid
        for i in range(0, len(moves), 2):
            conn.execute("INSERT INTO moves(game_id,move_number,player_move,ai_move) VALUES(?,?,?,?)",
                         (game_id, i // 2 + 1, moves[i]["san"], moves[i + 1]["san"] if i + 1 < len(moves) else ""))


@app.get("/friends")
@login_required
def get_friends():
    conn = connect_db()
    rows = conn.execute("""SELECT u.id,u.username,f.created_at FROM friends f
                          JOIN users u ON u.id=f.friend_id WHERE f.user_id=? ORDER BY u.username COLLATE NOCASE""",
                        (g.user["id"],)).fetchall()
    conn.close()
    return jsonify(success=True, friends=[dict(r) for r in rows])


@app.post("/friends")
@login_required
def add_friend():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    if not username:
        return jsonify(success=False, message="Enter the exact username you want to add."), 400
    conn = connect_db()
    friend = conn.execute("SELECT id,username FROM users WHERE username=? COLLATE NOCASE", (username,)).fetchone()
    if not friend:
        conn.close()
        return jsonify(success=False, message="No account has that username. Check the spelling and try again."), 404
    if friend["id"] == g.user["id"]:
        conn.close()
        return jsonify(success=False, message="You cannot add your own account."), 400
    conn.execute("INSERT OR IGNORE INTO friends(user_id,friend_id) VALUES(?,?)", (g.user["id"], friend["id"]))
    conn.execute("INSERT OR IGNORE INTO friends(user_id,friend_id) VALUES(?,?)", (friend["id"], g.user["id"]))
    conn.commit()
    conn.close()
    return jsonify(success=True, friend={"id": friend["id"], "username": friend["username"]})


@app.delete("/friends/<int:friend_id>")
@login_required
def remove_friend(friend_id):
    conn = connect_db()
    conn.execute("DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)",
                 (g.user["id"], friend_id, friend_id, g.user["id"]))
    conn.commit()
    conn.close()
    return jsonify(success=True)


@app.get("/multiplayer/matches")
@login_required
def list_multiplayer_matches():
    conn = connect_db()
    rows = conn.execute("""SELECT m.*,w.username AS white_username,b.username AS black_username
                          FROM multiplayer_matches m JOIN users w ON w.id=m.white_user_id
                          JOIN users b ON b.id=m.black_user_id
                          WHERE (m.white_user_id=? OR m.black_user_id=?) AND m.status IN ('pending','active')
                          ORDER BY CASE m.status WHEN 'pending' THEN 0 ELSE 1 END, m.updated_at DESC""",
                        (g.user["id"], g.user["id"])).fetchall()
    payload = [_match_payload(conn, row, g.user["id"]) for row in rows]
    conn.close()
    return jsonify(success=True, matches=payload)


@app.post("/multiplayer/matches")
@login_required
def create_multiplayer_match():
    data = request.get_json(silent=True) or {}
    try:
        friend_id = int(data.get("friend_id"))
    except (TypeError, ValueError):
        return jsonify(success=False, message="Choose a friend first."), 400
    if friend_id == g.user["id"]:
        return jsonify(success=False, message="You cannot challenge yourself."), 400
    conn = connect_db()
    is_friend = conn.execute("SELECT 1 FROM friends WHERE user_id=? AND friend_id=?", (g.user["id"], friend_id)).fetchone()
    if not is_friend:
        conn.close()
        return jsonify(success=False, message="Add this player as a friend before challenging them."), 403
    other = conn.execute("SELECT id FROM users WHERE id=?", (friend_id,)).fetchone()
    if not other:
        conn.close()
        return jsonify(success=False, message="Player not found."), 404
    active = conn.execute("""SELECT id FROM multiplayer_matches WHERE status IN ('pending','active')
                             AND ((white_user_id=? AND black_user_id=?) OR (white_user_id=? AND black_user_id=?)) LIMIT 1""",
                          (g.user["id"], friend_id, friend_id, g.user["id"])).fetchone()
    if active:
        conn.close()
        return jsonify(success=False, message="You already have a pending challenge or active game with this friend."), 409
    cur = conn.execute("INSERT INTO multiplayer_matches(white_user_id,black_user_id,status) VALUES(?,?,'pending')",
                       (g.user["id"], friend_id))
    match_id = cur.lastrowid
    row = _participant_match(conn, match_id, g.user["id"])
    payload = _match_payload(conn, row, g.user["id"])
    conn.commit()
    conn.close()
    return jsonify(success=True, match=payload), 201


@app.post("/multiplayer/matches/<int:match_id>/respond")
@login_required
def respond_multiplayer_match(match_id):
    data = request.get_json(silent=True) or {}
    accept = bool(data.get("accept"))
    conn = connect_db()
    match = _participant_match(conn, match_id, g.user["id"])
    if not match:
        conn.close()
        return jsonify(success=False, message="Match not found."), 404
    if match["status"] != "pending" or match["black_user_id"] != g.user["id"]:
        conn.close()
        return jsonify(success=False, message="This challenge is no longer waiting for your response."), 409
    status = "active" if accept else "declined"
    conn.execute("UPDATE multiplayer_matches SET status=?,updated_at=datetime('now') WHERE id=?", (status, match_id))
    match = _participant_match(conn, match_id, g.user["id"])
    conn.commit()
    payload = _match_payload(conn, match, g.user["id"])
    conn.close()
    return jsonify(success=True, match=payload)


@app.get("/multiplayer/matches/<int:match_id>")
@login_required
def get_multiplayer_match(match_id):
    conn = connect_db()
    match = _participant_match(conn, match_id, g.user["id"])
    if not match:
        conn.close()
        return jsonify(success=False, message="Match not found."), 404
    payload = _match_payload(conn, match, g.user["id"])
    conn.close()
    return jsonify(success=True, match=payload)


@app.post("/multiplayer/matches/<int:match_id>/move")
@login_required
def play_multiplayer_move(match_id):
    data = request.get_json(silent=True) or {}
    from_sq = str(data.get("from", "")).lower()
    to_sq = str(data.get("to", "")).lower()
    promotion = str(data.get("promotion", "q")).lower()
    if promotion not in {"q", "r", "b", "n"}:
        promotion = "q"
    try:
        chess.parse_square(from_sq)
        chess.parse_square(to_sq)
    except ValueError:
        return jsonify(success=False, message="Invalid chess squares."), 400

    conn = connect_db()
    conn.execute("BEGIN IMMEDIATE")
    match = _participant_match(conn, match_id, g.user["id"])
    if not match:
        conn.close()
        return jsonify(success=False, message="Match not found."), 404
    if match["status"] != "active":
        conn.close()
        return jsonify(success=False, message="This game is not active."), 409

    move_rows = conn.execute("SELECT uci FROM multiplayer_moves WHERE match_id=? ORDER BY ply", (match_id,)).fetchall()
    board = chess.Board()
    try:
        for row in move_rows:
            board.push_uci(row["uci"])
    except (ValueError, chess.InvalidMoveError, chess.IllegalMoveError):
        conn.close()
        return jsonify(success=False, message="The saved match position is invalid. Reload the game."), 500

    user_is_white = match["white_user_id"] == g.user["id"]
    if (board.turn == chess.WHITE) != user_is_white:
        conn.close()
        return jsonify(success=False, message="It is not your turn yet."), 409
    try:
        move = chess.Move.from_uci(f"{from_sq}{to_sq}{promotion if board.piece_at(chess.parse_square(from_sq)) and board.piece_at(chess.parse_square(from_sq)).piece_type == chess.PAWN and chess.square_rank(chess.parse_square(to_sq)) in (0,7) else ''}")
        if move not in board.legal_moves:
            conn.close()
            return jsonify(success=False, message="That move is not legal in the current position."), 400
        san = board.san(move)
        board.push(move)
    except (ValueError, chess.InvalidMoveError):
        conn.close()
        return jsonify(success=False, message="That move could not be applied."), 400

    ply = len(move_rows) + 1
    conn.execute("INSERT INTO multiplayer_moves(match_id,ply,user_id,uci,san,fen) VALUES(?,?,?,?,?,?)",
                 (match_id, ply, g.user["id"], move.uci(), san, board.fen()))
    status, result = "active", "In Progress"
    if board.is_checkmate():
        status = "completed"
        result = "White Wins" if board.turn == chess.BLACK else "Black Wins"
    elif board.is_stalemate() or board.is_insufficient_material() or board.is_seventyfive_moves() or board.is_fivefold_repetition():
        status, result = "completed", "Draw"
    conn.execute("UPDATE multiplayer_matches SET status=?,result=?,updated_at=datetime('now') WHERE id=?", (status, result, match_id))
    if status == "completed":
        _archive_multiplayer_match(conn, _participant_match(conn, match_id, g.user["id"]))
    match = _participant_match(conn, match_id, g.user["id"])
    payload = _match_payload(conn, match, g.user["id"])
    conn.commit()
    conn.close()
    return jsonify(success=True, match=payload)


@app.post("/multiplayer/matches/<int:match_id>/resign")
@login_required
def resign_multiplayer_match(match_id):
    conn = connect_db()
    match = _participant_match(conn, match_id, g.user["id"])
    if not match:
        conn.close()
        return jsonify(success=False, message="Match not found."), 404
    if match["status"] != "active":
        conn.close()
        return jsonify(success=False, message="This game is already finished."), 409
    result = "Black Wins" if match["white_user_id"] == g.user["id"] else "White Wins"
    conn.execute("UPDATE multiplayer_matches SET status='completed',result=?,updated_at=datetime('now') WHERE id=?", (result, match_id))
    _archive_multiplayer_match(conn, _participant_match(conn, match_id, g.user["id"]))
    conn.commit()
    conn.close()
    return jsonify(success=True, result=result)


def get_result_outcome(result):
    r = (result or "").lower()
    if "white wins" in r or r in ("win", "won", "1-0"): return "win"
    if "black wins" in r or r in ("loss", "lost", "0-1"): return "loss"
    if "draw" in r or r in ("1/2-1/2", "½-½"): return "draw"
    return "in_progress"


@app.get("/dashboard")
@login_required
def dashboard():
    conn = connect_db()
    games = conn.execute("SELECT id,result,date,status FROM games WHERE user_id=? ORDER BY id ASC", (g.user["id"],)).fetchall()
    recent = conn.execute("""SELECT g.id,g.result,g.date,g.status,COUNT(m.id) AS move_rows
                            FROM games g LEFT JOIN moves m ON m.game_id=g.id
                            WHERE g.user_id=? GROUP BY g.id ORDER BY g.id DESC LIMIT 8""", (g.user["id"],)).fetchall()
    conn.close()
    rated = [game for game in games if get_result_outcome(game["result"]) != "in_progress"]
    wins = sum(get_result_outcome(gm["result"]) == "win" for gm in rated)
    losses = sum(get_result_outcome(gm["result"]) == "loss" for gm in rated)
    draws = sum(get_result_outcome(gm["result"]) == "draw" for gm in rated)
    rating = START_RATING
    history = []
    for game in rated:
        outcome = get_result_outcome(game["result"])
        actual = 1.0 if outcome == "win" else 0.5 if outcome == "draw" else 0.0
        expected = 1 / (1 + 10 ** ((AI_RATING - rating) / 400))
        rating = max(100, round(rating + 32 * (actual - expected)))
        history.append({"game_number": len(history) + 1, "rating": rating, "result": outcome})
    recent_results = [get_result_outcome(game["result"]) for game in rated]
    streak_type = recent_results[-1] if recent_results else ""
    streak = 0
    for outcome in reversed(recent_results):
        if outcome != streak_type: break
        streak += 1
    recent_payload = []
    for row in recent:
        outcome = get_result_outcome(row["result"])
        label = {"win":"Win", "loss":"Loss", "draw":"Draw", "in_progress":"In progress"}[outcome]
        recent_payload.append({"id": row["id"], "result": row["result"], "outcome": label, "date": row["date"], "move_count": row["move_rows"] * 2})
    return jsonify(success=True, username=g.user["username"], rating=rating, rating_change=rating-START_RATING,
                   games_played=len(games), rated_games=len(rated), wins=wins, losses=losses, draws=draws,
                   win_rate=round((wins / len(rated)) * 100) if rated else 0,
                   current_streak=streak, streak_type=streak_type.title() if streak_type else "",
                   rating_history=history, recent_games=recent_payload)



# Initialize/migrate SQLite for both `python app.py` and WSGI deployments.
create_database()

if __name__ == "__main__":
    print("Chess Analysis API running at http://127.0.0.1:5000")
    print("Database:", DATABASE)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=os.environ.get("FLASK_DEBUG") == "1")
