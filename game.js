// --- グローバル変数 ---
const GRID_SIZE = 5;
const PROBLEM_GROUP_SIZE = 100;
let currentProblemIndex = 0;
let boardState = []; 
let isLocked = false; // 採点中は操作禁止にするフラグ

// 要素の取得
const gridContainer = document.getElementById('grid-container');
const tateObjEl = document.getElementById('tate-objective');
const yokoObjEl = document.getElementById('yoko-objective');
const checkBtn = document.getElementById('check-btn');
const retryBtn = document.getElementById('retry-btn');
const nextBtn = document.getElementById('next-problem-btn');
const clearMsgEl = document.getElementById('clear-message');
const resultCard = document.getElementById('result-card');
const tateResEl = document.getElementById('tate-result');
const yokoResEl = document.getElementById('yoko-result');
const ruleModal = document.getElementById('rule-modal');
const ruleModalBtn = document.getElementById('rule-modal-btn');
const ruleModalClose = document.getElementById('rule-modal-close');
const problemNumberEl = document.getElementById('problem-number');
const problemMenu = document.getElementById('problem-menu');
const problemMenuToggle = document.getElementById('problem-menu-toggle');
const problemMenuClose = document.getElementById('problem-menu-close');
const problemMenuSections = document.getElementById('problem-menu-sections');
const problemJumpInput = document.getElementById('problem-jump-input');
const problemJumpBtn = document.getElementById('problem-jump-btn');
const problemRandomBtn = document.getElementById('problem-random-btn');
let overlayLockCount = 0;
let problemMenuButtons = [];
let problemMenuSectionMeta = [];

/**
 * カギ番号リストと、番号を表示すべき座標マップを返す
 */
function getClueInfo(board) {
    const tateStarts = [];
    const yokoStarts = [];
    const clueCells = [];

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c] === 0) continue;

            const isTopBlackOrOut = (r === 0) || (board[r - 1][c] === 0);
            const isTateClueContinues = (r < GRID_SIZE - 1) && (board[r + 1][c] === 1);
            const isTateStart = isTopBlackOrOut && isTateClueContinues;

            const isLeftBlackOrOut = (c === 0) || (board[r][c - 1] === 0);
            const isYokoClueContinues = (c < GRID_SIZE - 1) && (board[r][c + 1] === 1);
            const isYokoStart = isLeftBlackOrOut && isYokoClueContinues;

            if (isTateStart) tateStarts.push({ r, c });
            if (isYokoStart) yokoStarts.push({ r, c });

            if (isTateStart || isYokoStart) {
                clueCells.push({ r, c });
            }
        }
    }

    const coordSort = (a, b) => (a.r !== b.r ? a.r - b.r : a.c - b.c);
    
    // 重複除外とソート
    const uniqueCluePoints = [];
    const seen = new Set();
    for (const cell of clueCells) {
        const key = `${cell.r},${cell.c}`;
        if (!seen.has(key)) {
            uniqueCluePoints.push(cell);
            seen.add(key);
        }
    }
    uniqueCluePoints.sort(coordSort);

    // 座標 -> 番号 マップ
    const coordToNum = new Map();
    uniqueCluePoints.forEach((coord, i) => {
        coordToNum.set(`${coord.r},${coord.c}`, i + 1);
    });

    // リスト生成
    const tateNums = tateStarts.sort(coordSort).map(c => coordToNum.get(`${c.r},${c.c}`));
    const yokoNums = yokoStarts.sort(coordSort).map(c => coordToNum.get(`${c.r},${c.c}`));

    return { 
        tate: tateNums, 
        yoko: yokoNums,
        map: coordToNum // アニメーション用
    };
}

function lockScroll() {
    overlayLockCount++;
    document.body.style.overflow = 'hidden';
}

function unlockScroll() {
    overlayLockCount = Math.max(overlayLockCount - 1, 0);
    if (overlayLockCount === 0) {
        document.body.style.overflow = '';
    }
}

