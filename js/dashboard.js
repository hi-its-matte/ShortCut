import {
    auth,
    db,
    onAuthStateChanged,
    collection,
    addDoc,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    setDoc,
    serverTimestamp,
    updateDoc
} from "./firebase.js";
import "./auth.js";

const shortcutForm = document.getElementById("shortcut-form");
const dashboardBoard = document.getElementById("dashboard-board");
const shortcutsLayer = document.getElementById("shortcuts-layer");
const widgetsLayer = document.getElementById("widgets-layer");
const dashboardMessage = document.getElementById("dashboard-message");
const settingsToggle = document.getElementById("settings-toggle");
const modeIndicator = document.getElementById("mode-indicator");
const libraryButtons = document.querySelectorAll("[data-template-id]");
const focusToggle = document.getElementById("focus-toggle");
const boardFullscreenButton = document.getElementById("board-fullscreen-btn");
const accountToggle = document.getElementById("account-toggle");
const accountMenu = document.getElementById("account-menu");
const accountName = document.getElementById("account-name");
const accountAvatar = document.getElementById("account-avatar");
const accountAvatarFallback = document.getElementById("account-avatar-fallback");

const state = {
    user: null,
    editMode: false,
    focusMode: false,
    drag: null,
    shortcuts: [],
    widgets: [],
    weatherPromise: null,
    weatherData: null,
    batteryListener: null,
    noteTimers: new Map(),
    clockIntervals: new Map(),
    shortcutsUnsubscribe: null,
    widgetsUnsubscribe: null
};

const widgetTemplates = {
    "clock-small": {
        type: "clock",
        variant: "small",
        title: "Orologio piccolo"
    },
    "clock-large": {
        type: "clock",
        variant: "large",
        title: "Orologio grande"
    },
    "clock-analog": {
        type: "clock-analog",
        variant: "analog",
        title: "Orologio analogico"
    },
    "weather-small": {
        type: "weather",
        variant: "small",
        title: "Meteo piccolo"
    },
    "weather-large": {
        type: "weather",
        variant: "large",
        title: "Meteo grande"
    },
    "calendar-small": {
        type: "calendar",
        variant: "small",
        title: "Calendario piccolo"
    },
    "calendar-large": {
        type: "calendar",
        variant: "large",
        title: "Calendario grande"
    },
    "battery-device": {
        type: "battery",
        variant: "device",
        title: "Batteria dispositivo"
    },
    "notes-small": {
        type: "notes",
        variant: "small",
        title: "Note piccolo",
        content: "Scrivi qui i tuoi appunti veloci..."
    },
    "notes-large": {
        type: "notes",
        variant: "large",
        title: "Note grande",
        content: "Scrivi qui i tuoi appunti veloci..."
    }
};

const shortcutTemplates = {
    "shortcut-basic": {
        title: "Nuovo link",
        url: "https://example.com",
        icon: "L"
    }
};

settingsToggle?.addEventListener("click", () => {
    state.editMode = !state.editMode;
    document.body.classList.toggle("settings-mode", state.editMode);
    modeIndicator.textContent = state.editMode ? "Modalita' impostazioni attiva" : "Modalita' normale";
    settingsToggle.textContent = state.editMode ? "Fine" : "Impostazioni";
    renderShortcuts();
    renderWidgets();
});

focusToggle?.addEventListener("click", async () => {
    await toggleBoardFullscreen();
});

boardFullscreenButton?.addEventListener("click", async () => {
    await toggleBoardFullscreen();
});

async function toggleBoardFullscreen() {
    state.focusMode = !state.focusMode;
    document.body.classList.toggle("focus-mode", state.focusMode);
    const nextLabel = state.focusMode ? "Esci schermo intero" : "Schermo intero";
    if (focusToggle) {
        focusToggle.textContent = nextLabel;
    }
    if (boardFullscreenButton) {
        boardFullscreenButton.textContent = nextLabel;
    }

    if (state.focusMode) {
        await enterFullscreen(dashboardBoard);
    } else {
        await exitFullscreen();
    }
}

