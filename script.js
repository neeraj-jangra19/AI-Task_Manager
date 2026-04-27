const API = "https://ai-task-manager-backend-uacc.onrender.com";

let videoStream = null;
let currentSuggestion = null;
let selectedDiff = "medium";
let autoInterval = null;

async function startCamera() {
    const video = document.getElementById("cameraFeed");
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: "user" }
        });
        video.srcObject = videoStream;
        await video.play();
        setStatus("online", "Camera active");
        return true;
    } catch (err) {
        console.error("Camera error:", err);
        document.getElementById("cameraError").style.display = "flex";
        setStatus("offline", "Camera denied");
        return false;
    }
}

function captureFrame() {
    const video = document.getElementById("cameraFeed");
    const canvas = document.getElementById("snapCanvas");
    if (!videoStream || video.readyState < 2) return null;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.75);
}

async function analyzeNow() {
    const btn = document.getElementById("analyzeBtn");
    btn.classList.add("loading");
    btn.innerHTML = '<span class="btn-icon">◉</span> Analyzing...';

    const imageData = captureFrame();
    if (!imageData) {
        updateState("unknown", "Camera not ready", {});
        btn.classList.remove("loading");
        btn.innerHTML = '<span class="btn-icon">◉</span> Analyze Now';
        return;
    }

    try {
        const res = await fetch(`${API}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageData })
        });
        const data = await res.json();

        updateState(data.state, data.details?.reason || "", data.details || {});
        updateSuggestion(data.suggestion, data.state, data.message);
        currentSuggestion = data.suggestion;

    } catch (err) {
        console.error("Analyze error:", err);
        setStatus("offline", "Backend not running");
        updateState("unknown", "Cannot reach backend", {});
    }

    btn.classList.remove("loading");
    btn.innerHTML = '<span class="btn-icon">◉</span> Analyze Now';
}

function updateState(state, reason, details) {
    const stateEl  = document.getElementById("stateValue");
    const reasonEl = document.getElementById("stateReason");
    const card     = document.getElementById("stateCard");

    stateEl.textContent = state || "—";
    stateEl.className   = "state-value " + (state || "");
    reasonEl.textContent = reason || "—";

    // Metrics
    document.getElementById("metricEar").textContent =
        details.ear  != null ? details.ear  : "—";
    document.getElementById("metricYaw").textContent =
        details.yaw  != null ? details.yaw  : "—";
    document.getElementById("metricFace").textContent =
        details.face_detected != null
            ? (details.face_detected ? "YES" : "NO") : "—";
}

function updateSuggestion(suggestion, state, message) {
    const empty   = document.getElementById("suggestionEmpty");
    const content = document.getElementById("suggestionContent");
    const card    = document.getElementById("suggestionCard");

    card.className = "suggestion-card " + (state || "");

    if (!suggestion) {
        empty.style.display   = "block";
        content.style.display = "none";
        empty.textContent = message || "No suggestion available.";
        return;
    }

    empty.style.display   = "none";
    content.style.display = "block";

    const diffEl = document.getElementById("suggestionDiff");
    diffEl.textContent = suggestion.difficulty?.toUpperCase() + " TASK";
    diffEl.className   = "suggestion-diff " + (suggestion.difficulty || "");

    document.getElementById("suggestionTask").textContent   = suggestion.task;
    document.getElementById("suggestionReason").textContent = suggestion.reason || "";
    document.getElementById("doneBtn").dataset.id = suggestion.id;
}

function setStatus(type, text) {
    document.getElementById("statusDot").className  = "status-dot " + type;
    document.getElementById("statusText").textContent = text;
}

function selectDiff(diff) {
    selectedDiff = diff;
    document.querySelectorAll(".diff-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.diff === diff);
    });
}

async function loadTasks() {
    try {
        const res   = await fetch(`${API}/tasks`);
        const tasks = await res.json();
        renderTasks(tasks);
    } catch (err) {
        console.error("Load tasks error:", err);
    }
}

function renderTasks(tasks) {
    const list = document.getElementById("taskList");
    list.innerHTML = "";

    if (!tasks.length) {
        list.innerHTML = `<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px">
            No tasks yet. Add your first task above.
        </div>`;
        return;
    }

    const sorted = [...tasks].sort((a, b) => a.done - b.done);

    sorted.forEach(t => {
        const div = document.createElement("div");
        div.className = "task-item" + (t.done ? " done" : "");
        div.innerHTML = `
            <div class="task-diff-dot ${t.difficulty}"></div>
            <span class="task-name">${t.task}</span>
            <span class="task-diff-label">${t.difficulty}</span>
            <button class="task-del" onclick="deleteTask(${t.id})" title="Delete">×</button>
        `;
        list.appendChild(div);
    });
}

async function addTask() {
    const input = document.getElementById("taskInput");
    const name  = input.value.trim();
    if (!name) { input.focus(); return; }

    await fetch(`${API}/add_task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: name, difficulty: selectedDiff })
    });

    input.value = "";
    await loadTasks();
}

async function deleteTask(id) {
    await fetch(`${API}/delete_task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
    });
    await loadTasks();
}

async function markDone() {
    const id = parseInt(document.getElementById("doneBtn").dataset.id);
    if (!id) return;

    await fetch(`${API}/complete_task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
    });

    await loadTasks();
    updateSuggestion(null, "", "Task completed! Great job. Analyzing next...");

    setTimeout(analyzeNow, 800);
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("taskInput").addEventListener("keydown", e => {
        if (e.key === "Enter") addTask();
    });
});

window.addEventListener("load", async () => {
    setStatus("", "Starting...");
    const camOk = await startCamera();
    await loadTasks();

    if (camOk) {
        // First analysis after camera warms up
        setTimeout(analyzeNow, 1500);
        // Then every 12 seconds
        autoInterval = setInterval(analyzeNow, 12000);
    }
});
