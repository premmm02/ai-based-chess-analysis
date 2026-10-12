console.log("ChessAnalysis loaded");


/* =========================================================
   ELEMENT REFERENCES
========================================================= */

const board =
    document.getElementById("board");

const arrowCanvas =
    document.getElementById("arrow-canvas");

const moveHistory =
    document.getElementById("move-history");

const openingName =
    document.getElementById("opening-name");

const whiteCapturesBox =
    document.getElementById("white-captures");

const blackCapturesBox =
    document.getElementById("black-captures");

const whiteStatus =
    document.getElementById("white-status");

const blackStatus =
    document.getElementById("black-status");

const bestMoveText =
    document.getElementById("best-move");

const evaluationText =
    document.getElementById("evaluation");

const mateText =
    document.getElementById("mate");

const aiOpening =
    document.getElementById("ai-opening");


/* =========================================================
   NAVIGATION CONTROLS
========================================================= */

const firstBtn =
    document.getElementById("first");

const prevBtn =
    document.getElementById("previous");

const nextBtn =
    document.getElementById("next");

const lastBtn =
    document.getElementById("last");


/* =========================================================
   SETTINGS MODAL
========================================================= */

const optionsBtn =
    document.getElementById("options-button");

const optionsOverlay =
    document.getElementById("options-overlay");

const closeOptions =
    document.getElementById("close-options");

const flipBtn =
    document.getElementById("flip");

const coordsBtn =
    document.getElementById("coordinates-option");

const bestMovePrefSelect =
    document.getElementById(
        "best-move-preference"
    );


/* =========================================================
   AI MODAL
========================================================= */

const aiBtn =
    document.getElementById("ai-button");

const aiOverlay =
    document.getElementById("ai-overlay");

const closeAi =
    document.getElementById("close-ai");

const bestMoveModal =
    document.getElementById(
        "best-move-modal"
    );

const bestMoveCopy =
    document.getElementById(
        "best-move-copy"
    );

const openingCopy =
    document.getElementById(
        "opening-copy"
    );


/* =========================================================
   CHECKMATE / DRAW MODAL
========================================================= */

const checkmateOverlay =
    document.getElementById(
        "checkmate-overlay"
    );

const winnerText =
    document.getElementById(
        "winner-text"
    );

const winnerMessage =
    document.getElementById(
        "winner-message"
    );

const closeCheckmate =
    document.getElementById(
        "close-checkmate"
    );

const newGameButton =
    document.getElementById(
        "new-game"
    );


/* =========================================================
   SAVE GAME
========================================================= */

const saveGameBtn =
    document.getElementById(
        "save-game"
    );


/* =========================================================
   GAME HISTORY
========================================================= */

const historyButton =
    document.getElementById(
        "history-button"
    );

const historyOverlay =
    document.getElementById(
        "history-overlay"
    );

const closeHistory =
    document.getElementById(
        "close-history"
    );

const refreshGames =
    document.getElementById(
        "refresh-games"
    );

const savedGamesList =
    document.getElementById(
        "saved-games-list"
    );

/* =========================================================
   CHESS.JS VALIDATION
========================================================= */

if (typeof Chess === "undefined") {

    alert("Chess.js missing");

    throw new Error(
        "Chess.js missing"
    );
}


const chess =
    new Chess();


/* =========================================================
   STATE MANAGEMENT
========================================================= */

let flipped = false;

let selectedSquare = null;

let showCoordinates = true;

let showBestMoveFor = "both";

let positionHistory = [
    chess.fen()
];

let historyIndex = 0;

let movesList = [];

let activeAbortController = null;


/* =========================================================
   OPENINGS DICTIONARY
========================================================= */

const openingsMap = {

    "e4":
        "King's Pawn Game",

    "e4 e5":
        "Open Game",

    "e4 e5 Nf3 Nc6 Bb5":
        "Ruy Lopez",

    "e4 e5 Nf3 Nc6 Bc4":
        "Italian Game",

    "e4 c5":
        "Sicilian Defense",

    "e4 e6":
        "French Defense",

    "e4 c6":
        "Caro-Kann Defense",

    "d4":
        "Queen's Pawn Game",

    "d4 d5":
        "Closed Game",

    "d4 d5 c4":
        "Queen's Gambit",

    "d4 Nf6":
        "Indian Defense",

    "c4":
        "English Opening",

    "Nf3":
        "Réti Opening"
};


/* =========================================================
   SVG ARROW
========================================================= */

function getSquareCenter(squareName) {

    const file =
        squareName[0];

    const rank =
        parseInt(
            squareName[1]
        );

    const files = [
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g",
        "h"
    ];

    let colIndex =
        files.indexOf(file);

    let rowIndex =
        8 - rank;


    if (flipped) {

        colIndex =
            7 - colIndex;

        rowIndex =
            7 - rowIndex;
    }


    const x =
        (colIndex + 0.5) * 12.5;

    const y =
        (rowIndex + 0.5) * 12.5;


    return {
        x: x,
        y: y
    };
}


