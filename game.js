// Canvas context for the game world
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// World dimensions and static map layout
const WIDTH = 1000;
const HEIGHT = 620;
const WORLD = { width: 2200, height: 1700 };
const STATIONS = [
  { x: 850, y: 1050, name: "Village" },
  { x: 1830, y: 1330, name: "Depot" },
];
const POTHOLES = [
  { x: 740, y: 350, r: 24 },
  { x: 1510, y: 340, r: 28 },
  { x: 540, y: 910, r: 25 },
  { x: 1280, y: 930, r: 22 },
  { x: 1870, y: 900, r: 26 },
  { x: 980, y: 1325, r: 25 },
  { x: 1680, y: 1330, r: 22 },
  { x: 310, y: 1140, r: 20 },
];
const RIVER = [
  { x: 0, y: 790 },
  { x: 430, y: 750 },
  { x: 800, y: 820 },
  { x: 1160, y: 780 },
  { x: 1540, y: 840 },
  { x: 1900, y: 800 },
  { x: 2200, y: 830 },
];
const WATER_RIPPLES = [
  { x: 180, y: 774, offset: 0.1 },
  { x: 600, y: 780, offset: 1.4 },
  { x: 1030, y: 795, offset: 2.2 },
  { x: 1450, y: 820, offset: 0.8 },
  { x: 1770, y: 817, offset: 2.7 },
  { x: 2070, y: 815, offset: 1.8 },
];
const BRIDGES = [
  { x: 340, y: 758 },
  { x: 850, y: 814 },
  { x: 1370, y: 813 },
  { x: 1870, y: 803 },
];
const ROADS = {
  vertical: [340, 850, 1370, 1870],
  horizontal: [340, 1050, 1330],
};
const HOUSES = [];
const houseColumns = [70, 470, 950, 1470, 1970];
const houseRows = [80, 470, 1170, 1450];

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const x = houseColumns[column];
    const y = houseRows[row];
    if (x < 2050 && y < 1600) {
      HOUSES.push({
        x,
        y,
        w: 88 + ((row + column) % 2) * 12,
        h: 66,
        color: (row + column) % 3,
      });
    }
  }
}

const DELIVERY_POINTS = [6, 8, 16, 18].map((houseIndex, index) => {
  const house = HOUSES[houseIndex];
  return {
    x: house.x + house.w / 2,
    y: house.y + house.h + 14,
    name: `Home ${String(index + 1).padStart(2, "0")}`,
    delivered: false,
  };
});

// Player state and runtime game state
const player = {
  x: 250,
  y: 340,
  angle: 0,
  speed: 0,
  battery: 100,
  packages: 4,
};
const camera = { x: 0, y: 0 };
const keys = new Set();
const justPressed = new Set();
const state = {
  mode: "start",
  distance: 0,
  energyUsed: 0,
  deliveries: 0,
  score: 0,
  elapsed: 0,
  outage: false,
  outageTimer: 30,
  collisionTimer: 0,
  toastTimer: 0,
};
//load-shedding and charging stations
// Load-shedding cycle and score persistence
const loadShedCycle = 42;
const outageLength = 12;
const bestKey = "ecodash-best-score-v1";
let bestScore = readBestScore();
let previousTime = 0;
let audioContext;
let soundEnabled = true;
let wasCharging = false;