function checkWhiteConnectivity(board) {
    let startCell = null;
    let totalWhite = 0;

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (board[r][c] !== 1) continue;
            totalWhite++;
            if (!startCell) {
                startCell = { r, c };
            }
        }
    }

    if (totalWhite === 0) {
        return { valid: false, message: "白マスがありません。1マス以上残してください。" };
    }

    const visited = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
    const queue = [startCell];
    visited[startCell.r][startCell.c] = true;
    let visitedCount = 1;
    const directions = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
    ];

    for (let i = 0; i < queue.length; i++) {
        const { r, c } = queue[i];
        for (const [dr, dc] of directions) {
            const nr = r + dr;
            const nc = c + dc;
            if (
                nr < 0 ||
                nr >= GRID_SIZE ||
                nc < 0 ||
                nc >= GRID_SIZE ||
                board[nr][nc] !== 1 ||
                visited[nr][nc]
            ) {
                continue;
            }
            visited[nr][nc] = true;
            visitedCount++;
            queue.push({ r: nr, c: nc });
        }
    }

    if (visitedCount !== totalWhite) {
        return { valid: false, message: "白マスはすべて連結するように配置してください。" };
    }

    return { valid: true };
}

function checkBorderWhites(board) {
    const topHasWhite = board[0].some(cell => cell === 1);
    const bottomHasWhite = board[GRID_SIZE - 1].some(cell => cell === 1);

    let leftHasWhite = false;
    let rightHasWhite = false;

    for (let r = 0; r < GRID_SIZE; r++) {
        if (board[r][0] === 1) leftHasWhite = true;
        if (board[r][GRID_SIZE - 1] === 1) rightHasWhite = true;
    }

    if (!topHasWhite || !bottomHasWhite || !leftHasWhite || !rightHasWhite) {
        return { valid: false, message: "端の行・列はすべて黒にならないようにしてください。" };
    }

    return { valid: true };
}

function validateBoard(board) {
    const connectivity = checkWhiteConnectivity(board);
    if (!connectivity.valid) return connectivity;

    const borderCheck = checkBorderWhites(board);
    if (!borderCheck.valid) return borderCheck;

    return { valid: true };
}

function showResultCard(showDetails) {
    resultCard.classList.add('show');
    resultCard.classList.toggle('has-details', !!showDetails);
    resultCard.setAttribute('aria-hidden', 'false');
}

function hideResultCard() {
    resultCard.classList.remove('show');
    resultCard.classList.remove('has-details');
    resultCard.setAttribute('aria-hidden', 'true');
}

/**
 * マスクリック処理
 */
function onCellClick(r, c, cellEl) {
    if (isLocked) return; // 採点中・クリア後は操作不可

    boardState[r][c] = 1 - boardState[r][c];
    cellEl.classList.toggle('black');
    
    // 数字が表示されていたら消す（再編集時）
    const existingNum = cellEl.querySelector('.clue-number');
    if (existingNum) existingNum.remove();
}

/**
 * 採点アニメーション開始
 */
async function startCheck() {
    if (isLocked) return;

    const validation = validateBoard(boardState);
    if (!validation.valid) {
        showResultCard(false);
        retryBtn.style.display = 'none';
        clearMsgEl.textContent = validation.message;
        clearMsgEl.style.color = '#B33A3A';
        return;
    }

    isLocked = true; // 操作ロック
    checkBtn.style.display = 'none';
    
    // 1. 盤面の数字を全消去
    document.querySelectorAll('.clue-number').forEach(el => el.remove());

    // 2. カギ情報を計算
    const info = getClueInfo(boardState);
    
    // 3. アニメーションループ
    // マップは順序が保証されないので、r, c の順で回して該当すれば表示
    let numberDelay = 0;
    
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const key = `${r},${c}`;
            if (info.map.has(key)) {
                const num = info.map.get(key);
                
                // 遅延して数字を表示
                await new Promise(resolve => setTimeout(resolve, 150)); // 0.15秒間隔
                
                const cell = document.querySelector(`.grid-cell[data-r="${r}"][data-c="${c}"]`);
                const numSpan = document.createElement('span');
                numSpan.className = 'clue-number';
                numSpan.textContent = num;
                cell.appendChild(numSpan);
            }
        }
    }

    // 4. 最終判定
    await new Promise(resolve => setTimeout(resolve, 300)); // 少し待つ
    showResult(info);
}

/**
 * 結果表示
 */
