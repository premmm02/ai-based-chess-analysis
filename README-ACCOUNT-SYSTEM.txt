CHESS ANALYSIS — UPDATED PRACTICE, ACCOUNTS & RENDER DEPLOYMENT

FEATURES
- Practice header includes Home, Hint, Save and New Game.
- Hint searches the current position and marks just one recommended legal move.
- Built-in in-browser AI; no Stockfish executable or engine installation is required.
- Username-based friends and online games. Move legality is validated by python-chess on the server; no chess engine executable is required.
- Practice games autosave into the signed-in account and appear in History and Player Dashboard.
- Pieces that have not moved remain in place; AI moves animate to the destination.
- Current game state is saved to local browser storage after every move and restored after refresh.
- Server-side game auto-save continues to update the current game record.
- Sign-in remains active until the user selects Log out.
- Flask serves index.html, CSS and JavaScript from the same origin for deployment; Render can check /health before routing traffic.
- CHESS_DATABASE_PATH supports using a Render persistent disk for SQLite.

LOCAL SETUP (WINDOWS)
1. Keep index.html, app.py, css/, js/, requirements.txt and the other project files together.
2. Install dependencies: py -m pip install -r requirements.txt
3. Start the application locally: py app.py
4. Open http://127.0.0.1:5000. Do not open index.html directly when testing account features.

RENDER DEPLOYMENT
1. Push this project to GitHub with index.html and app.py in the repository root.
2. Create a Render Blueprint from the repository and use render.yaml, or create a Python web service.
3. Build command: pip install -r requirements.txt
4. Start command: gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4
5. Set CHESS_DATABASE_PATH=/var/data/chessanalysis.db and attach a persistent disk mounted at /var/data. The supplied render.yaml provisions a persistent disk and a paid Starter web service, which is needed for SQLite data to survive redeploys.
6. Keep the SQLite file on the persistent disk; the default app folder on Render is not durable across redeploys.

DATA / LOGIN NOTES
- Existing local chessanalysis.db is not included in the download. Keep a backup of it if you have existing accounts/games.
- Login tokens are kept in localStorage and remain valid until explicit logout; clearing browser data will remove the browser's token.
- Local board state is kept per account in that browser, and the backend saves games to the account's SQLite database.
- The built-in AI makes a fast search locally in the browser and does not depend on Stockfish.
- If an existing database has a default opponent label of Stockfish, newly saved games still use Built-in AI.


Online multiplayer notes
- Both people need accounts. Add the other player's exact username in Online Multiplayer; friend links are mutual.
- Challenge your friend. The challenged player accepts the match; White moves first. The board polls the server for the opponent's moves and validates moves on the server.
- Active games are stored in SQLite on the Render persistent disk. Finished games are added to both players' History and Player Dashboard.
- The service uses one Gunicorn worker in render.yaml because this project uses SQLite on a single persistent disk. Keep the service and disk in the same Render region.