accountToggle?.addEventListener("click", () => {
    const isOpen = !accountMenu.hidden;
    accountMenu.hidden = isOpen;
    accountToggle.setAttribute("aria-expanded", String(!isOpen));
});

document.addEventListener("click", (event) => {
    if (!event.target.closest(".account-menu-wrap")) {
        accountMenu.hidden = true;
        accountToggle?.setAttribute("aria-expanded", "false");
    }
});

shortcutForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.user) {
        setMessage("Effettua prima il login.", true);
        return;
    }

    const title = shortcutForm.title.value.trim();
    const url = normalizeUrl(shortcutForm.url.value.trim());
    const icon = shortcutForm.icon.value.trim();
    const position = getNextShortcutPosition(state.shortcuts.length);

    try {
        await addDoc(collection(db, "users", state.user.uid, "shortcuts"), {
            title,
            url,
            icon,
            x: position.x,
            y: position.y,
            createdAt: serverTimestamp()
        });

        shortcutForm.reset();
        setMessage("Shortcut salvato su Firestore.");
    } catch (error) {
        console.error("Errore creazione shortcut:", error);
        setMessage("Impossibile salvare lo shortcut su Firestore.", true);
    }
});

libraryButtons.forEach((button) => {
    button.addEventListener("click", async () => {
        if (!state.user) {
            setMessage("Effettua prima il login.", true);
            return;
        }

        const templateId = button.dataset.templateId;
        const addKind = button.dataset.addKind;

        try {
            if (addKind === "widget") {
                const template = widgetTemplates[templateId];
                if (!template) {
                    return;
                }

                const position = getNextWidgetPosition(state.widgets.length);

                await addDoc(collection(db, "users", state.user.uid, "widgets"), {
                    ...template,
                    x: position.x,
                    y: position.y,
                    createdAt: serverTimestamp()
                });

                setMessage(`${template.title} aggiunto alla dashboard.`);
                return;
            }

            if (addKind === "shortcut") {
                const template = shortcutTemplates[templateId];
                if (!template) {
                    return;
                }

                const position = getNextShortcutPosition(state.shortcuts.length);

                await addDoc(collection(db, "users", state.user.uid, "shortcuts"), {
                    ...template,
                    x: position.x,
                    y: position.y,
                    createdAt: serverTimestamp()
                });

                setMessage(`${template.title} aggiunto alla dashboard.`);
            }
        } catch (error) {
            console.error("Errore aggiunta elemento:", error);
            setMessage("Impossibile aggiungere l'elemento.", true);
        }
    });
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        cleanupRealtimeListeners();
        return;
    }

    state.user = user;

    try {
        await loadUserProfile(user);
        await ensureDefaultWidgets(user.uid);
        subscribeToShortcuts(user.uid);
        subscribeToWidgets(user.uid);
    } catch (error) {
        console.error("Errore inizializzazione dashboard:", error);
        setMessage("Errore nel caricamento della dashboard.", true);
    }
});

window.addEventListener("pointermove", (event) => {
    if (!state.drag) {
        return;
    }

    const bounds = getBoardBounds();
    const nextX = clamp(state.drag.originX + (event.clientX - state.drag.startX), 0, bounds.maxX);
    const nextY = clamp(state.drag.originY + (event.clientY - state.drag.startY), 0, bounds.maxY);

    state.drag.currentX = nextX;
    state.drag.currentY = nextY;
    applyPosition(state.drag.element, nextX, nextY);
});