// DOM references for HUD, overlay, and controls
const ui = {
  battery: document.getElementById("batteryValue"),
  batteryFill: document.getElementById("batteryFill"),
  distance: document.getElementById("distanceValue"),
  deliveries: document.getElementById("deliveryValue"),
  efficiency: document.getElementById("efficiencyValue"),
  best: document.getElementById("bestValue"),
  mission: document.getElementById("missionText"),
  hint: document.getElementById("interactionHint"),
  chargeStatus: document.getElementById("chargeStatus"),
  loadText: document.getElementById("loadText"),
  loadProgress: document.getElementById("loadProgress"),
  overlay: document.getElementById("gameOverlay"),
  kicker: document.getElementById("overlayKicker"),
  title: document.getElementById("overlayTitle"),
  message: document.getElementById("overlayMessage"),
  finalScore: document.getElementById("finalScore"),
  finalScoreValue: document.getElementById("finalScoreValue"),
  button: document.getElementById("overlayButton"),
  foot: document.getElementById("overlayFoot"),
  toast: document.getElementById("toast"),
  soundButton: document.getElementById("soundButton"),
};
// Audio feedback for deliveries, charging, collisions, and outages
function enableAudio() {
  if (!soundEnabled) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === "suspended") audioContext.resume();
}

function playSound(name) {
  if (!soundEnabled) return;
  enableAudio();
  if (!audioContext) return;

  const patterns = {
    delivery: [
      { frequency: 660, delay: 0, duration: 0.12 },
      { frequency: 880, delay: 0.1, duration: 0.18 },
    ],
    collision: [{ frequency: 145, delay: 0, duration: 0.2, wave: "triangle" }],
    charge: [{ frequency: 520, delay: 0, duration: 0.16 }],
    outage: [{ frequency: 260, delay: 0, duration: 0.3, wave: "triangle" }],
  };
  const now = audioContext.currentTime;
  for (const note of patterns[name] || []) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startAt = now + note.delay;
    const endAt = startAt + note.duration;
    oscillator.type = note.wave || "sine";
    oscillator.frequency.setValueAtTime(note.frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(0.045, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.01);
  }
}

function updateSoundButton() {
  ui.soundButton.textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";
  ui.soundButton.setAttribute("aria-pressed", String(soundEnabled));
  ui.soundButton.setAttribute(
    "aria-label",
    soundEnabled ? "Turn sound off" : "Turn sound on",
  );
}
// Score tracking
function readBestScore() {
  try {
    return Number(localStorage.getItem(bestKey)) || 0;
  } catch {
    return 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem(bestKey, String(bestScore));
  } catch {
    showToast("Score could not be saved on this device");
  }
}
// Distance, collision, and world-interaction
function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (start.x + projection * dx),
    point.y - (start.y + projection * dy),
  );
}

function circleIntersectsRect(circle, rect, radius) {
  const nearestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < radius;
}

function nearRoad(x, y) {
  return (
    ROADS.vertical.some((roadX) => Math.abs(x - roadX) < 108) ||
    ROADS.horizontal.some((roadY) => Math.abs(y - roadY) < 108)
  );
}

function nearBridge(x, y) {
  return BRIDGES.some(
    (bridge) => Math.abs(x - bridge.x) < 80 && Math.abs(y - bridge.y) < 62,
  );
}

function nearbyTarget() {
  const delivery = DELIVERY_POINTS.find(
    (point) => !point.delivered && distanceBetween(player, point) < 76,
  );
  if (delivery) return { kind: "delivery", target: delivery };
  const station = STATIONS.find((point) => distanceBetween(player, point) < 90);
  if (station) return { kind: "station", target: station };
  return null;
}
// Toast notifications and overlay states
function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("visible");
  state.toastTimer = 2.2;
}