function clearArrows() {

    if (arrowCanvas) {

        arrowCanvas.innerHTML = "";
    }
}


function drawBestMoveArrow(
    fromSquare,
    toSquare
) {

    clearArrows();

    if (window.practiceMode) return;


    if (
        !fromSquare ||
        !toSquare ||
        !arrowCanvas
    ) {

        return;
    }


    const start =
        getSquareCenter(
            fromSquare
        );

    const end =
        getSquareCenter(
            toSquare
        );


    const ns =
        "http://www.w3.org/2000/svg";


    const defs =
        document.createElementNS(
            ns,
            "defs"
        );


    defs.innerHTML = `
        <marker
            id="arrowhead"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="3.5"
            markerHeight="3.5"
            orient="auto-start-reverse">

            <path
                d="M 0 1.5 L 8 5 L 0 8.5 z"
                fill="#f6b21a">
            </path>

        </marker>
    `;


    arrowCanvas.appendChild(
        defs
    );


    const line =
        document.createElementNS(
            ns,
            "line"
        );


    line.setAttribute(
        "x1",
        `${start.x}%`
    );

    line.setAttribute(
        "y1",
        `${start.y}%`
    );

    line.setAttribute(
        "x2",
        `${end.x}%`
    );

    line.setAttribute(
        "y2",
        `${end.y}%`
    );

    line.setAttribute(
        "stroke",
        "#f6b21a"
    );

    line.setAttribute(
        "stroke-width",
        "1.2%"
    );

    line.setAttribute(
        "stroke-linecap",
        "round"
    );

    line.setAttribute(
        "opacity",
        "0.9"
    );

    line.setAttribute(
        "marker-end",
        "url(#arrowhead)"
    );


    arrowCanvas.appendChild(
        line
    );
}


/* =========================================================
   CREATE PIECE IMAGE
========================================================= */

function createPieceImage(
    piece,
    squareName
) {

    const img =
        document.createElement("img");


    const pieceCode =
        piece.color +
        piece.type.toUpperCase();


    img.src =
        `https://chessboardjs.com/img/chesspieces/wikipedia/${pieceCode}.png`;


    img.alt =
        pieceCode;

    img.dataset.pieceCode = pieceCode;
    img.dataset.squareName = squareName;
    img.className =
        "piece";

    img.draggable =
        true;


    /* -----------------------------------------
       DRAG START
    ----------------------------------------- */

    img.addEventListener(
        "dragstart",
        (e) => {

            if (
                historyIndex !==
                positionHistory.length - 1
            ) {

                e.preventDefault();

                return;
            }

            if (window.multiplayerMode && (window.multiplayerMatchStatus !== "active" || chess.turn() !== window.multiplayerColor)) {
                e.preventDefault();
                return;
            }

            if (
                piece.color !==
                chess.turn()
            ) {

                e.preventDefault();

                return;
            }


            e.dataTransfer.setData(
                "text/plain",
                squareName
            );


            img.classList.add(
                "dragging"
            );
        }
    );


    /* -----------------------------------------
       DRAG END
    ----------------------------------------- */

    img.addEventListener(
        "dragend",
        () => {

            img.classList.remove(
                "dragging"
            );
        }
    );


    return img;
}


/* =========================================================
   GET SQUARE ELEMENT
========================================================= */

function getSquareElement(
    squareName
) {

    if (!board) {
        return null;
    }

    return board.querySelector(
        `[data-square="${squareName}"]`
    );
}


/* =========================================================
   CREATE BOARD
========================================================= */

function createBoard() {

    if (!board) {
        return;
    }


    board.innerHTML =
        "";


    const files = [
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g",
        "h"
    ];


    const fileOrder =
        flipped
            ? [...files].reverse()
            : files;


    const rowOrder =
        flipped
            ? [1, 2, 3, 4, 5, 6, 7, 8]
            : [8, 7, 6, 5, 4, 3, 2, 1];


    for (
        let r = 0;
        r < 8;
        r++
    ) {

        for (
            let c = 0;
            c < 8;
            c++
        ) {

            const square =
                document.createElement(
                    "div"
                );


            const row =
                rowOrder[r];

            const col =
                fileOrder[c];


            const squareName =
                col + row;


            square.classList.add(
                "square"
            );


            square.classList.add(
                (r + c) % 2 === 0
                    ? "light"
                    : "dark"
            );


            square.dataset.square =
                squareName;


            /* -----------------------------------------
               COORDINATES
            ----------------------------------------- */

            if (showCoordinates) {

                if (c === 0) {

                    const rank =
                        document.createElement(
                            "span"
                        );

                    rank.className =
                        "coordinate rank";

                    rank.textContent =
                        row;

                    square.appendChild(
                        rank
                    );
                }


                if (r === 7) {

                    const file =
                        document.createElement(
                            "span"
                        );

                    file.className =
                        "coordinate file";

                    file.textContent =
                        col;

                    square.appendChild(
                        file
                    );
                }
            }


            /* -----------------------------------------
               CLICK
            ----------------------------------------- */

            square.addEventListener(
                "click",
                () =>
                    handleSquareClick(
                        squareName
                    )
            );


            /* -----------------------------------------
               DRAG OVER
            ----------------------------------------- */

            square.addEventListener(
                "dragover",
                (e) =>
                    e.preventDefault()
            );


            /* -----------------------------------------
               DROP
            ----------------------------------------- */

            square.addEventListener(
                "drop",
                (e) => {

                    e.preventDefault();


                    if (
                        historyIndex !==
                        positionHistory.length - 1
                    ) {

                        return;
                    }


                    const fromSquare =
                        e.dataTransfer.getData(
                            "text/plain"
                        );


                    if (fromSquare) {

                        executeMove(
                            fromSquare,
                            squareName
                        );
                    }
                }
            );


            board.appendChild(
                square
            );
        }
    }


    renderPieces();
}