window.addEventListener("pointerup", async () => {
    if (!state.drag || !state.user) {
        return;
    }

    const { collectionName, itemId, currentX, currentY, element } = state.drag;
    element.classList.remove("dragging");

    try {
        await updateDoc(doc(db, "users", state.user.uid, collectionName, itemId), {
            x: Math.round(currentX),
            y: Math.round(currentY)
        });
    } catch (error) {
        console.error("Errore salvataggio posizione:", error);
        setMessage("Posizione non salvata.", true);
    }

    state.drag = null;
});

function subscribeToShortcuts(userId) {
    state.shortcutsUnsubscribe?.();

    const shortcutsQuery = query(
        collection(db, "users", userId, "shortcuts"),
        orderBy("createdAt", "asc")
    );

    state.shortcutsUnsubscribe = onSnapshot(shortcutsQuery, (snapshot) => {
        state.shortcuts = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
        }));

        renderShortcuts();
    }, (error) => {
        console.error("Errore lettura shortcuts:", error);
        setMessage("Impossibile caricare gli shortcut.", true);
    });
}

function subscribeToWidgets(userId) {
    state.widgetsUnsubscribe?.();

    const widgetsQuery = query(
        collection(db, "users", userId, "widgets"),
        orderBy("createdAt", "asc")
    );

    state.widgetsUnsubscribe = onSnapshot(widgetsQuery, (snapshot) => {
        clearClockIntervals();

        state.widgets = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
        }));

        renderWidgets();
    }, (error) => {
        console.error("Errore lettura widgets:", error);
        setMessage("Impossibile caricare i widget.", true);
    });
}

async function ensureDefaultWidgets(userId) {
    const userRef = doc(db, "users", userId);
    const userSnapshot = await getDoc(userRef);
    const userData = userSnapshot.exists() ? userSnapshot.data() : {};

    if (userData.widgetsInitialized) {
        return;
    }

    const widgetsCollection = collection(db, "users", userId, "widgets");

    const defaults = [
        { ...widgetTemplates["clock-small"], x: 30, y: 30, createdAt: serverTimestamp() },
        { ...widgetTemplates["weather-small"], x: 320, y: 30, createdAt: serverTimestamp() },
        { ...widgetTemplates["notes-large"], x: 30, y: 250, createdAt: serverTimestamp() }
    ];

    await Promise.all(defaults.map((widget) => addDoc(widgetsCollection, widget)));
    await setDoc(userRef, { widgetsInitialized: true }, { merge: true });
}

async function loadUserProfile(user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const profile = userDoc.exists() ? userDoc.data() : {};
    const username = profile.username?.trim() || user.email?.split("@")[0] || "MatteDev";
    const pfp = profile.pfp?.trim() || "";

    accountName.textContent = username;
    accountAvatar.alt = `Profilo di ${username}`;
    accountAvatarFallback.textContent = getFallbackIcon(username);

    if (pfp) {
        accountAvatar.src = pfp;
        accountAvatar.style.display = "block";
    } else {
        accountAvatar.removeAttribute("src");
        accountAvatar.style.display = "none";
    }
}