function setOverlay(mode) {
  state.mode = mode;
  ui.overlay.classList.remove("hidden");
  ui.foot.hidden = mode !== "start";
  ui.finalScore.hidden = mode !== "gameover";
  if (mode === "start") {
    ui.kicker.hidden = true;
    ui.title.innerHTML = "Make deliveries.";
    ui.message.textContent =
      "Take the electric bakkie across the district. Keep an eye on your battery, dodge obstacles, and deliver parcels to each home.";
    ui.button.querySelector("span").textContent = "Start delivery run";
  } else if (mode === "paused") {
    ui.kicker.hidden = false;
    ui.kicker.textContent = "RUN PAUSED";
    ui.title.innerHTML = "Game Paused.";
    ui.button.querySelector("span").textContent = "Resume";
  } else {
    const complete = state.deliveries === DELIVERY_POINTS.length;
    ui.kicker.hidden = false;
    ui.kicker.textContent = complete ? "ALL PARCELS DELIVERED" : "BATTERY DIED";
    if (complete) {
      ui.title.textContent = "Congratulations!";
      ui.message.textContent = "Every package was delivered successfully.";
    } else {
      ui.title.textContent = "Battery Died";
      ui.message.textContent = `You delivered ${state.deliveries} of ${DELIVERY_POINTS.length} packages over ${state.distance.toFixed(1)} km.`;
    }
    ui.finalScoreValue.textContent = state.score.toLocaleString("en-ZA");
    ui.button.querySelector("span").textContent = "Restart game";
  }
}
// Run lifecycle: start, restart, end, and pause
function startRun() {
  enableAudio();
  if (state.mode === "paused") {
    state.mode = "running";
    ui.overlay.classList.add("hidden");
    previousTime = performance.now();
    return;
  }
  player.x = 250;
  player.y = 340;
  player.angle = 0;
  player.speed = 0;
  player.battery = 100;
  player.packages = DELIVERY_POINTS.length;
  camera.x = 0;
  camera.y = 0;
  DELIVERY_POINTS.forEach((point) => {
    point.delivered = false;
  });
  Object.assign(state, {
    mode: "running",
    distance: 0,
    energyUsed: 0,
    deliveries: 0,
    score: 0,
    elapsed: 0,
    outage: false,
    outageTimer: 30,
    collisionTimer: 0,
  });
  ui.overlay.classList.add("hidden");
  ui.finalScore.hidden = true;
  ui.kicker.hidden = true;
  keys.clear();
  previousTime = performance.now();
  updateHud();
}

function endRun() {
  state.mode = "gameover";
  if (state.score > bestScore) {
    bestScore = state.score;
    saveBestScore();
  }
  updateHud();
  setOverlay("gameover");
}

function togglePause() {
  if (state.mode === "running") setOverlay("paused");
  else if (state.mode === "paused") startRun();
}

