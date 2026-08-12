const MAX_ATTEMPTS = 5;
const INITIAL_ZOOM = 4.0;
const ZOOM_STEP = 0.6;
const YEAR_MATCH_RANGE = 2;
const EPOCH_MS = Date.UTC(2026, 0, 1);

const state = {
    dataset: [],
    answerMake: '',
    answerModel: '',
    answerYear: 0,
    attemptCount: 0,
    imageZoom: INITIAL_ZOOM,
    lockedMake: false,
    lockedModel: false,
    lockedYear: false,
    guessHistory: []
};

const el = {
    carImage: document.getElementById('carImage'),
    makeSelect: document.getElementById('makeSelect'),
    modelSelect: document.getElementById('modelSelect'),
    yearInput: document.getElementById('yearInput'),
    submitBtn: document.getElementById('submitBtn'),
    historyGrid: document.getElementById('historyGrid'),
    messageBox: document.getElementById('messageBox'),
    messageText: document.getElementById('messageText'),
    answerReveal: document.getElementById('answerReveal')
};

function populateMakes() {
    const allMakes = [...new Set(state.dataset.map(v => v.make))].sort();
    el.makeSelect.innerHTML = '<option value="">-- Make --</option>';
    allMakes.forEach(make => el.makeSelect.appendChild(new Option(make, make)));
}

function populateModels(make) {
    el.modelSelect.innerHTML = '<option value="">-- Model --</option>';
    if (!make) {
        el.modelSelect.disabled = true;
        return;
    }
    el.modelSelect.disabled = false;
    const models = [...new Set(state.dataset.filter(v => v.make === make).map(v => v.model))].sort();
    models.forEach(model => el.modelSelect.appendChild(new Option(model, model)));
}

function createTile(value, status) {
    const tile = document.createElement('div');
    tile.className = `history-tile ${status ? 'status-' + status : ''}`;
    tile.textContent = value;
    return tile;
}

function renderHistoryGrid() {
    el.historyGrid.innerHTML = '';
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const guess = state.guessHistory[i];
        const row = document.createElement('div');
        row.className = 'history-row';
        row.appendChild(createTile(guess ? guess.make : '', guess ? guess.makeState : ''));
        row.appendChild(createTile(guess ? guess.model : '', guess ? guess.modelState : ''));
        row.appendChild(createTile(guess ? guess.year : '', guess ? guess.yearState : ''));
        el.historyGrid.appendChild(row);
    }
}

function evaluateExactField(locked, guessed, answer, selectEl) {
    if (locked) return 'green';
    if (guessed === answer) {
        selectEl.disabled = true;
        return 'green';
    }
    selectEl.value = '';
    return 'red';
}

function evaluateYear(locked, guessed, answer) {
    if (locked) return 'green';
    const diff = Math.abs(guessed - answer);
    if (diff <= YEAR_MATCH_RANGE) {
        el.yearInput.disabled = true;
        return 'green';
    }
    const sameDecade = Math.floor(guessed / 10) === Math.floor(answer / 10);
    el.yearInput.value = '';
    return sameDecade ? 'orange' : 'red';
}