function renderShortcuts() {
    shortcutsLayer.innerHTML = "";

    if (!state.shortcuts.length) {
        return;
    }

    state.shortcuts.forEach((shortcut) => {
        const item = document.createElement("article");
        item.className = "board-item shortcut-card";
        item.dataset.id = shortcut.id;
        item.dataset.collection = "shortcuts";
        item.setAttribute("role", "button");
        item.tabIndex = 0;
        applyPosition(item, shortcut.x ?? 24, shortcut.y ?? 24);

        const icon = document.createElement("div");
        icon.className = "shortcut-card__icon";
        renderShortcutIcon(icon, shortcut);

        const title = document.createElement("h3");
        title.className = "shortcut-card__title";
        title.textContent = shortcut.title;

        const hint = document.createElement("p");
        hint.className = "shortcut-card__hint";
        hint.textContent = state.editMode ? "Trascina per spostare" : "Apri link";

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "item-action";
        removeButton.textContent = "X";
        removeButton.setAttribute("aria-label", `Elimina ${shortcut.title}`);

        removeButton.addEventListener("click", async (event) => {
            event.stopPropagation();

            try {
                await deleteDoc(doc(db, "users", state.user.uid, "shortcuts", shortcut.id));
                setMessage("Shortcut eliminato.");
            } catch (error) {
                console.error("Errore eliminazione shortcut:", error);
                setMessage("Impossibile eliminare lo shortcut.", true);
            }
        });

        item.addEventListener("click", () => {
            if (state.editMode) {
                return;
            }

            window.open(normalizeUrl(shortcut.url), "_blank", "noopener,noreferrer");
        });

        item.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !state.editMode) {
                window.open(normalizeUrl(shortcut.url), "_blank", "noopener,noreferrer");
            }
        });

        item.addEventListener("pointerdown", (event) => {
            if (!state.editMode || event.target.closest("button")) {
                return;
            }

            startDrag(event, item, "shortcuts", shortcut.id, shortcut.x ?? 24, shortcut.y ?? 24);
        });

        item.append(icon, title, hint, removeButton);
        shortcutsLayer.appendChild(item);
    });
}

function renderWidgets() {
    widgetsLayer.innerHTML = "";

    state.widgets.forEach((widget) => {
        const item = document.createElement("section");
        item.className = `board-item widget widget--${widget.type} widget--${widget.type}-${widget.variant ?? "default"}`;
        item.dataset.id = widget.id;
        item.dataset.collection = "widgets";
        applyPosition(item, widget.x ?? 30, widget.y ?? 30);

        const header = document.createElement("div");
        header.className = "widget__header";

        const heading = document.createElement("div");
        const title = document.createElement("h3");
        title.className = "widget__title";
        title.textContent = widget.title;

        const type = document.createElement("p");
        type.className = "widget__type";
        type.textContent = widget.type;

        heading.append(title, type);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "item-action";
        deleteButton.textContent = "X";
        deleteButton.setAttribute("aria-label", `Elimina widget ${widget.title}`);
        deleteButton.dataset.noDrag = "true";

        const actions = document.createElement("div");
        actions.className = "widget__actions";
        actions.append(deleteButton);

        header.append(heading, actions);
        item.appendChild(header);

        const content = document.createElement("div");
        content.className = "widget__content";
        renderWidgetContent(widget, content);
        item.appendChild(content);

        item.addEventListener("pointerdown", (event) => {
            if (!state.editMode) {
                return;
            }

            if (event.target.closest("[data-no-drag='true']")) {
                return;
            }

            if (event.target.closest("textarea, input, a, button")) {
                return;
            }

            startDrag(event, item, "widgets", widget.id, widget.x ?? 30, widget.y ?? 30);
        });

        deleteButton.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();

            try {
                await deleteDoc(doc(db, "users", state.user.uid, "widgets", widget.id));
                setMessage(`Widget ${widget.title} eliminato.`);
            } catch (error) {
                console.error("Errore eliminazione widget:", error);
                setMessage("Impossibile eliminare il widget.", true);
            }
        });

        widgetsLayer.appendChild(item);
    });
}