function update(dt) {
  state.elapsed += dt;
  state.collisionTimer = Math.max(0, state.collisionTimer - dt);
  const wasOutage = state.outage;
  state.outage = state.elapsed % loadShedCycle >= loadShedCycle - outageLength;
  if (state.outage && !wasOutage) playSound("outage");
  state.outageTimer = state.outage
    ? loadShedCycle - (state.elapsed % loadShedCycle)
    : loadShedCycle - outageLength - (state.elapsed % loadShedCycle);
  if (state.outageTimer < 0) state.outageTimer += loadShedCycle;

  // Keyboard input and vehicle steering logic
  const forward = keys.has("ArrowUp") || keys.has("w") || keys.has("W");
  const reverse = keys.has("ArrowDown") || keys.has("s") || keys.has("S");
  const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
  const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D");
  const steering = Number(right) - Number(left);
  if (forward) player.speed += 310 * dt;
  if (reverse) player.speed -= 245 * dt;
  player.speed *= Math.pow(0.985, dt * 60);
  player.speed = Math.max(-100, Math.min(280, player.speed));
  if (Math.abs(player.speed) > 5)
    player.angle += steering * 2.35 * dt * Math.sign(player.speed);

  const oldX = player.x;
  const oldY = player.y;
  player.x += Math.cos(player.angle) * player.speed * dt;
  player.y += Math.sin(player.angle) * player.speed * dt;
  player.x = Math.max(28, Math.min(WORLD.width - 28, player.x));
  player.y = Math.max(28, Math.min(WORLD.height - 28, player.y));

  // Movement cost, battery drain, and collision checks
  const onRoad = nearRoad(player.x, player.y);
  const movement = distanceBetween(player, { x: oldX, y: oldY });
  state.distance += movement / 1200;
  if (movement > 0.05) {
    const drain = movement * (onRoad ? 0.004 : 0.009) + dt * 0.025;
    player.battery = Math.max(0, player.battery - drain);
    state.energyUsed += drain;
  }

  let hit = false;
  for (const house of HOUSES) {
    if (
      circleIntersectsRect(
        player,
        { x: house.x - 10, y: house.y - 38, w: house.w + 20, h: house.h + 38 },
        18,
      )
    ) {
      hit = true;
      break;
    }
  }
  for (const pothole of POTHOLES) {
    if (distanceBetween(player, pothole) < pothole.r + 17) {
      hit = true;
      break;
    }
  }
  for (let index = 0; index < RIVER.length - 1 && !hit; index += 1) {
    if (
      distanceToSegment(player, RIVER[index], RIVER[index + 1]) < 44 &&
      !nearBridge(player.x, player.y)
    )
      hit = true;
  }
  if (hit) {
    player.x = oldX;
    player.y = oldY;
    player.speed = 0;
    if (state.collisionTimer === 0) {
      player.battery = Math.max(0, player.battery - 1.4);
      state.energyUsed += 1.4;
      state.collisionTimer = 0.9;
      showToast("Collision! 1.4% charge lost");
      playSound("collision");
    }
  }

  const nearby = nearbyTarget();
  const charging = Boolean(
    nearby?.kind === "station" &&
    Math.abs(player.speed) < 35 &&
    !state.outage &&
    player.battery < 100,
  );
  if (charging) {
    player.battery = Math.min(100, player.battery + 18 * dt);
  }
  if (charging && !wasCharging) playSound("charge");
  wasCharging = charging;

  if (justPressed.has("e") || justPressed.has("E")) interact(nearby);
  if (state.toastTimer > 0) {
    state.toastTimer -= dt;
    if (state.toastTimer <= 0) ui.toast.classList.remove("visible");
  }
  state.score = Math.floor(state.distance * 100) + state.deliveries * 500;
  updateHud();
  if (player.battery <= 0 || state.deliveries === DELIVERY_POINTS.length)
    endRun();
}

function interact(nearby) {
  if (!nearby) return;
  if (nearby.kind === "delivery") {
    nearby.target.delivered = true;
    state.deliveries += 1;
    player.packages = Math.max(0, player.packages - 1);
    showToast(`Parcel delivered · ${nearby.target.name}`);
    playSound("delivery");
  } else if (state.outage) {
    showToast(
      `Load-shedding · power returns in ${Math.ceil(state.outageTimer)}s`,
    );
  } else {
    showToast("Park at the dock to charge automatically");
  }
}

function updateHud() {
  const efficiency =
    state.distance > 0.02
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((100 * 2.8) / (state.energyUsed / state.distance)),
          ),
        )
      : 100;
  ui.battery.textContent = `${Math.ceil(player.battery)}%`;
  ui.batteryFill.style.width = `${player.battery}%`;
  ui.batteryFill.classList.toggle("low", player.battery < 25);
  ui.distance.textContent = state.distance.toFixed(1);
  ui.deliveries.textContent = player.packages;
  ui.efficiency.textContent = efficiency;
  ui.best.textContent = bestScore.toLocaleString("en-ZA");
  const next = DELIVERY_POINTS.find((point) => !point.delivered);
  ui.mission.textContent = next
    ? `${next.name} · ${Math.round(distanceBetween(player, next) / 100) / 10} km away`
    : "All parcels delivered";
  const nearby = nearbyTarget();
  ui.hint.textContent =
    nearby?.kind === "delivery"
      ? "Press E to deliver parcel"
      : nearby?.kind === "station"
        ? state.outage
          ? `Station offline · ${Math.ceil(state.outageTimer)}s`
          : Math.abs(player.speed) < 35
            ? player.battery < 100
              ? "Charging automatically"
              : "Battery full"
            : "Slow down at dock to charge"
        : "WASD / arrows to drive   E interact";
  ui.chargeStatus.textContent =
    nearby?.kind === "station"
      ? state.outage
        ? "OFFLINE"
        : Math.abs(player.speed) < 35 && player.battery < 100
          ? "CHARGING"
          : "READY"
      : player.battery < 20
        ? "LOW"
        : "READY";
  ui.chargeStatus.classList.toggle(
    "offline",
    state.outage && nearby?.kind === "station",
  );
  ui.chargeStatus.classList.toggle("low", player.battery < 20);
  ui.loadText.textContent = state.outage
    ? `LOAD-SHEDDING · ${Math.ceil(state.outageTimer)}s`
    : `GRID: STABLE · OUTAGE IN ${Math.ceil(state.outageTimer)}s`;
  ui.loadProgress.style.width = `${state.outage ? (1 - state.outageTimer / outageLength) * 100 : (1 - state.outageTimer / (loadShedCycle - outageLength)) * 100}%`;
  ui.loadProgress.classList.toggle("outage", state.outage);
}