/* =========================================================
   RENDER PIECES
========================================================= */

function renderPieces() {
    if (!board) return;

    const currentBoard = chess.board();
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const squareName = files[col] + (8 - row);
            const squareEl = getSquareElement(squareName);
            if (!squareEl) continue;

            const piece = currentBoard[row][col];
            const desiredCode = piece ? piece.color + piece.type.toUpperCase() : "";
            const existingImg = squareEl.querySelector(".piece");
            const existingCode = existingImg?.dataset.pieceCode || existingImg?.alt || "";

            // Keep unchanged piece nodes in place; only changed squares are updated.
            if (existingImg && existingCode !== desiredCode) existingImg.remove();
            if (desiredCode && (!existingImg || existingCode !== desiredCode)) {
                squareEl.appendChild(createPieceImage(piece, squareName));
            }
        }
    }
}

/* =========================================================
   CLEAR HIGHLIGHTS
========================================================= */

function clearHighlights() {

    document
        .querySelectorAll(".square")
        .forEach(
            sq => {

                sq.classList.remove(
                    "selected",
                    "legal",
                    "capture-legal",
                    "hint-from",
                    "hint-to"
                );
            }
        );
}


/* =========================================================
   HANDLE SQUARE CLICK
========================================================= */

function handleSquareClick(
    squareName
) {

    if (window.multiplayerMode && (window.multiplayerMatchStatus !== "active" || chess.turn() !== window.multiplayerColor)) {
        return;
    }

    /* Do not allow moves while viewing old position */

    if (
        historyIndex !==
        positionHistory.length - 1
    ) {

        return;
    }


    const pieceOnSquare =
        chess.get(squareName);


    /* -----------------------------------------
       SECOND CLICK
    ----------------------------------------- */

    if (selectedSquare) {

        if (
            selectedSquare ===
            squareName
        ) {

            selectedSquare =
                null;

            clearHighlights();

            return;
        }


        const moveExecuted =
            executeMove(
                selectedSquare,
                squareName
            );


        if (moveExecuted) {

            selectedSquare =
                null;

            clearHighlights();

            return;
        }
    }


    /* -----------------------------------------
       SELECT OWN PIECE
    ----------------------------------------- */

    if (
        pieceOnSquare &&
        pieceOnSquare.color ===
        chess.turn()
    ) {

        selectedSquare =
            squareName;


        clearHighlights();


        const squareEl =
            getSquareElement(
                squareName
            );


        if (squareEl) {

            squareEl.classList.add(
                "selected"
            );
        }


        const legalMoves =
            chess.moves({
                square:
                    squareName,

                verbose:
                    true
            });


        legalMoves.forEach(
            move => {

                const targetEl =
                    getSquareElement(
                        move.to
                    );


                if (targetEl) {

                    targetEl.classList.add(
                        move.captured
                            ? "capture-legal"
                            : "legal"
                    );
                }
            }
        );

    } else {

        selectedSquare =
            null;

        clearHighlights();
    }
}


/* =========================================================
   EXECUTE MOVE
========================================================= */