function renderWidgetContent(widget, container) {
    if (widget.type === "clock") {
        const time = document.createElement("div");
        time.className = "clock-time";

        const date = document.createElement("div");
        date.className = "clock-date";

        if (widget.variant === "large") {
            time.classList.add("clock-time--large");
        }

        container.append(time, date);
        mountClock(widget.id, time, date);
        return;
    }

    if (widget.type === "clock-analog") {
        const analog = document.createElement("div");
        analog.className = "analog-clock";

        const hourHand = document.createElement("span");
        hourHand.className = "analog-clock__hand analog-clock__hand--hour";

        const minuteHand = document.createElement("span");
        minuteHand.className = "analog-clock__hand analog-clock__hand--minute";

        const center = document.createElement("span");
        center.className = "analog-clock__center";

        analog.append(hourHand, minuteHand, center);
        container.appendChild(analog);
        mountAnalogClock(widget.id, hourHand, minuteHand);
        return;
    }

    if (widget.type === "weather") {
        const temperature = document.createElement("div");
        temperature.className = "weather-temp";
        temperature.textContent = "--";

        const meta = document.createElement("div");
        meta.className = "weather-meta";
        meta.innerHTML = widget.variant === "large"
            ? "<span>Caricamento meteo...</span><span>Posizione attuale</span><span>Aggiornamento live</span>"
            : "<span>Caricamento meteo...</span><span>Posizione attuale</span>";

        if (widget.variant === "large") {
            temperature.classList.add("weather-temp--large");
        }

        container.append(temperature, meta);
        loadWeather(temperature, meta);
        return;
    }

    if (widget.type === "calendar") {
        if (widget.variant === "large") {
            const monthTitle = document.createElement("div");
            monthTitle.className = "calendar-month-title";

            const weekdays = document.createElement("div");
            weekdays.className = "calendar-weekdays";
            weekdays.innerHTML = "<span>L</span><span>M</span><span>M</span><span>G</span><span>V</span><span>S</span><span>D</span>";

            const grid = document.createElement("div");
            grid.className = "calendar-grid";

            container.append(monthTitle, weekdays, grid);
            renderLargeCalendar(monthTitle, grid);
            return;
        }

        const day = document.createElement("div");
        day.className = "calendar-day-big";

        const meta = document.createElement("div");
        meta.className = "calendar-day-meta";

        container.append(day, meta);
        renderSmallCalendar(day, meta);
        return;
    }

    if (widget.type === "battery") {
        const wrap = document.createElement("div");
        wrap.className = "battery-widget";

        const icon = document.createElement("div");
        icon.className = "battery-icon";
        icon.innerHTML = '<span class="battery-icon__body"><span class="battery-icon__fill"></span></span><span class="battery-icon__cap"></span>';

        const value = document.createElement("div");
        value.className = "battery-value";
        value.textContent = "--%";

        const status = document.createElement("div");
        status.className = "battery-status";
        status.textContent = "Rilevamento batteria...";

        wrap.append(icon, value, status);
        container.appendChild(wrap);
        mountBatteryWidget(icon.querySelector(".battery-icon__fill"), value, status);
        return;
    }

    if (widget.type === "notes") {
        const notesArea = document.createElement("textarea");
        notesArea.className = "notes-area";
        notesArea.placeholder = "Scrivi una nota...";
        notesArea.value = widget.content ?? "";

        if (widget.variant === "small") {
            notesArea.classList.add("notes-area--small");
        }

        notesArea.addEventListener("input", () => {
            clearTimeout(state.noteTimers.get(widget.id));

            const timer = window.setTimeout(async () => {
                try {
                    await updateDoc(doc(db, "users", state.user.uid, "widgets", widget.id), {
                        content: notesArea.value
                    });
                } catch (error) {
                    console.error("Errore salvataggio note:", error);
                    setMessage("Impossibile salvare la nota.", true);
                }
            }, 500);

            state.noteTimers.set(widget.id, timer);
        });

        container.appendChild(notesArea);
    }
}

function renderShortcutIcon(container, shortcut) {
    if (isImageUrl(shortcut.icon)) {
        const image = document.createElement("img");
        image.src = shortcut.icon;
        image.alt = shortcut.title;
        image.addEventListener("error", () => {
            container.textContent = getFallbackIcon(shortcut.title);
        }, { once: true });
        container.appendChild(image);
        return;
    }

    container.textContent = shortcut.icon || getFallbackIcon(shortcut.title);
}

function startDrag(event, element, collectionName, itemId, originX, originY) {
    event.preventDefault();
    event.stopPropagation();

    state.drag = {
        element,
        collectionName,
        itemId,
        originX,
        originY,
        currentX: originX,
        currentY: originY,
        startX: event.clientX,
        startY: event.clientY
    };

    element.classList.add("dragging");
}

