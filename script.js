const board = document.getElementById("board");
const currentPlayerText = document.getElementById("currentPlayer");
let boardState = Array(8).fill(null).map(() => Array(8).fill(null));
let currentPlayer = "black";
let musicStarted = false; // Menandakan apakah musik sudah dimulai


// Fungsi untuk menginisialisasi papan
function initializeBoard() {
    board.innerHTML = "";
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const cell = document.createElement("div");
            cell.classList.add("cell");
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.addEventListener("click", handleMove);
            board.appendChild(cell);
        }
    }


    // Set posisi awal
    boardState[3][3] = "white";
    boardState[3][4] = "black";
    boardState[4][3] = "black";
    boardState[4][4] = "white";
    renderBoard();
}


// Fungsi untuk menggambar ulang papan
function renderBoard() {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const cell = board.querySelector(`.cell[data-row='${row}'][data-col='${col}']`);
            cell.innerHTML = "";
            if (boardState[row][col]) {
                const disc = document.createElement("div");
                disc.classList.add("disc", boardState[row][col]);
                cell.appendChild(disc);
            }
        }
    }
}


// Fungsi untuk menangani gerakan
function handleMove(event) {
    const row = parseInt(event.target.dataset.row);
    const col = parseInt(event.target.dataset.col);


    if (isValidMove(row, col, currentPlayer)) {
        placeDisc(row, col, currentPlayer);
        flipDiscs(row, col, currentPlayer);
        currentPlayer = currentPlayer === "black" ? "white" : "black";
        currentPlayerText.textContent = currentPlayer === "black" ? "Hitam" : "Putih";
        renderBoard();


        if (!hasValidMoves(currentPlayer)) {
            alert("Permainan berakhir!");
        }
    } else {
        alert("Langkah tidak valid!");
    }
}


// Fungsi untuk meletakkan disk
function placeDisc(row, col, player) {
    boardState[row][col] = player;
 // Memulai musik saat klik pertama
 if (!musicStarted) {
    const backgroundMusic = document.getElementById("backgroundMusic");
    backgroundMusic.play();
    musicStarted = true;
}


}


// Fungsi untuk membalik disk
function flipDiscs(row, col, player) {
    const directions = [
        [0, 1], [1, 0], [0, -1], [-1, 0],
        [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];


    directions.forEach(direction => {
        let discsToFlip = [];
        let r = row + direction[0];
        let c = col + direction[1];


        while (r >= 0 && r < 8 && c >= 0 && c < 8 && boardState[r][c] && boardState[r][c] !== player) {
            discsToFlip.push([r, c]);
            r += direction[0];
            c += direction[1];
        }


        if (r >= 0 && r < 8 && c >= 0 && c < 8 && boardState[r][c] === player) {
            discsToFlip.forEach(([r, c]) => {
                boardState[r][c] = player;
            });
        }
    });
}


// Fungsi untuk mengecek langkah yang valid
function isValidMove(row, col, player) {
    if (boardState[row][col] !== null) return false;


    const directions = [
        [0, 1], [1, 0], [0, -1], [-1, 0],
        [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];


    return directions.some(direction => {
        let r = row + direction[0];
        let c = col + direction[1];
        let hasOpponentDisc = false;


        while (r >= 0 && r < 8 && c >= 0 && c < 8 && boardState[r][c] && boardState[r][c] !== player) {
            hasOpponentDisc = true;
            r += direction[0];
            c += direction[1];
        }


        return hasOpponentDisc && r >= 0 && r < 8 && c >= 0 && c < 8 && boardState[r][c] === player;
    });
}


// Fungsi untuk memeriksa apakah ada langkah yang valid
function hasValidMoves(player) {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (isValidMove(row, col, player)) return true;
        }
    }
    return false;
}


// Fungsi untuk mereset permainan
function resetGame() {
    boardState = Array(8).fill(null).map(() => Array(8).fill(null));
    currentPlayer = "black";
    currentPlayerText.textContent = "Hitam";
    initializeBoard();
}


// Inisialisasi permainan
initializeBoard();