function executeMove(
    from,
    to
) {

    if (window.multiplayerMode && window.multiplayerMatchStatus !== "active") {
        return false;
    }

    /* Only allow moves from current position */

    if (
        historyIndex !==
        positionHistory.length - 1
    ) {

        return false;
    }


    if (window.multiplayerMode && chess.turn() !== window.multiplayerColor) {
        return false;
    }
    if (window.practiceMode && chess.turn() !== "w") {
        return false;
    }

    const move =
        chess.move({

            from:
                from,

            to:
                to,

            promotion:
                "q"
        });


    if (move === null) {

        return false;
    }

    if (window.practiceMode) {
        document.getElementById("hint-status")?.replaceChildren();
    }

    /* -----------------------------------------
       REMOVE FUTURE HISTORY
    ----------------------------------------- */

    positionHistory =
        positionHistory.slice(
            0,
            historyIndex + 1
        );


    movesList =
        movesList.slice(
            0,
            historyIndex
        );


    /* -----------------------------------------
       ADD NEW POSITION
    ----------------------------------------- */

    positionHistory.push(
        chess.fen()
    );


    movesList.push(
        move.san
    );


    historyIndex++;


    updateGameUI();

    if (window.multiplayerMode) {
        if (typeof window.submitMultiplayerMove === "function") {
            window.submitMultiplayerMove({from, to, promotion: "q", san: move.san});
        }
    } else {
        if (typeof window.accountAutoSave === "function") {
            window.accountAutoSave();
        }
        if (window.practiceMode && chess.turn() === "b" && !chess.game_over()) {
            window.requestStrongAIMove?.();
        }
    }

    return true;
}


/* =========================================================
   UPDATE GAME UI
========================================================= */

function updateGameUI() {

    renderPieces();

    clearHighlights();

    clearArrows();

    updateTurnStatus();

    updateMoveHistoryDisplay();

    updateCapturedPieces();

    detectOpening();

    const practiceScreenHidden = document.getElementById("practice-screen")?.hidden;
    if (window.multiplayerMode) {
        if (bestMoveText) bestMoveText.textContent = "Available in practice mode";
        if (evaluationText) evaluationText.textContent = "0.0";
        if (mateText) mateText.textContent = "None";
    } else if (!window.practiceMode && !practiceScreenHidden) {
        fetchAIAnalysis();
    } else {
        if (bestMoveText) bestMoveText.textContent = "Use Hint for a recommendation";
        if (evaluationText) evaluationText.textContent = "0.0";
        if (mateText) mateText.textContent = "None";
    }

    checkGameOver();
}


/* =========================================================
   UPDATE TURN STATUS
========================================================= */

function updateTurnStatus() {

    if (
        !whiteStatus ||
        !blackStatus
    ) {

        return;
    }


    const isWhiteTurn =
        chess.turn() === "w";


    whiteStatus.textContent =
        isWhiteTurn
            ? "White: To move"
            : "White: Waiting";


    whiteStatus.className =
        `player-status ${
            isWhiteTurn
                ? "active"
                : ""
        }`;


    blackStatus.textContent =
        !isWhiteTurn
            ? "Black: To move"
            : "Black: Waiting";


    blackStatus.className =
        `player-status ${
            !isWhiteTurn
                ? "active"
                : ""
        }`;
}


/* =========================================================
   MOVE HISTORY DISPLAY
========================================================= */

function updateMoveHistoryDisplay() {

    if (!moveHistory) {
        return;
    }


    if (
        movesList.length === 0
    ) {

        moveHistory.textContent =
            "No moves yet";

        return;
    }


    let html = "";


    for (
        let i = 0;
        i < movesList.length;
        i += 2
    ) {

        const moveNumber =
            Math.floor(i / 2) + 1;


        const whiteMove =
            movesList[i];


        const blackMove =
            movesList[i + 1]
                ? movesList[i + 1]
                : "";


        /*
           Position 0 = starting position
           Position 1 = after white move
           Position 2 = after black move
        */

        const whiteIndex =
            i + 1;


        const blackIndex =
            i + 2;


        const whiteActive =
            historyIndex ===
            whiteIndex
                ? "active-move"
                : "";


        const blackActive =
            historyIndex ===
            blackIndex
                ? "active-move"
                : "";


        html +=
            `<span class="move-number">${moveNumber}.</span> `;


        html +=
            `<span class="history-item ${whiteActive}"
                onclick="jumpToHistory(${whiteIndex})">
                ${whiteMove}
            </span> `;


        if (blackMove) {

            html +=
                `<span class="history-item ${blackActive}"
                    onclick="jumpToHistory(${blackIndex})">
                    ${blackMove}
                </span> `;
        }
    }


    moveHistory.innerHTML =
        html;


    moveHistory.scrollTop =
        moveHistory.scrollHeight;
}


/* =========================================================
   JUMP TO HISTORY
========================================================= */

function jumpToHistory(
    index
) {

    if (
        index < 0 ||
        index >= positionHistory.length
    ) {

        return;
    }


    historyIndex =
        index;


    chess.load(
        positionHistory[
            historyIndex
        ]
    );


    selectedSquare =
        null;


    renderPieces();

    clearHighlights();

    clearArrows();

    updateTurnStatus();

    updateMoveHistoryDisplay();

    updateCapturedPieces();

    detectOpening();

    if (!window.multiplayerMode) fetchAIAnalysis();


    /*
       Do not show the game-over popup repeatedly
       while navigating through history.
    */

    if (
        historyIndex ===
        positionHistory.length - 1
    ) {

        checkGameOver();
    }
}