function applyPosition(element, x, y) {
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
}

function getBoardBounds() {
    const boardRect = dashboardBoard.getBoundingClientRect();
    const width = state.drag?.element.offsetWidth ?? 0;
    const height = state.drag?.element.offsetHeight ?? 0;

    return {
        maxX: Math.max(0, boardRect.width - width - 12),
        maxY: Math.max(0, boardRect.height - height - 12)
    };
}

function getNextShortcutPosition(count) {
    const spacing = 164;
    const columns = window.innerWidth < 900 ? 2 : 4;

    return {
        x: 24 + (count % columns) * spacing,
        y: 24 + Math.floor(count / columns) * spacing
    };
}

function getNextWidgetPosition(count) {
    const spacingX = 290;
    const spacingY = 210;
    const columns = window.innerWidth < 900 ? 1 : 2;

    return {
        x: 24 + (count % columns) * spacingX,
        y: 24 + Math.floor(count / columns) * spacingY
    };
}

function normalizeUrl(url) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }

    return `https://${url}`;
}

function isImageUrl(value) {
    return /^https?:\/\//i.test(value);
}

function getFallbackIcon(title) {
    return title?.trim()?.charAt(0)?.toUpperCase() || "*";
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function setMessage(message, isError = false) {
    dashboardMessage.textContent = message;
    dashboardMessage.style.color = isError ? "#ff8f8f" : "#7cf2c7";
}

function createEmptyState(message) {
    const element = document.createElement("div");
    element.className = "empty-state";
    element.textContent = message;
    return element;
}

function mountClock(widgetId, timeElement, dateElement) {
    const formatterTime = new Intl.DateTimeFormat("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    const formatterDate = new Intl.DateTimeFormat("it-IT", {
        weekday: "long",
        day: "2-digit",
        month: "long"
    });

    const render = () => {
        const now = new Date();
        timeElement.textContent = formatterTime.format(now);
        dateElement.textContent = formatterDate.format(now);
    };

    render();
    const intervalId = window.setInterval(render, 1000);
    state.clockIntervals.set(widgetId, intervalId);
}

function renderSmallCalendar(dayElement, metaElement) {
    const now = new Date();
    dayElement.textContent = String(now.getDate()).padStart(2, "0");
    metaElement.textContent = new Intl.DateTimeFormat("it-IT", {
        month: "short",
        year: "numeric"
    }).format(now);
}

function renderLargeCalendar(titleElement, gridElement) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;

    titleElement.textContent = new Intl.DateTimeFormat("it-IT", {
        month: "long",
        year: "numeric"
    }).format(now);

    gridElement.innerHTML = "";

    for (let i = 0; i < startOffset; i += 1) {
        const empty = document.createElement("span");
        empty.className = "calendar-grid__empty";
        gridElement.appendChild(empty);
    }

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
        const cell = document.createElement("span");
        cell.className = "calendar-grid__day";
        if (day === today) {
            cell.classList.add("is-today");
        }
        cell.textContent = day;
        gridElement.appendChild(cell);
    }
}

async function mountBatteryWidget(fillElement, valueElement, statusElement) {
    if (!navigator.getBattery) {
        statusElement.textContent = "Batteria non supportata";
        return;
    }

    try {
        const battery = await navigator.getBattery();

        const render = () => {
            const level = Math.round(battery.level * 100);
            fillElement.style.width = `${Math.max(level, 8)}%`;
            valueElement.textContent = `${level}%`;
            statusElement.textContent = battery.charging ? "In carica" : "In uso";
        };

        render();

        if (!state.batteryListener) {
            state.batteryListener = render;
        }

        battery.addEventListener("levelchange", render);
        battery.addEventListener("chargingchange", render);
    } catch (error) {
        statusElement.textContent = "Batteria non disponibile";
    }
}