function showResult(info) {
    showResultCard(true);
    
    const objective = PROBLEMS[currentProblemIndex];
    
    // 配列比較
    const tateStr = info.tate.join(',');
    const yokoStr = info.yoko.join(',');
    const objTateStr = objective.tate.join(',');
    const objYokoStr = objective.yoko.join(',');

    // 結果のHTML生成
    tateResEl.innerHTML = info.tate.map(n => 
        objective.tate.includes(n) ? `<span class="match">${n}</span>` : `<span class="mismatch">${n}</span>`
    ).join(', ');
    
    yokoResEl.innerHTML = info.yoko.map(n => 
        objective.yoko.includes(n) ? `<span class="match">${n}</span>` : `<span class="mismatch">${n}</span>`
    ).join(', ');

    if (tateStr === objTateStr && yokoStr === objYokoStr) {
        // 正解
        clearMsgEl.textContent = "完成";
        clearMsgEl.style.color = "#538D4E";
        nextBtn.style.display = 'block';
        retryBtn.style.display = 'none';
    } else {
        // 不正解
        clearMsgEl.textContent = "未完成";
        clearMsgEl.style.color = "#B59F3B";
        retryBtn.style.display = 'inline-block'; // 修正ボタンを表示
    }
}

/**
 * 編集モードに戻る
 */
function retry() {
    isLocked = false;
    hideResultCard();
    retryBtn.style.display = 'none';
    checkBtn.style.display = 'inline-block';
    clearMsgEl.textContent = "";
    
    // 数字を消す
    document.querySelectorAll('.clue-number').forEach(el => el.remove());
}

/**
 * 盤面初期化
 */
function initializeBoard() {
    gridContainer.innerHTML = '';
    boardState = [];
    
    for (let r = 0; r < GRID_SIZE; r++) {
        const rowState = [];
        for (let c = 0; c < GRID_SIZE; c++) {
            rowState.push(1);
            
            const cellEl = document.createElement('div');
            cellEl.classList.add('grid-cell');
            cellEl.dataset.r = r;
            cellEl.dataset.c = c;
            
            cellEl.addEventListener('click', () => onCellClick(r, c, cellEl));
            gridContainer.appendChild(cellEl);
        }
        boardState.push(rowState);
    }
    
    // UIリセット
    hideResultCard();
    nextBtn.style.display = 'none';
    retryBtn.style.display = 'none';
    checkBtn.style.display = 'inline-block';
    clearMsgEl.textContent = "";
    isLocked = false;
}

function loadProblem(index) {
    currentProblemIndex = index % PROBLEMS.length;
    const problem = PROBLEMS[currentProblemIndex];
    tateObjEl.textContent = problem.tate.join(', ');
    yokoObjEl.textContent = problem.yoko.join(', ');
    initializeBoard();
    updateProblemIndicators();
}

function openRuleModal() {
    ruleModal.classList.add('show');
    ruleModal.setAttribute('aria-hidden', 'false');
    lockScroll();
}

function closeRuleModal() {
    if (!ruleModal.classList.contains('show')) return;
    ruleModal.classList.remove('show');
    ruleModal.setAttribute('aria-hidden', 'true');
    unlockScroll();
}

function openProblemMenu() {
    problemMenu.classList.add('show');
    problemMenu.setAttribute('aria-hidden', 'false');
    lockScroll();
    if (problemJumpInput) {
        problemJumpInput.classList.remove('invalid');
    }
}

function closeProblemMenu() {
    if (problemMenu.classList.contains('show')) {
        problemMenu.classList.remove('show');
        problemMenu.setAttribute('aria-hidden', 'true');
        unlockScroll();
    }
}

function handleProblemJump() {
    if (!problemJumpInput) return;
    const value = parseInt(problemJumpInput.value, 10);
    if (!Number.isInteger(value) || value < 1 || value > PROBLEMS.length) {
        problemJumpInput.classList.add('invalid');
        return;
    }
    problemJumpInput.classList.remove('invalid');
    closeProblemMenu();
    loadProblem(value - 1);
    problemJumpInput.value = '';
}

function jumpToRandomProblem() {
    const randomIndex = Math.floor(Math.random() * PROBLEMS.length);
    closeProblemMenu();
    loadProblem(randomIndex);
}