/* =========================================================
   CAPTURED PIECES
========================================================= */

function updateCapturedPieces() {

    const startingCounts = {

        p: 8,
        n: 2,
        b: 2,
        r: 2,
        q: 1,

        P: 8,
        N: 2,
        B: 2,
        R: 2,
        Q: 1
    };


    const currentCounts = {

        p: 0,
        n: 0,
        b: 0,
        r: 0,
        q: 0,

        P: 0,
        N: 0,
        B: 0,
        R: 0,
        Q: 0
    };


    const pieceSymbols = {

        p: "♟",
        n: "♞",
        b: "♝",
        r: "♜",
        q: "♛",

        P: "♙",
        N: "♘",
        B: "♗",
        R: "♖",
        Q: "♕"
    };


    chess.board().forEach(
        row => {

            row.forEach(
                p => {

                    if (p) {

                        const key =
                            p.color === "w"
                                ? p.type.toUpperCase()
                                : p.type;


                        currentCounts[key]++;
                    }
                }
            );
        }
    );


    /* -----------------------------------------
       WHITE CAPTURES
       Missing BLACK pieces
    ----------------------------------------- */

    const blackPieceKeys = [
        "p",
        "n",
        "b",
        "r",
        "q"
    ];


    let whiteCapturesHtml =
        "";


    blackPieceKeys.forEach(
        p => {

            const missing =
                startingCounts[p] -
                currentCounts[p];


            if (missing > 0) {

                whiteCapturesHtml +=
                    pieceSymbols[p].repeat(
                        missing
                    ) + " ";
            }
        }
    );


    /* -----------------------------------------
       BLACK CAPTURES
       Missing WHITE pieces
    ----------------------------------------- */

    const whitePieceKeys = [
        "P",
        "N",
        "B",
        "R",
        "Q"
    ];


    let blackCapturesHtml =
        "";


    whitePieceKeys.forEach(
        p => {

            const missing =
                startingCounts[p] -
                currentCounts[p];


            if (missing > 0) {

                blackCapturesHtml +=
                    pieceSymbols[p].repeat(
                        missing
                    ) + " ";
            }
        }
    );


    if (whiteCapturesBox) {

        whiteCapturesBox.textContent =
            whiteCapturesHtml.trim() ||
            "None";
    }


    if (blackCapturesBox) {

        blackCapturesBox.textContent =
            blackCapturesHtml.trim() ||
            "None";
    }
}


/* =========================================================
   OPENING DETECTION
========================================================= */

function detectOpening() {

    const moveStr =
        movesList
            .slice(
                0,
                historyIndex
            )
            .join(" ");


    let name =
        "Starting Position";


    for (
        const [sequence, opName]
        of Object.entries(
            openingsMap
        )
    ) {

        if (
            moveStr.startsWith(
                sequence
            )
        ) {

            name =
                opName;
        }
    }


    if (openingName) {

        openingName.textContent =
            name;
    }


    if (aiOpening) {

        aiOpening.textContent =
            name;
    }


    if (openingCopy) {

        openingCopy.textContent =
            name;
    }
}


/* =========================================================
   AI ANALYSIS
========================================================= */