function mountAnalogClock(widgetId, hourHand, minuteHand) {
    const render = () => {
        const now = new Date();
        const hours = now.getHours() % 12;
        const minutes = now.getMinutes();
        const hourDegrees = hours * 30 + minutes * 0.5;
        const minuteDegrees = minutes * 6;

        hourHand.style.transform = `translateX(-50%) rotate(${hourDegrees}deg)`;
        minuteHand.style.transform = `translateX(-50%) rotate(${minuteDegrees}deg)`;
    };

    render();
    const intervalId = window.setInterval(render, 1000);
    state.clockIntervals.set(widgetId, intervalId);
}

function clearClockIntervals() {
    state.clockIntervals.forEach((intervalId) => window.clearInterval(intervalId));
    state.clockIntervals.clear();
}

async function loadWeather(temperatureElement, metaElement) {
    try {
        const weather = await getWeatherData();
        temperatureElement.textContent = `${Math.round(weather.temperature)} deg`;
        metaElement.innerHTML = `<span>${weather.description}</span><span>${weather.location}</span>`;
    } catch (error) {
        temperatureElement.textContent = "--";
        metaElement.innerHTML = "<span>Meteo non disponibile</span><span>Controlla geolocalizzazione</span>";
    }
}

async function getWeatherData() {
    if (state.weatherData) {
        return state.weatherData;
    }

    if (!state.weatherPromise) {
        state.weatherPromise = new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocalizzazione non supportata"));
                return;
            }

            navigator.geolocation.getCurrentPosition(async (position) => {
                try {
                    const latitude = position.coords.latitude;
                    const longitude = position.coords.longitude;
                    const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
                    const response = await fetch(endpoint);
                    const data = await response.json();
                    const result = {
                        temperature: data.current.temperature_2m,
                        description: describeWeatherCode(data.current.weather_code),
                        location: "Posizione attuale"
                    };

                    state.weatherData = result;
                    resolve(result);
                } catch (error) {
                    state.weatherPromise = null;
                    reject(error);
                }
            }, (error) => {
                state.weatherPromise = null;
                reject(error);
            }, {
                enableHighAccuracy: false,
                timeout: 5000
            });
        });
    }

    return state.weatherPromise;
}

function describeWeatherCode(code) {
    const map = {
        0: "Cielo sereno",
        1: "Quasi sereno",
        2: "Parzialmente nuvoloso",
        3: "Coperto",
        45: "Nebbia",
        48: "Nebbia intensa",
        51: "Pioviggine leggera",
        61: "Pioggia leggera",
        63: "Pioggia moderata",
        71: "Neve leggera",
        80: "Rovesci",
        95: "Temporale"
    };

    return map[code] || "Meteo aggiornato";
}

function cleanupRealtimeListeners() {
    state.shortcutsUnsubscribe?.();
    state.widgetsUnsubscribe?.();
    clearClockIntervals();
    state.noteTimers.forEach((timerId) => window.clearTimeout(timerId));
    state.noteTimers.clear();
    state.shortcutsUnsubscribe = null;
    state.widgetsUnsubscribe = null;
    state.shortcuts = [];
    state.widgets = [];
}

async function enterFullscreen(element) {
    if (!document.fullscreenElement && element?.requestFullscreen) {
        try {
            await element.requestFullscreen();
        } catch (error) {
            console.debug("Fullscreen non disponibile:", error);
        }
    }
}

async function exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
        try {
            await document.exitFullscreen();
        } catch (error) {
            console.debug("Uscita fullscreen non disponibile:", error);
        }
    }
}

document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && state.focusMode) {
        state.focusMode = false;
        document.body.classList.remove("focus-mode");
        if (focusToggle) {
            focusToggle.textContent = "Schermo intero";
        }
        if (boardFullscreenButton) {
            boardFullscreenButton.textContent = "Schermo intero";
        }
    }
});