function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seededShuffle(array, seed) {
    const rand = mulberry32(seed);
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function dayIndex() {
    const now = new Date();
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.floor((todayUTC - EPOCH_MS) / 86400000);
}

const shuffleCache = {};

function shuffleForCycle(eligible, cycle) {
    if (shuffleCache[cycle]) return shuffleCache[cycle];

    let shuffled = seededShuffle(eligible, cycle);

    if (cycle > 0) {
        const prevShuffled = shuffleForCycle(eligible, cycle - 1);
        const prevLastId = prevShuffled[prevShuffled.length - 1].id;
        let attempt = 0;
        while (shuffled[0].id === prevLastId && attempt < 20) {
            attempt++;
            shuffled = seededShuffle(eligible, cycle * 1000 + attempt);
        }
    }

    shuffleCache[cycle] = shuffled;
    return shuffled;
}

function pickTodaysCar(dataset) {
    const eligible = dataset
        .filter(v => String(v.status).toLowerCase() === 'done')
        .sort((a, b) => a.id.localeCompare(b.id));

    const n = eligible.length;
    const di = dayIndex();
    const cycle = Math.floor(di / n);
    const posInCycle = di % n;

    return shuffleForCycle(eligible, cycle)[posInCycle];
}

function loadTodaysGame() {
    const dataset = DATASET;
    const today = pickTodaysCar(dataset);

    state.dataset = dataset;
    state.answerMake = today.make;
    state.answerModel = today.model;
    state.answerYear = parseInt(today.year, 10);
    state.attemptCount = 0;
    state.imageZoom = INITIAL_ZOOM;
    state.lockedMake = false;
    state.lockedModel = false;
    state.lockedYear = false;
    state.guessHistory = [];

    populateMakes();
    populateModels('');

    el.carImage.style.transition = 'none';
    el.carImage.style.opacity = '0';
    el.carImage.src = today.image;
    el.carImage.style.transform = `scale(${state.imageZoom})`;

    const revealZoomed = () => {
        void el.carImage.offsetWidth;
        el.carImage.style.transition = '';
        el.carImage.style.opacity = '1';
    };

    if (el.carImage.complete) {
        requestAnimationFrame(revealZoomed);
    } else {
        el.carImage.addEventListener('load', revealZoomed, { once: true });
    }

    el.makeSelect.value = '';
    el.modelSelect.value = '';
    el.yearInput.value = '';
    el.makeSelect.disabled = false;
    el.yearInput.disabled = false;
    el.submitBtn.disabled = false;

    el.messageBox.classList.remove('visible');
    el.answerReveal.textContent = '';

    renderHistoryGrid();
}

function handleSubmit() {
    if (state.attemptCount >= MAX_ATTEMPTS) return;

    const guessedMake = el.makeSelect.value;
    const guessedModel = el.modelSelect.value;
    const guessedYear = parseInt(el.yearInput.value, 10);

    if (!state.lockedMake && !guessedMake) return alert('Please select a Make.');
    if (!state.lockedModel && !guessedModel) return alert('Please select a Model.');
    if (!state.lockedYear && isNaN(guessedYear)) return alert('Please enter a valid Year.');

    state.attemptCount++;

    const makeState = evaluateExactField(state.lockedMake, guessedMake, state.answerMake, el.makeSelect);
    const modelState = evaluateExactField(state.lockedModel, guessedModel, state.answerModel, el.modelSelect);
    const yearState = evaluateYear(state.lockedYear, guessedYear, state.answerYear);

    if (makeState === 'green') state.lockedMake = true;
    if (modelState === 'green') state.lockedModel = true;
    if (yearState === 'green') state.lockedYear = true;

    state.guessHistory.push({
        make: guessedMake,
        makeState,
        model: guessedModel,
        modelState,
        year: guessedYear,
        yearState
    });

    renderHistoryGrid();

    const won = makeState === 'green' && modelState === 'green' && yearState === 'green';

    if (won || state.attemptCount >= MAX_ATTEMPTS) {
        endGame(won);
    } else {
        state.imageZoom = Math.max(1.0, state.imageZoom - ZOOM_STEP);
        el.carImage.style.transform = `scale(${state.imageZoom})`;
        if (!state.lockedYear) el.yearInput.value = '';
    }
}

function endGame(won) {
    el.makeSelect.disabled = true;
    el.modelSelect.disabled = true;
    el.yearInput.disabled = true;
    el.submitBtn.disabled = true;

    el.carImage.style.transform = 'scale(1.0)';

    el.messageBox.classList.add('visible');
    el.messageText.textContent = won
        ? "Genius! You successfully guessed today's CarWordle!"
        : 'Game Over! Out of attempts.';

    el.answerReveal.textContent = `Answer: ${state.answerMake} ${state.answerModel} (${state.answerYear})`;
}

el.makeSelect.addEventListener('change', () => populateModels(el.makeSelect.value));
el.submitBtn.addEventListener('click', handleSubmit);

if (typeof DATASET !== 'undefined' && DATASET.length > 0) {
    try {
        loadTodaysGame();
    } catch (e) {
        el.messageBox.classList.add('visible');
        el.messageText.textContent = 'Error loading today\'s car.';
    }
} else {
    el.messageBox.classList.add('visible');
    el.messageText.textContent = 'Error loading dataset.js. Ensure the file is in the same directory.';
}