async function fetchAIAnalysis() {

    if (
        activeAbortController
    ) {

        activeAbortController.abort();
    }


    activeAbortController =
        new AbortController();


    const signal =
        activeAbortController.signal;


    if (bestMoveText) {

        bestMoveText.textContent =
            "Analyzing...";
    }


    if (evaluationText) {

        evaluationText.textContent =
            "--";
    }


    if (mateText) {

        mateText.textContent =
            "None";
    }


    clearArrows();


    const currentTurn =
        chess.turn();


    const shouldDisplayBestMove =

        showBestMoveFor ===
        "both" ||

        (
            showBestMoveFor ===
            "w" &&
            currentTurn === "w"
        ) ||

        (
            showBestMoveFor ===
            "b" &&
            currentTurn === "b"
        );


    if (
        !shouldDisplayBestMove
    ) {

        if (bestMoveText) {

            bestMoveText.textContent =
                "Disabled for " +
                (
                    currentTurn === "w"
                        ? "White"
                        : "Black"
                );
        }


        if (bestMoveModal) {

            bestMoveModal.textContent =
                "Disabled";
        }


        if (bestMoveCopy) {

            bestMoveCopy.textContent =
                "Disabled";
        }
    }


    try {

        const fen =
            chess.fen();


        const response =
            await fetch(
                `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`,
                {
                    signal
                }
            );


        if (!response.ok) {

            throw new Error(
                "No evaluation available"
            );
        }


        const data =
            await response.json();


        if (
            data.pvs &&
            data.pvs[0]
        ) {

            const topPv =
                data.pvs[0];


            const uciMove =
                topPv.moves
                    ? topPv.moves.split(" ")[0]
                    : "";


            /* -----------------------------------------
               BEST MOVE
            ----------------------------------------- */

            if (
                uciMove &&
                uciMove.length >= 4
            ) {

                const fromSq =
                    uciMove.substring(
                        0,
                        2
                    );


                const toSq =
                    uciMove.substring(
                        2,
                        4
                    );


                if (
                    shouldDisplayBestMove
                ) {

                    drawBestMoveArrow(
                        fromSq,
                        toSq
                    );


                    if (bestMoveText) {

                        bestMoveText.textContent =
                            uciMove;
                    }


                    if (bestMoveModal) {

                        bestMoveModal.textContent =
                            uciMove;
                    }


                    if (bestMoveCopy) {

                        bestMoveCopy.textContent =
                            uciMove;
                    }
                }
            }


            /* -----------------------------------------
               EVALUATION
            ----------------------------------------- */

            if (
                topPv.cp !== undefined
            ) {

                const evalScore =
                    (
                        topPv.cp / 100
                    ).toFixed(1);


                const formattedEval =
                    evalScore > 0
                        ? `+${evalScore}`
                        : `${evalScore}`;


                if (evaluationText) {

                    evaluationText.textContent =
                        formattedEval;
                }

            } else if (
                topPv.mate !== undefined
            ) {

                if (evaluationText) {

                    evaluationText.textContent =
                        `#${topPv.mate}`;
                }


                if (mateText) {

                    mateText.textContent =
                        `Mate in ${Math.abs(
                            topPv.mate
                        )}`;
                }
            }
        }

    } catch (err) {

        if (
            err.name !==
            "AbortError"
        ) {

            console.error(
                "AI Analysis Error:",
                err
            );


            if (
                shouldDisplayBestMove
            ) {

                if (bestMoveText) {

                    bestMoveText.textContent =
                        "N/A";
                }


                if (bestMoveModal) {

                    bestMoveModal.textContent =
                        "N/A";
                }


                if (bestMoveCopy) {

                    bestMoveCopy.textContent =
                        "N/A";
                }
            }


            if (evaluationText) {

                evaluationText.textContent =
                    "0.0";
            }


            clearArrows();
        }
    }
}


/* =========================================================
   CHECKMATE / DRAW
========================================================= */

function checkGameOver() {

    if (window.multiplayerMode) {
        return; // The multiplayer server reports the final result to both players.
    }

    if (
        historyIndex !==
        positionHistory.length - 1
    ) {

        return;
    }


    if (
        chess.in_checkmate()
    ) {

        const winner =
            chess.turn() === "w"
                ? "Black"
                : "White";


        if (winnerText) {

            winnerText.textContent =
                `${winner} wins!`;
        }


        if (winnerMessage) {

            winnerMessage.textContent =
                "Checkmate! Excellent game.";
        }


        if (checkmateOverlay) {

            checkmateOverlay.classList.add(
                "show"
            );
        }

    } else if (
        chess.in_draw()
    ) {

        if (winnerText) {

            winnerText.textContent =
                "Draw!";
        }


        if (winnerMessage) {

            winnerMessage.textContent =
                chess.in_stalemate()
                    ? "Stalemate!"
                    : "Game drawn.";
        }


        if (checkmateOverlay) {

            checkmateOverlay.classList.add(
                "show"
            );
        }
    }
}


/* =========================================================
   GET GAME RESULT
========================================================= */

function getGameResult() {

    if (
        chess.in_checkmate()
    ) {

        return chess.turn() === "w"
            ? "Black Wins"
            : "White Wins";
    }


    if (
        chess.in_draw()
    ) {

        return "Draw";
    }


    return "In Progress";
}


/* =========================================================
   SAVE GAME TO FLASK + SQLITE
========================================================= */

async function saveGameToDatabase() {

    if (
        movesList.length === 0
    ) {

        alert(
            "Make at least one move before saving."
        );

        return;
    }


    /*
       Save only moves up to the currently
       selected position.
    */

    const currentMoves =
        movesList.slice(
            0,
            historyIndex
        );


    const moves = [];


    for (
        let i = 0;
        i < currentMoves.length;
        i += 2
    ) {

        moves.push({

            move_number:
                Math.floor(i / 2) + 1,

            player_move:
                currentMoves[i] || "",

            ai_move:
                currentMoves[i + 1] || ""
        });
    }


    const result =
        getGameResult();


    try {

        const response =
            await window.apiFetch(
                "/save-game",
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            player_name:
                                "Player",

                            opponent:
                                "AI",

                            result:
                                result,

                            moves:
                                moves
                        })
                }
            );


        if (!response.ok) {

            throw new Error(
                "Server error"
            );
        }


        const data =
            await response.json();


        if (
            data.success
        ) {

            alert(
                "Game saved successfully!"
            );


            console.log(
                "Saved Game ID:",
                data.game_id
            );

        } else {

            alert(
                "Failed to save game."
            );
        }

    } catch (error) {

        console.error(
            "Database Error:",
            error
        );


        alert(
            "Could not save this game right now. Please try again."
        );
    }
}