// Main render loop: update the camera and draw the visible world each frame
function draw() {
  camera.x = Math.max(0, Math.min(WORLD.width - WIDTH, player.x - WIDTH / 2));
  camera.y = Math.max(
    0,
    Math.min(WORLD.height - HEIGHT, player.y - HEIGHT / 2),
  );
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  drawWorld();
  drawPlayer();
  ctx.restore();
  drawMiniMap();
}

// Draw the full map in world coordinates, then overlay the player and map UI
function drawWorld() {
  ctx.fillStyle = "#a9b776";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.fillStyle = "rgba(54, 76, 43, .10)";
  for (let y = 30; y < WORLD.height; y += 86) {
    for (let x = (Math.floor(y / 86) % 2) * 42; x < WORLD.width; x += 86) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawRiver();
  drawRoads();
  drawHouses();
  drawTrees();
  drawStations();
  drawDeliveries();
  drawPotholes();
}

// Draw river and bridge
function drawRiver() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#778c80";
  ctx.lineWidth = 100;
  ctx.beginPath();
  RIVER.forEach((point, index) =>
    index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
  );
  ctx.stroke();
  ctx.strokeStyle = "#4f8790";
  ctx.lineWidth = 74;
  ctx.stroke();
  ctx.strokeStyle = "rgba(220, 231, 197, .45)";
  ctx.lineWidth = 2;
  for (let index = 0; index < RIVER.length - 1; index += 1) {
    const start = RIVER[index];
    const end = RIVER[index + 1];
    ctx.beginPath();
    ctx.moveTo(start.x, start.y - 16);
    ctx.lineTo(end.x, end.y - 16);
    ctx.stroke();
  }
  drawWaterRipples();
  for (const bridge of BRIDGES) {
    ctx.fillStyle = "#aa8d65";
    ctx.fillRect(bridge.x - 62, bridge.y - 57, 124, 114);
    ctx.fillStyle = "#cbb38b";
    ctx.fillRect(bridge.x - 49, bridge.y - 57, 98, 114);
    ctx.strokeStyle = "#826f53";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bridge.x - 47, bridge.y - 41);
    ctx.lineTo(bridge.x + 47, bridge.y - 41);
    ctx.moveTo(bridge.x - 47, bridge.y + 41);
    ctx.lineTo(bridge.x + 47, bridge.y + 41);
    ctx.stroke();
  }
}

