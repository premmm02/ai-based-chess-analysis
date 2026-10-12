CHESS ANALYSIS — GAME REPORT PATCH

Files:
- index.html: replaces the old Game Review popup with the dashboard-style Game Report and adds a Game Report button to the header.
- css/style.css: keeps your existing colors and adds the new responsive report dashboard styles.
- js/script.js: your existing board/game code with the old review popup logic removed and the evaluation display target corrected.
- js/review.js: new report dashboard, cloud-evaluation analysis, move classifications, phase accuracy, and move table.

HOW TO APPLY
1. Back up your current project folder.
2. Replace your current index.html with this index.html.
3. Replace css/style.css with this css/style.css.
4. Replace js/script.js with this js/script.js.
5. Replace js/review.js with this js/review.js (create the file if it does not exist).
6. Run the Flask backend as usual, then open the site.

IMPORTANT
The report currently uses Lichess Cloud Eval, which only returns evaluations for positions already cached by that service. The UI marks positions without an evaluation as Unrated and displays coverage instead of inventing numbers. For complete reports on every position, the backend should run Stockfish locally; app.py was not included in the uploaded code, so this patch does not alter your backend.