/* =========================================================
   LOAD SAVED GAMES
========================================================= */

async function loadSavedGames() {

    if (!savedGamesList) {
        return;
    }


    savedGamesList.innerHTML = `
        <p class="history-loading">
            Loading saved games...
        </p>
    `;


    try {

        const response =
            await window.apiFetch(
                "/games"
            );


        if (!response.ok) {

            throw new Error(
                "Failed to load games"
            );
        }


        const games =
            await response.json();


        if (
            games.length === 0
        ) {

            savedGamesList.innerHTML = `
                <p class="history-empty">
                    No saved games yet.
                </p>
            `;

            return;
        }


        let html = "";


        games.forEach(
            game => {

                html += `
                    <div
                        class="saved-game-card"
                       onclick="openSavedGameReview(${game.id})"
                    >

                        <div class="saved-game-top">

                            <span class="saved-game-id">
                                Game #${game.id}
                            </span>

                            <span class="saved-game-result">
                                ${game.result}
                            </span>

                        </div>


                        <div class="saved-game-details">

                            <div>
                                Player:
                                <strong>
                                    ${game.player_name}
                                </strong>
                            </div>

                            <div>
                                Opponent:
                                <strong>
                                    ${game.opponent}
                                </strong>
                            </div>

                            <div>
                                Date:
                                <strong>
                                    ${game.date}
                                </strong>
                            </div>

                        </div>


                        <div class="open-game-text">
                            Click to review game
                        </div>

                    </div>
                `;
            }
        );


        savedGamesList.innerHTML =
            html;


    } catch (error) {

        console.error(
            "Game History Error:",
            error
        );


        savedGamesList.innerHTML = `
            <p class="history-error">
                No games to display right now.
            </p>
        `;
    }
}


window.loadSavedGames = loadSavedGames;

/* =========================================================
   LOAD ONE SAVED GAME
========================================================= */

async function loadSavedGame(
    gameId
) {

    try {

        if (savedGamesList) {

            savedGamesList.innerHTML = `
                <p class="history-loading">
                    Loading Game #${gameId}...
                </p>
            `;
        }


        const response =
            await window.apiFetch(
                `/games/${gameId}`
            );


        if (!response.ok) {

            throw new Error(
                "Could not load saved game"
            );
        }


        const data =
            await response.json();


        if (
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Game not found"
            );
        }


        /* -----------------------------------------
           RESET CURRENT CHESS GAME
        ----------------------------------------- */

        chess.reset();


        positionHistory =
            [
                chess.fen()
            ];


        movesList =
            [];


        historyIndex =
            0;


        selectedSquare =
            null;


        /* -----------------------------------------
           REPLAY SAVED MOVES
        ----------------------------------------- */

        data.moves.forEach(
            movePair => {

                const playerMove =
                    movePair.player_move;


                const aiMove =
                    movePair.ai_move;


                /* White / Player move */

                if (
                    playerMove &&
                    playerMove.trim() !== ""
                ) {

                    const move =
                        chess.move(
                            playerMove,
                            {
                                sloppy:
                                    true
                            }
                        );


                    if (move) {

                        movesList.push(
                            move.san
                        );


                        positionHistory.push(
                            chess.fen()
                        );
                    }
                }


                /* Black / AI move */

                if (
                    aiMove &&
                    aiMove.trim() !== ""
                ) {

                    const move =
                        chess.move(
                            aiMove,
                            {
                                sloppy:
                                    true
                            }
                        );


                    if (move) {

                        movesList.push(
                            move.san
                        );


                        positionHistory.push(
                            chess.fen()
                        );
                    }
                }
            }
        );


        /*
           Start replay from beginning
        */

        historyIndex =
            0;


        chess.load(
            positionHistory[0]
        );


        selectedSquare =
            null;


        clearHighlights();

        clearArrows();


        /*
           Close Game History modal
        */

        if (historyOverlay) {

            historyOverlay.classList.remove(
                "show"
            );
        }


        /*
           Update complete UI
        */

        renderPieces();

        updateTurnStatus();

        updateMoveHistoryDisplay();

        updateCapturedPieces();

        detectOpening();

        fetchAIAnalysis();


        console.log(
            "Loaded saved game:",
            data.game
        );


    } catch (error) {

        console.error(
            "Load Game Error:",
            error
        );


        alert(
            "Could not load the saved game."
        );


        /*
           Reload history list after error
        */

        loadSavedGames();
    }
}


/*
   IMPORTANT:
   Makes loadSavedGame() available to
   onclick="loadSavedGame(id)"
*/

window.loadSavedGame =
    loadSavedGame;

window.jumpToHistory =
    jumpToHistory;


/* =========================================================
   NAVIGATION BUTTONS
========================================================= */