// Animated water ripples add motion to the river surface
function drawWaterRipples() {
  const cycleDuration = 3.4;
  const time = performance.now() / 1000;
  ctx.save();
  ctx.strokeStyle = "#d1dfc1";
  ctx.lineWidth = 1.5;
  for (const ripple of WATER_RIPPLES) {
    const phase = ((time + ripple.offset) % cycleDuration) / cycleDuration;
    const radiusX = 3 + phase * 19;
    const radiusY = 1.5 + phase * 5;
    ctx.globalAlpha = (1 - phase) * 0.5;
    ctx.beginPath();
    ctx.ellipse(ripple.x, ripple.y, radiusX, radiusY, -0.08, 0, Math.PI * 2);
    ctx.stroke();
    if (phase < 0.62) {
      ctx.globalAlpha = (0.62 - phase) * 0.55;
      ctx.beginPath();
      ctx.ellipse(
        ripple.x,
        ripple.y,
        radiusX * 0.56,
        radiusY * 0.6,
        -0.08,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Road network and lane markings used for driving and collision checks
function drawRoads() {
  ctx.fillStyle = "#c5ad82";
  for (const x of ROADS.vertical) ctx.fillRect(x - 54, 0, 108, WORLD.height);
  for (const y of ROADS.horizontal) ctx.fillRect(0, y - 54, WORLD.width, 108);
  ctx.strokeStyle = "rgba(247, 228, 185, .6)";
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 15]);
  for (const x of ROADS.vertical) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.height);
    ctx.stroke();
  }
  for (const y of ROADS.horizontal) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.width, y);
    ctx.stroke();
  }

  for (let x = 80; x < WORLD.width; x += 170) {
    for (const y of ROADS.horizontal) {
      ctx.beginPath();
      ctx.moveTo(x, y + 31);
      ctx.lineTo(x + 34, y + 34);
    }
  }
}