function populateProblemMenu() {
    if (!problemMenuSections) return;
    problemMenuSections.innerHTML = '';
    problemMenuButtons = new Array(PROBLEMS.length);
    problemMenuSectionMeta = [];

    for (let start = 0; start < PROBLEMS.length; start += PROBLEM_GROUP_SIZE) {
        const end = Math.min(start + PROBLEM_GROUP_SIZE, PROBLEMS.length);
        const readableStart = start + 1;
        const readableEnd = end;
        const sectionEl = document.createElement('div');
        sectionEl.className = 'menu-section';

        const headerBtn = document.createElement('button');
        headerBtn.type = 'button';
        headerBtn.className = 'menu-section-header';
        headerBtn.innerHTML = `<span>第${readableStart}問〜第${readableEnd}問</span><span class="chevron">⌄</span>`;

        const contentEl = document.createElement('div');
        contentEl.className = 'menu-section-content';

        const shouldExpand = currentProblemIndex >= start && currentProblemIndex < end;
        if (!shouldExpand) {
            sectionEl.classList.add('collapsed');
            contentEl.classList.add('collapsed');
        }

        headerBtn.addEventListener('click', () => {
            const collapsed = sectionEl.classList.toggle('collapsed');
            contentEl.classList.toggle('collapsed', collapsed);
        });

        for (let index = start; index < end; index++) {
            const button = document.createElement('button');
            button.className = 'menu-item';
            button.type = 'button';
            button.innerHTML = `<span>第${index + 1}問</span><span>(${PROBLEMS[index].tate.length}x${PROBLEMS[index].yoko.length})</span>`;
            button.addEventListener('click', () => {
                closeProblemMenu();
                loadProblem(index);
            });
            contentEl.appendChild(button);
            problemMenuButtons[index] = button;
        }

        sectionEl.appendChild(headerBtn);
        sectionEl.appendChild(contentEl);
        problemMenuSections.appendChild(sectionEl);
        problemMenuSectionMeta.push({ start, end, sectionEl, contentEl });
    }

    if (problemJumpInput) {
        problemJumpInput.setAttribute('max', PROBLEMS.length);
    }
}

function updateProblemIndicators() {
    if (problemNumberEl) {
        problemNumberEl.textContent = `第${currentProblemIndex + 1}問`;
    }
    problemMenuButtons.forEach((button, index) => {
        if (!button) return;
        button.classList.toggle('current', index === currentProblemIndex);
    });
    problemMenuSectionMeta.forEach(meta => {
        if (currentProblemIndex >= meta.start && currentProblemIndex < meta.end) {
            meta.sectionEl.classList.remove('collapsed');
            meta.contentEl.classList.remove('collapsed');
        }
    });
}

// イベントリスナー
checkBtn.addEventListener('click', startCheck);
retryBtn.addEventListener('click', retry);
nextBtn.addEventListener('click', () => loadProblem(currentProblemIndex + 1));
ruleModalBtn.addEventListener('click', openRuleModal);
ruleModalClose.addEventListener('click', closeRuleModal);
ruleModal.addEventListener('click', (event) => {
    if (event.target === ruleModal) {
        closeRuleModal();
    }
});
problemMenuToggle.addEventListener('click', openProblemMenu);
problemMenuClose.addEventListener('click', closeProblemMenu);
problemMenu.addEventListener('click', (event) => {
    if (event.target === problemMenu) {
        closeProblemMenu();
    }
});
if (problemJumpBtn) {
    problemJumpBtn.addEventListener('click', handleProblemJump);
}
if (problemRandomBtn) {
    problemRandomBtn.addEventListener('click', jumpToRandomProblem);
}
if (problemJumpInput) {
    problemJumpInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleProblemJump();
        }
    });
    problemJumpInput.addEventListener('input', () => {
        problemJumpInput.classList.remove('invalid');
    });
}
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    let closedAny = false;
    if (ruleModal.classList.contains('show')) {
        closeRuleModal();
        closedAny = true;
    }
    if (problemMenu.classList.contains('show')) {
        closeProblemMenu();
        closedAny = true;
    }
    if (closedAny) {
        event.preventDefault();
    }
});

// 開始
populateProblemMenu();
loadProblem(0);