if (firstBtn) {

    firstBtn.addEventListener(
        "click",
        () =>
            jumpToHistory(0)
    );
}


if (prevBtn) {

    prevBtn.addEventListener(
        "click",
        () =>
            jumpToHistory(
                historyIndex - 1
            )
    );
}


if (nextBtn) {

    nextBtn.addEventListener(
        "click",
        () =>
            jumpToHistory(
                historyIndex + 1
            )
    );
}


if (lastBtn) {

    lastBtn.addEventListener(
        "click",
        () =>
            jumpToHistory(
                positionHistory.length - 1
            )
    );
}


/* =========================================================
   KEYBOARD NAVIGATION
========================================================= */

document.addEventListener(
    "keydown",
    (e) => {

        /*
           Left arrow = previous move
        */

        if (
            e.key === "ArrowLeft"
        ) {

            jumpToHistory(
                historyIndex - 1
            );
        }


        /*
           Right arrow = next move
        */

        if (
            e.key === "ArrowRight"
        ) {

            jumpToHistory(
                historyIndex + 1
            );
        }
    }
);


/* =========================================================
   SETTINGS MODAL
========================================================= */

if (
    optionsBtn &&
    optionsOverlay
) {

    optionsBtn.addEventListener(
        "click",
        () =>
            optionsOverlay.classList.add(
                "show"
            )
    );
}


if (
    closeOptions &&
    optionsOverlay
) {

    closeOptions.addEventListener(
        "click",
        () =>
            optionsOverlay.classList.remove(
                "show"
            )
    );
}


/* =========================================================
   AI MODAL
========================================================= */

if (
    aiBtn &&
    aiOverlay
) {

    aiBtn.addEventListener(
        "click",
        () =>
            aiOverlay.classList.add(
                "show"
            )
    );
}


if (
    closeAi &&
    aiOverlay
) {

    closeAi.addEventListener(
        "click",
        () =>
            aiOverlay.classList.remove(
                "show"
            )
    );
}


/* =========================================================
   BEST MOVE PREFERENCE
========================================================= */

if (bestMovePrefSelect) {

    bestMovePrefSelect.addEventListener(
        "change",
        (e) => {

            showBestMoveFor =
                e.target.value;


            fetchAIAnalysis();
        }
    );
}


/* =========================================================
   FLIP BOARD
========================================================= */

if (
    flipBtn &&
    optionsOverlay
) {

    flipBtn.addEventListener(
        "click",
        () => {

            flipped =
                !flipped;


            createBoard();

            fetchAIAnalysis();


            optionsOverlay.classList.remove(
                "show"
            );
        }
    );
}


/* =========================================================
   COORDINATES
========================================================= */

if (
    coordsBtn &&
    optionsOverlay
) {

    coordsBtn.addEventListener(
        "click",
        () => {

            showCoordinates =
                !showCoordinates;


            createBoard();


            optionsOverlay.classList.remove(
                "show"
            );
        }
    );
}


/* =========================================================
   CHECKMATE MODAL → GAME REPORT
========================================================= */

if (
    closeCheckmate &&
    checkmateOverlay
) {

    closeCheckmate.addEventListener(
        "click",
        () => {

            checkmateOverlay.classList.remove(
                "show"
            );

            openGameReview();
        }
    );
}
/* =========================================================
   NEW GAME
========================================================= */

if (newGameButton) {
    newGameButton.addEventListener("click", () => {
        if (typeof window.handlePracticeNewGame === "function") {
            window.handlePracticeNewGame();
            return;
        }
        chess.reset();
        positionHistory = [chess.fen()];
        movesList = [];
        historyIndex = 0;
        selectedSquare = null;
        checkmateOverlay?.classList.remove("show");
        updateGameUI();
    });
}


/* =========================================================
   SAVE GAME BUTTON
========================================================= */

if (saveGameBtn) {

    saveGameBtn.addEventListener("click", () => {
        if (typeof window.savePracticeGameNow === "function") window.savePracticeGameNow();
        else saveGameToDatabase();
    });
}


/* =========================================================
   GAME HISTORY BUTTON
========================================================= */

if (
    historyButton &&
    historyOverlay
) {

    historyButton.addEventListener(
        "click",
        () => {

            historyOverlay.classList.add(
                "show"
            );


            loadSavedGames();
        }
    );
}


/* =========================================================
   CLOSE GAME HISTORY
========================================================= */

if (
    closeHistory &&
    historyOverlay
) {

    closeHistory.addEventListener(
        "click",
        () => {

            historyOverlay.classList.remove(
                "show"
            );
        }
    );
}


/* =========================================================
   REFRESH GAME HISTORY
========================================================= */

if (refreshGames) {

    refreshGames.addEventListener(
        "click",
        () => {

            loadSavedGames();
        }
    );
}




/* =========================================================
   INITIALIZATION
========================================================= */

createBoard();

updateGameUI();