// Village houses are generated from a grid and vary in shape and color
function drawHouses() {
  const wallColors = ["#c9ab7d", "#b9986e", "#d0b58a"];
  const roofColors = ["#77553b", "#86603d", "#6e503a"];
  for (const house of HOUSES) {
    const centerX = house.x + house.w / 2;
    ctx.fillStyle = "rgba(43, 48, 37, .24)";
    ctx.beginPath();
    ctx.ellipse(
      centerX + 5,
      house.y + house.h + 5,
      house.w * 0.58,
      13,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.fillStyle = wallColors[house.color];
    ctx.beginPath();
    ctx.moveTo(house.x + 7, house.y + house.h);
    ctx.lineTo(house.x + 7, house.y + 26);
    ctx.quadraticCurveTo(house.x + 7, house.y + 12, centerX, house.y + 12);
    ctx.quadraticCurveTo(
      house.x + house.w - 7,
      house.y + 12,
      house.x + house.w - 7,
      house.y + 26,
    );
    ctx.lineTo(house.x + house.w - 7, house.y + house.h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = roofColors[house.color];
    ctx.beginPath();
    ctx.moveTo(house.x - 10, house.y + 24);
    ctx.lineTo(centerX, house.y - 36);
    ctx.lineTo(house.x + house.w + 10, house.y + 24);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(house.x - 10, house.y + 24);
    ctx.lineTo(centerX, house.y - 36);
    ctx.lineTo(house.x + house.w + 10, house.y + 24);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = "#b98a51";
    ctx.lineWidth = 2;
    for (let stripe = -3; stripe <= 3; stripe += 1) {
      const startX = centerX + stripe * 8;
      ctx.beginPath();
      ctx.moveTo(startX, house.y - 15 + Math.abs(stripe) * 4);
      ctx.lineTo(centerX + stripe * 14, house.y + 19 + Math.abs(stripe) * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "#674c38";
    ctx.beginPath();
    ctx.roundRect(centerX - 8, house.y + house.h - 28, 16, 28, [7, 7, 0, 0]);
    ctx.fill();
    ctx.fillStyle = "#e3c58c";
    ctx.beginPath();
    ctx.arc(centerX + 4, house.y + house.h - 14, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Scenery: trees
function drawTrees() {
  const trees = [
    [170, 250],
    [610, 180],
    [1020, 190],
    [1570, 160],
    [2020, 240],
    [190, 600],
    [700, 610],
    [1100, 570],
    [1640, 580],
    [2050, 650],
    [220, 1080],
    [760, 1110],
    [1160, 1110],
    [1530, 1110],
    [2070, 1180],
    [230, 1510],
    [780, 1510],
    [1430, 1510],
    [1980, 1510],
  ];
  for (const [x, y] of trees) {
    ctx.fillStyle = "#6d5b44";
    ctx.fillRect(x - 4, y + 9, 8, 18);
    ctx.fillStyle = "#556d49";
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(196, 197, 132, .35)";
    ctx.beginPath();
    ctx.arc(x - 5, y - 5, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Charging stations change appearance depending on load-shedding status
function drawStations() {
  for (const station of STATIONS) {
    const active = !state.outage;
    ctx.fillStyle = "rgba(42, 53, 41, .2)";
    ctx.beginPath();
    ctx.ellipse(station.x, station.y + 6, 52, 31, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = active ? "#315c4a" : "#6b6f65";
    ctx.beginPath();
    ctx.ellipse(station.x, station.y, 52, 31, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = active ? "#e2c67b" : "#9b9b8d";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(station.x, station.y, 43, 23, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = active ? "#efc867" : "#aaa99a";
    ctx.textAlign = "center";
    ctx.fillText("ϟ", station.x, station.y + 7);
    ctx.fillStyle = "#fff7e4";
    ctx.fillText(active ? "CHARGE" : "OFFLINE", station.x, station.y + 49);
  }
}

// Delivery targets pulse until delivered
function drawDeliveries() {
  for (const point of DELIVERY_POINTS) {
    if (point.delivered) continue;
    const pulse = 1 + Math.sin(performance.now() / 240) * 0.09;
    ctx.fillStyle = "rgba(202, 102, 63, .18)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 30 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c76645";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f9f1df";
    ctx.fillText(point.name.toUpperCase(), point.x, point.y + 37);
  }
}

// Hazard markers are rendered as potholes that reduce battery and bounce the car
function drawPotholes() {
  for (const hole of POTHOLES) {
    ctx.fillStyle = "#796c58";
    ctx.beginPath();
    ctx.ellipse(hole.x, hole.y, hole.r, hole.r * 0.65, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(48, 46, 39, .45)";
    ctx.beginPath();
    ctx.ellipse(
      hole.x + 2,
      hole.y + 2,
      hole.r * 0.55,
      hole.r * 0.3,
      -0.2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = "#d4c295";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hole.x - hole.r - 7, hole.y - 12);
    ctx.lineTo(hole.x - hole.r + 2, hole.y - 4);
  }
}

// Player vehicle sprite with direction facing
function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.fillStyle = "rgba(27, 35, 30, .32)";
  ctx.beginPath();
  ctx.ellipse(1, 7, 29, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#28372f";
  for (const x of [-16, 13]) {
    ctx.fillRect(x, -17, 9, 7);
    ctx.fillRect(x, 10, 9, 7);
  }
  ctx.fillStyle = "#e6a54f";
  ctx.beginPath();
  ctx.roundRect(-24, -13, 47, 26, 7);
  ctx.fill();
  if (player.packages > 0) {
    ctx.fillStyle = "#9b7545";
    ctx.fillRect(-21, -8, 12, 16);
    ctx.strokeStyle = "#e1c18a";
    ctx.lineWidth = 1;
    for (let index = 0; index < player.packages; index += 1) {
      const row = Math.floor(index / 2);
      const column = index % 2;
      ctx.strokeRect(-20 + row * 6, -7 + column * 7, 5, 5);
    }
  }
  ctx.fillStyle = "#395b55";
  ctx.beginPath();
  ctx.roundRect(-5, -10, 16, 20, 4);
  ctx.fill();
  ctx.fillStyle = "#a8c3ae";
  ctx.fillRect(-3, -8, 11, 7);
  ctx.fillStyle = "#fff0bd";
  ctx.fillRect(18, -9, 4, 5);
  ctx.fillRect(18, 4, 4, 5);
  ctx.fillStyle = "#67523b";
  ctx.fillRect(-24, -8, 4, 5);
  ctx.fillRect(-24, 3, 4, 5);
  ctx.fillStyle = "#f3ead4";
  ctx.textAlign = "center";
  ctx.fillText("ECO", -14, 2);
  ctx.restore();
}

// Small minimap shows the route, remaining deliveries, and player position
function drawMiniMap() {
  const mapX = WIDTH - 142;
  const mapY = 18;
  const mapW = 124;
  const mapH = 96;
  ctx.fillStyle = "rgba(32, 43, 36, .84)";
  ctx.fillRect(mapX - 5, mapY - 5, mapW + 10, mapH + 10);
  ctx.fillStyle = "#a9b776";
  ctx.fillRect(mapX, mapY, mapW, mapH);
  ctx.fillStyle = "#c5ad82";
  for (const x of ROADS.vertical)
    ctx.fillRect(mapX + (x / WORLD.width) * mapW - 2, mapY, 4, mapH);
  for (const y of ROADS.horizontal)
    ctx.fillRect(mapX, mapY + (y / WORLD.height) * mapH - 2, mapW, 4);
  ctx.strokeStyle = "#4f8790";
  ctx.lineWidth = 4;
  ctx.beginPath();
  RIVER.forEach((point, index) =>
    index
      ? ctx.lineTo(
          mapX + (point.x / WORLD.width) * mapW,
          mapY + (point.y / WORLD.height) * mapH,
        )
      : ctx.moveTo(
          mapX + (point.x / WORLD.width) * mapW,
          mapY + (point.y / WORLD.height) * mapH,
        ),
  );
  ctx.stroke();
  for (const point of DELIVERY_POINTS.filter((item) => !item.delivered)) {
    ctx.fillStyle = "#d8734c";
    ctx.beginPath();
    ctx.arc(
      mapX + (point.x / WORLD.width) * mapW,
      mapY + (point.y / WORLD.height) * mapH,
      2.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  for (const station of STATIONS) {
    ctx.fillStyle = state.outage ? "#93958a" : "#ebc767";
    ctx.fillRect(
      mapX + (station.x / WORLD.width) * mapW - 2,
      mapY + (station.y / WORLD.height) * mapH - 2,
      4,
      4,
    );
  }
  ctx.fillStyle = "#fff4d7";
  ctx.beginPath();
  ctx.arc(
    mapX + (player.x / WORLD.width) * mapW,
    mapY + (player.y / WORLD.height) * mapH,
    3.5,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

// Animation frame loop: update the simulation and re-render the game world
function frame(time) {
  const dt = Math.min((time - previousTime) / 1000 || 0, 0.04);
  previousTime = time;
  if (state.mode === "running") update(dt);
  draw();
  justPressed.clear();
  requestAnimationFrame(frame);
}

// Keyboard controls for driving, interaction, and pause actions
document.addEventListener("keydown", (event) => {
  const key = event.key;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(key))
    event.preventDefault();
  if (!keys.has(key)) justPressed.add(key);
  keys.add(key);
  if ((key === "p" || key === "P" || key === "Escape") && !event.repeat)
    togglePause();
});
document.addEventListener("keyup", (event) => keys.delete(event.key));
window.addEventListener("blur", () => keys.clear());

// UI event listeners for the start button, pause toggle, and sound toggle
ui.button.addEventListener("click", startRun);
document.getElementById("pauseButton").addEventListener("click", togglePause);
ui.soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) enableAudio();
  updateSoundButton();
});
// Touch controls mirror the keyboard controls so the game is responsive and works on mobile devices
document.querySelectorAll("[data-key]").forEach((button) => {
  const key = button.dataset.key;
  const press = (event) => {
    event.preventDefault();
    if (!keys.has(key)) justPressed.add(key);
    keys.add(key);
  };
  const release = () => keys.delete(key);
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("pointercancel", release);
});

// Initialise the HUD and start the first animation frame
updateHud();
updateSoundButton();
setOverlay("start");
requestAnimationFrame((time) => {
  previousTime = time;
  requestAnimationFrame(frame);
});
