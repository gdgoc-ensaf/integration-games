/**
 * GDG ENSAF PUZZLE-CAM
 * =====================
 * Interactive hand & face camera puzzle game.
 * - Eye-Closure Photo Trigger (MediaPipe Face Mesh)
 * - GDG ENSAF Official Branding Watermark
 * - 3x3 Puzzle: Pieces can be placed in ANY slot (correct or incorrect)
 * - NO hints / NO green signs on drop (true puzzle solving experience)
 * - Ultra-responsive 60FPS drag & drop with zero lag
 * - Direct Save to Phone Gallery
 */

// Application States
const STATE = {
  CAMERA: 'CAMERA',         // Live camera, waiting for eyes to close or manual snap
  COUNTDOWN: 'COUNTDOWN',   // 3-second animated countdown
  PUZZLE: 'PUZZLE',         // Photo sliced into 3x3, user solving via Touch or Pinch
  SOLVED: 'SOLVED',         // All pieces in their correct slots! Awaiting save
  SAVING: 'SAVING'          // Saving photo and resetting to camera
};

// UI Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');

const modeBadge = document.getElementById('modeBadge');
const instructionBanner = document.getElementById('instructionBanner');
const bannerIcon = document.getElementById('bannerIcon');
const bannerText = document.getElementById('bannerText');

const countdownContainer = document.getElementById('countdownContainer');
const countdownMeter = document.getElementById('countdownMeter');
const countdownNumber = document.getElementById('countdownNumber');
const screenFlash = document.getElementById('screenFlash');

const victoryToast = document.getElementById('victoryToast');
const saveToast = document.getElementById('saveToast');

const camControls = document.getElementById('camControls');
const puzzleControls = document.getElementById('puzzleControls');
const btnManualSnap = document.getElementById('btnManualSnap');
const btnScatter = document.getElementById('btnScatter');
const btnSave = document.getElementById('btnSave');
const btnResetCam = document.getElementById('btnResetCam');

const btnFlipCam = document.getElementById('btnFlipCam');
const btnSound = document.getElementById('btnSound');
const btnHelp = document.getElementById('btnHelp');
const helpModal = document.getElementById('helpModal');
const btnCloseHelp = document.getElementById('btnCloseHelp');
const btnGotIt = document.getElementById('btnGotIt');
const startScreen = document.getElementById('startScreen');
const btnStartCam = document.getElementById('btnStartCam');

// Difficulty & Share DOM Elements
const btnDiffEasy = document.getElementById('btnDiffEasy');
const btnDiffHard = document.getElementById('btnDiffHard');
let puzzleGridSize = 3; // 3 = Easy (9 pcs), 4 = Hard (16 pcs)

const shareModal = document.getElementById('shareModal');
const btnCloseShare = document.getElementById('btnCloseShare');
const sharePreviewImg = document.getElementById('sharePreviewImg');
const btnCopyTag = document.getElementById('btnCopyTag');
const btnShareInsta = document.getElementById('btnShareInsta');
const btnDownloadPhoto = document.getElementById('btnDownloadPhoto');
const btnPlayAgain = document.getElementById('btnPlayAgain');
const copyToast = document.getElementById('copyToast');
let capturedExportBlob = null;
let capturedExportUrl = null;

// Preload GDG ENSAF Logo
const gdgLogo = new Image();
gdgLogo.src = '../logo.png';
let isLogoLoaded = false;
gdgLogo.onload = () => { isLogoLoaded = true; };

// Application State Variables
let currentState = STATE.CAMERA;
let facingMode = 'user'; // 'user' (front) or 'environment' (rear)
let cameraStream = null;
let soundEnabled = true;

// MediaPipe Instances
let faceMeshDetector = null;
let handsDetector = null;
let isFaceMeshReady = false;
let isHandsReady = false;

// Tracking Data
let eyesClosedConsecutiveFrames = 0;
let lastBlinkTriggerTime = 0;
let detectedHands = [];
let activeDraggedPiece = null;
let touchDragPiece = null;
let dragOffset = { x: 0, y: 0 };
let maxZIndex = 10;
let lastHandProcessTime = 0;
let lastProcessedVideoTime = -1;
let videoProcessingStarted = false;

// Countdown Timing
let countdownStartTime = 0;
const COUNTDOWN_DURATION = 3000;
let lastCountdownSecond = 3;

// Puzzle Mechanics
let capturedImage = null;
let puzzlePieces = [];
let gridSlots = [null, null, null, null, null, null, null, null, null]; // 9 board slots
let boardRect = { x: 0, y: 0, size: 300 };
let saveCooldownUntil = 0;
let fistDetectedTime = 0;
let fistHoldProgress = 0;
const FIST_HOLD_REQUIRED = 1800; // 1.8 seconds in SOLVED state

// Visual Effects
let confetti = [];

// -----------------------------------------------------------------------------
// Web Audio Synthesizer (Ultra-lightweight)
// -----------------------------------------------------------------------------
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTone(freq, type = 'sine', duration = 0.08, gain = 0.12) {
  if (!soundEnabled || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(gain, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function playCountdownTick(isFinal = false) {
  if (isFinal) {
    playTone(880, 'sine', 0.2, 0.22);
  } else {
    playTone(520, 'sine', 0.1, 0.15);
  }
}

function playShutterSound() {
  if (!soundEnabled || !audioCtx) return;
  try {
    const bufferSize = audioCtx.sampleRate * 0.1;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
    noise.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start();
  } catch (e) {}
}

function playPopSound() {
  playTone(400, 'sine', 0.06, 0.12);
}

// Neutral, subtle click when dropping into ANY slot (gives ZERO hint!)
function playDropSound() {
  playTone(340, 'triangle', 0.05, 0.1);
}

function playVictorySound() {
  if (!soundEnabled || !audioCtx) return;
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  notes.forEach((freq, idx) => {
    setTimeout(() => playTone(freq, 'triangle', 0.25, 0.22), idx * 105);
  });
}

// -----------------------------------------------------------------------------
// Screen & Canvas Resizing
// -----------------------------------------------------------------------------
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  updateBoardLayout();
}

function updateBoardLayout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const N = puzzleGridSize;
  const selector = document.getElementById('diffSelector');
  const headerBottom = document.querySelector('.top-bar').getBoundingClientRect().bottom;
  instructionBanner.style.top = (headerBottom + 8) + 'px';
  const bannerBottom = instructionBanner.getBoundingClientRect().bottom;
  const wideControls = w >= 1100;
  const sideTrays = w >= 700;
  selector.style.top = (wideControls ? headerBottom + 8 : bannerBottom + 10) + 'px';
  const contentTop = (wideControls ? bannerBottom : selector.getBoundingClientRect().bottom) + 16;
  const contentBottom = h - document.querySelector('.bottom-bar').getBoundingClientRect().height - 12;
  // Reserve enough room for every piece, without covering the controls or grid.
  const availableHeight = Math.max(100, contentBottom - contentTop);
  const trayColumns = Math.ceil(N / 2);
  const sideTraySizeLimit = (w - 44 - 20 * (trayColumns - 1)) / (1 + 2 * trayColumns / N);
  const size = Math.min(w * 0.86, h * 0.48, 380, sideTrays ? sideTraySizeLimit : Infinity,
    sideTrays ? availableHeight : (availableHeight - 16 - (N - 1) * 10) / 2);
  boardRect = {
    x: (w - size) / 2,
    y: sideTrays ? Math.max(contentTop, (h - size) / 2 - 35) : contentTop,
    size: size
  };

  const pieceSize = boardRect.size / N;
  const loosePositions = getScatterPositions();
  puzzlePieces.forEach(p => {
    p.width = pieceSize;
    p.height = pieceSize;
    // If piece is currently placed in a slot, update its coordinates to that slot
    if (p.currentSlot !== null && p.currentSlot !== undefined) {
      const c = p.currentSlot % N;
      const r = Math.floor(p.currentSlot / N);
      p.currentX = boardRect.x + c * pieceSize;
      p.currentY = boardRect.y + r * pieceSize;
    } else if (p.scatterIndex !== undefined) {
      const position = loosePositions[p.scatterIndex];
      p.currentX = position.x;
      p.currentY = position.y;
    }
  });
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 200));

// -----------------------------------------------------------------------------
// Camera Initialization & Switching
// -----------------------------------------------------------------------------
async function startCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
  }

  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = cameraStream;
    await new Promise(resolve => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });

    if (startScreen) {
      startScreen.classList.add('hidden');
    }
    updateInstructionUI();
  } catch (err) {
    console.error('Camera access error:', err);
    alert('Camera permission denied or unavailable. Please check your browser settings.');
  }
}

// -----------------------------------------------------------------------------
// MediaPipe Initialization: Face Mesh (Eyes) & Hands (Pinch)
// -----------------------------------------------------------------------------
async function initMediaPipe() {
  if (isFaceMeshReady && isHandsReady) return;
  // 1. Initialize Face Mesh
  if (!isFaceMeshReady && typeof FaceMesh !== 'undefined') {
    let faceBase = './vendor/mediapipe/';
    try {
      const probe = await fetch('./vendor/mediapipe/face_mesh.binarypb', { method: 'HEAD' });
      if (!probe.ok) faceBase = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/';
    } catch (e) {
      faceBase = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/';
    }

    try {
      faceMeshDetector = new FaceMesh({
        locateFile: (file) => `${faceBase}${file}`
      });
      faceMeshDetector.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      faceMeshDetector.onResults(onFaceMeshResults);
      isFaceMeshReady = true;
      console.log('[+] MediaPipe FaceMesh initialized successfully');
    } catch (e) {
      console.warn('FaceMesh initialization warning:', e);
    }
  }

  // 2. Initialize Hands
  if (!isHandsReady && typeof Hands !== 'undefined') {
    let handsBase = './vendor/mediapipe/';
    try {
      const probe = await fetch('./vendor/mediapipe/hands.binarypb', { method: 'HEAD' });
      if (!probe.ok) handsBase = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/';
    } catch (e) {
      handsBase = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/';
    }

    try {
      handsDetector = new Hands({
        locateFile: (file) => `${handsBase}${file}`
      });
      handsDetector.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });
      handsDetector.onResults(onHandResults);
      isHandsReady = true;
      console.log('[+] MediaPipe Hands initialized successfully');
    } catch (e) {
      console.warn('Hands initialization warning:', e);
    }
  }
}

// -----------------------------------------------------------------------------
// Face Mesh Results: Eye-Closure Detection (Eye Aspect Ratio - EAR)
// -----------------------------------------------------------------------------
function onFaceMeshResults(results) {
  if (currentState !== STATE.CAMERA) return;
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    eyesClosedConsecutiveFrames = 0;
    return;
  }

  const lm = results.multiFaceLandmarks[0];

  // Eye Landmarks:
  // Left Eye: Upper: 159, Lower: 145, Horizontal: 33 (outer), 133 (inner)
  const leftV = Math.hypot(lm[159].x - lm[145].x, lm[159].y - lm[145].y);
  const leftH = Math.hypot(lm[33].x - lm[133].x, lm[33].y - lm[133].y);
  const leftEAR = leftH > 0 ? (leftV / leftH) : 0.3;

  // Right Eye: Upper: 386, Lower: 374, Horizontal: 263 (outer), 362 (inner)
  const rightV = Math.hypot(lm[386].x - lm[374].x, lm[386].y - lm[374].y);
  const rightH = Math.hypot(lm[263].x - lm[362].x, lm[263].y - lm[362].y);
  const rightEAR = rightH > 0 ? (rightV / rightH) : 0.3;

  // Closed threshold
  const bothClosed = (leftEAR < 0.165 && rightEAR < 0.165);

  if (bothClosed) {
    eyesClosedConsecutiveFrames++;
    if (eyesClosedConsecutiveFrames >= 4) {
      const now = performance.now();
      if (now - lastBlinkTriggerTime > 4000) {
        lastBlinkTriggerTime = now;
        startCountdown();
      }
    }
  } else {
    eyesClosedConsecutiveFrames = 0;
  }
}

// -----------------------------------------------------------------------------
// Hands Results: Pinch & Fist Detection
// -----------------------------------------------------------------------------
function onHandResults(results) {
  detectedHands = [];
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const isMirrored = (facingMode === 'user');

    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const rawLandmarks = results.multiHandLandmarks[i];
      const pts = rawLandmarks.map(lm => {
        const xNorm = isMirrored ? (1.0 - lm.x) : lm.x;
        return {
          x: xNorm * viewW,
          y: lm.y * viewH,
          z: lm.z
        };
      });

      const pinchData = checkPinch(pts);
      const fistData = checkFist(pts);

      detectedHands.push({
        points: pts,
        isPinching: pinchData.isPinching,
        pinchPos: pinchData.pinchPos,
        isFist: fistData.isFist,
        fistPos: fistData.fistPos
      });
    }
  }
}

function checkPinch(pts) {
  const thumb = pts[4];
  const index = pts[8];
  const wrist = pts[0];
  const middleMcp = pts[9];

  const handScale = Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y) || 120;
  const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  const ratio = pinchDist / handScale;

  return {
    isPinching: ratio < 0.38,
    pinchPos: { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }
  };
}

function checkFist(pts) {
  const wrist = pts[0];
  const fingers = [
    { tip: pts[8], pip: pts[6] },   // Index
    { tip: pts[12], pip: pts[10] }, // Middle
    { tip: pts[16], pip: pts[14] }, // Ring
    { tip: pts[20], pip: pts[18] }  // Pinky
  ];

  let curledCount = 0;
  for (const f of fingers) {
    const dTip = Math.hypot(f.tip.x - wrist.x, f.tip.y - wrist.y);
    const dPip = Math.hypot(f.pip.x - wrist.x, f.pip.y - wrist.y);
    if (dTip < dPip * 1.05) curledCount++;
  }

  const thumbTip = pts[4];
  const indexMcp = pts[5];
  const thumbDist = Math.hypot(thumbTip.x - indexMcp.x, thumbTip.y - indexMcp.y);
  const handScale = Math.hypot(wrist.x - pts[9].x, wrist.y - pts[9].y) || 120;
  const thumbTucked = thumbDist < handScale * 0.9;

  return {
    isFist: curledCount >= 4 && thumbTucked,
    fistPos: { x: pts[9].x, y: pts[9].y }
  };
}

// -----------------------------------------------------------------------------
// Continuous Video Frame Processing (Optimized for 60FPS)
// -----------------------------------------------------------------------------
async function processVideoFrame() {
  if (!document.hidden && video && video.readyState >= 2 && video.currentTime !== lastProcessedVideoTime) {
    const now = performance.now();
    try {
      // In CAMERA state: process FaceMesh to detect eye closure
      if (currentState === STATE.CAMERA && isFaceMeshReady && faceMeshDetector) {
        lastProcessedVideoTime = video.currentTime;
        await faceMeshDetector.send({ image: video });
      }
      // In PUZZLE / SOLVED states:
      // KEY PERFORMANCE OPTIMIZATION: When the user is touching/dragging a piece directly with their finger,
      // skip ML inference to give 100% of CPU/GPU to fluid, zero-lag touch response!
      else if ((currentState === STATE.PUZZLE || currentState === STATE.SOLVED) && isHandsReady && handsDetector) {
        if (!touchDragPiece && (now - lastHandProcessTime > 40)) { // Throttled to ~25 FPS max
          lastHandProcessTime = now;
          lastProcessedVideoTime = video.currentTime;
          await handsDetector.send({ image: video });
        }
      }
    } catch (err) {}
  }
  requestAnimationFrame(processVideoFrame);
}

// -----------------------------------------------------------------------------
// State Transitions & HUD Updates
// -----------------------------------------------------------------------------
function setAppState(newState) {
  currentState = newState;
  updateInstructionUI();

  if (newState === STATE.CAMERA) {
    modeBadge.textContent = 'LIVE CAM';
    modeBadge.style.color = 'var(--gdg-blue)';
    camControls.classList.remove('hidden');
    puzzleControls.classList.add('hidden');
    countdownContainer.classList.add('hidden');
    victoryToast.classList.add('hidden');
    saveToast.classList.add('hidden');
    activeDraggedPiece = null;
    touchDragPiece = null;
  } else if (newState === STATE.COUNTDOWN) {
    modeBadge.textContent = 'COUNTDOWN';
    modeBadge.style.color = 'var(--gdg-yellow)';
    countdownContainer.classList.remove('hidden');
  } else if (newState === STATE.PUZZLE) {
    modeBadge.textContent = 'SOLVE PUZZLE';
    modeBadge.style.color = 'var(--gdg-blue)';
    camControls.classList.add('hidden');
    puzzleControls.classList.remove('hidden');
    countdownContainer.classList.add('hidden');
    victoryToast.classList.add('hidden');
    saveCooldownUntil = performance.now() + 2500;
  } else if (newState === STATE.SOLVED) {
    modeBadge.textContent = 'COMPLETED!';
    modeBadge.style.color = 'var(--gdg-green)';
    victoryToast.classList.remove('hidden');
    playVictorySound();
    triggerConfetti();
  } else if (newState === STATE.SAVING) {
    modeBadge.textContent = 'SAVING...';
    saveToast.classList.remove('hidden');
  }
  if (newState === STATE.CAMERA || newState === STATE.PUZZLE) updateBoardLayout();
}

function updateInstructionUI() {
  if (currentState === STATE.CAMERA) {
    bannerIcon.textContent = '😌';
    bannerText.textContent = 'Close both eyes to snap! (or tap shutter)';
  } else if (currentState === STATE.COUNTDOWN) {
    bannerIcon.textContent = '📸';
    bannerText.textContent = 'Open eyes & smile! Snapping in 3s...';
  } else if (currentState === STATE.PUZZLE) {
    bannerIcon.textContent = '🧩';
    bannerText.textContent = `Drag pieces into the ${puzzleGridSize}x${puzzleGridSize} grid slots`;
  } else if (currentState === STATE.SOLVED) {
    bannerIcon.textContent = '🎉';
    bannerText.textContent = 'Puzzle Solved! Tap "Save Photo" below';
  }
}

// -----------------------------------------------------------------------------
// Countdown & Photo Capture
// -----------------------------------------------------------------------------
function startCountdown() {
  initAudio();
  countdownStartTime = performance.now();
  lastCountdownSecond = 3;
  playCountdownTick(false);
  setAppState(STATE.COUNTDOWN);
}

function captureSnapshot() {
  playShutterSound();

  // Screen Flash
  screenFlash.classList.add('flash-active');
  setTimeout(() => screenFlash.classList.remove('flash-active'), 250);

  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  const squareSize = Math.min(viewW, viewH) * 0.82;
  const cropX = (viewW - squareSize) / 2;
  const cropY = (viewH - squareSize) / 2;

  const snapSize = 660;
  const snapCanvas = document.createElement('canvas');
  snapCanvas.width = snapSize;
  snapCanvas.height = snapSize;
  const sCtx = snapCanvas.getContext('2d');

  const vRatio = video.videoWidth / (video.videoHeight || 1);
  const sRatio = viewW / viewH;
  let dw, dh, dx, dy;
  if (sRatio > vRatio) {
    dw = viewW;
    dh = viewW / vRatio;
    dx = 0;
    dy = (viewH - dh) / 2;
  } else {
    dh = viewH;
    dw = viewH * vRatio;
    dx = (viewW - dw) / 2;
    dy = 0;
  }

  const tempVCanvas = document.createElement('canvas');
  tempVCanvas.width = viewW;
  tempVCanvas.height = viewH;
  const tvCtx = tempVCanvas.getContext('2d');

  if (facingMode === 'user') {
    tvCtx.translate(viewW, 0);
    tvCtx.scale(-1, 1);
    tvCtx.drawImage(video, dx, dy, dw, dh);
    tvCtx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    tvCtx.drawImage(video, dx, dy, dw, dh);
  }

  sCtx.drawImage(tempVCanvas, cropX, cropY, squareSize, squareSize, 0, 0, snapSize, snapSize);

  // Watermark with Official GDG ENSAF Logo
  if (isLogoLoaded) {
    const logoBadgeW = 160;
    const logoBadgeH = 48;
    const badgeX = snapSize - logoBadgeW - 16;
    const badgeY = 16;

    sCtx.save();
    sCtx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    sCtx.beginPath();
    sCtx.roundRect(badgeX, badgeY, logoBadgeW, logoBadgeH, 24);
    sCtx.fill();
    sCtx.restore();

    sCtx.drawImage(gdgLogo, badgeX + 8, badgeY + 6, 36, 36);

    sCtx.fillStyle = '#202124';
    sCtx.font = 'bold 12px "Google Sans", sans-serif';
    sCtx.fillText('GDG ENSAF', badgeX + 48, badgeY + 22);

    sCtx.fillStyle = '#1a73e8';
    sCtx.font = 'bold 9.5px "Google Sans", sans-serif';
    sCtx.fillText('ON CAMPUS', badgeX + 48, badgeY + 36);
  }

  capturedImage = snapCanvas;

  buildPuzzlePieces();
  setAppState(STATE.PUZZLE);
}

// -----------------------------------------------------------------------------
// N x N Puzzle Slicer & Grid Mechanics (Easy: 3x3, Hard: 4x4)
// -----------------------------------------------------------------------------
function buildPuzzlePieces() {
  const N = puzzleGridSize;
  const totalPieces = N * N;
  puzzlePieces = [];
  gridSlots = Array(totalPieces).fill(null);
  updateBoardLayout();

  const pieceW = boardRect.size / N;
  const pieceH = boardRect.size / N;
  const sourcePieceSize = capturedImage.width / N;

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const pCanvas = document.createElement('canvas');
      pCanvas.width = sourcePieceSize;
      pCanvas.height = sourcePieceSize;
      const pCtx = pCanvas.getContext('2d');

      pCtx.drawImage(
        capturedImage,
        c * sourcePieceSize, r * sourcePieceSize, sourcePieceSize, sourcePieceSize,
        0, 0, sourcePieceSize, sourcePieceSize
      );

      const id = r * N + c;
      puzzlePieces.push({
        id: id,
        correctRow: r,
        correctCol: c,
        currentSlot: null,
        canvas: pCanvas,
        currentX: 0,
        currentY: 0,
        width: pieceW,
        height: pieceH,
        rotation: 0,
        zIndex: id,
        scale: 1.0
      });
    }
  }

  scatterPieces();
}

function getScatterPositions() {
  const N = puzzleGridSize;
  const w = window.innerWidth;
  const pieceW = boardRect.size / N;
  const margin = 12;
  const gap = 10;
  const positions = [];
  if (w >= 700) {
    const cols = Math.ceil(N / 2);
    const sideWidth = boardRect.x - margin - gap;
    const stepX = (sideWidth - pieceW) / Math.max(1, cols - 1);
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < cols; col++) {
        const y = boardRect.y + row * pieceW;
        positions.push({ x: margin + col * stepX, y });
        positions.push({ x: boardRect.x + boardRect.size + gap + col * stepX, y });
      }
    }
  } else {
    const stepX = (w - margin * 2 - pieceW) / Math.max(1, N - 1);
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        positions.push({ x: margin + col * stepX,
          y: boardRect.y + boardRect.size + 16 + row * (pieceW + gap) });
      }
    }
  }
  return positions.slice(0, N * N);
}

function scatterPieces() {
  const totalPieces = puzzleGridSize * puzzleGridSize;
  const shuffled = [...puzzlePieces];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // Never present the entire photograph in its original row/column order.
  if (shuffled.length > 1 && shuffled.every((piece, i) => piece === puzzlePieces[i])) {
    shuffled.push(shuffled.shift());
  }
  const positions = getScatterPositions();

  // Clear slots
  gridSlots = Array(totalPieces).fill(null);
  activeDraggedPiece = null;
  touchDragPiece = null;
  shuffled.forEach((p, i) => {
    p.currentSlot = null;
    p.scatterIndex = i;
    p.rotation = (Math.random() - 0.5) * 0.12;
    p.scale = 1;
    p.zIndex = ++maxZIndex;
    p.currentX = positions[i].x;
    p.currentY = positions[i].y;
  });

  if (currentState === STATE.SOLVED) {
    setAppState(STATE.PUZZLE);
  }
}

/**
 * Handles dropping a piece into ANY of the N x N grid slots (correct or incorrect)
 * NO GREEN HINTS OR REVEALING SOUNDS GIVEN!
 */
function checkDropPiece(piece) {
  const N = puzzleGridSize;
  const totalPieces = N * N;
  const pieceW = boardRect.size / N;
  const pieceH = boardRect.size / N;
  const snapThreshold = pieceW * 0.55;

  let bestSlot = null;
  let bestDist = Infinity;

  for (let s = 0; s < totalPieces; s++) {
    const col = s % N;
    const row = Math.floor(s / N);
    const slotX = boardRect.x + col * pieceW;
    const slotY = boardRect.y + row * pieceH;

    const dist = Math.hypot(piece.currentX - slotX, piece.currentY - slotY);
    if (dist < bestDist) {
      bestDist = dist;
      bestSlot = s;
    }
  }

  if (bestSlot !== null && bestDist < snapThreshold) {
    const targetCol = bestSlot % N;
    const targetRow = Math.floor(bestSlot / N);
    const targetX = boardRect.x + targetCol * pieceW;
    const targetY = boardRect.y + targetRow * pieceH;

    const existingPiece = gridSlots[bestSlot];
    if (existingPiece && existingPiece !== piece) {
      if (piece.currentSlot !== null) {
        const oldSlot = piece.currentSlot;
        const oldCol = oldSlot % N;
        const oldRow = Math.floor(oldSlot / N);
        existingPiece.currentSlot = oldSlot;
        existingPiece.currentX = boardRect.x + oldCol * pieceW;
        existingPiece.currentY = boardRect.y + oldRow * pieceH;
        gridSlots[oldSlot] = existingPiece;
      } else {
        existingPiece.currentSlot = null;
        const position = getScatterPositions()[existingPiece.scatterIndex];
        existingPiece.currentX = position.x;
        existingPiece.currentY = position.y;
      }
    } else if (piece.currentSlot !== null && piece.currentSlot !== bestSlot) {
      gridSlots[piece.currentSlot] = null;
    }

    piece.currentSlot = bestSlot;
    piece.currentX = targetX;
    piece.currentY = targetY;
    piece.rotation = 0;
    gridSlots[bestSlot] = piece;

    playDropSound();
  } else {
    if (piece.currentSlot !== null) {
      gridSlots[piece.currentSlot] = null;
      piece.currentSlot = null;
    }
    playDropSound();
  }

  checkPuzzleSolved();
}

function checkPuzzleSolved() {
  const totalPieces = puzzleGridSize * puzzleGridSize;
  const isAllSolved = puzzlePieces.length === totalPieces && puzzlePieces.every(p => p.currentSlot === p.id);
  if (isAllSolved) {
    setAppState(STATE.SOLVED);
    playVictorySound();
    triggerConfetti();
    setTimeout(() => {
      triggerSavePhoto();
    }, 1200);
  }
}

function triggerConfetti() {
  const w = window.innerWidth;
  const colors = ['#4285f4', '#ea4335', '#fbbc05', '#34a853', '#ffffff'];
  for (let i = 0; i < 65; i++) {
    confetti.push({
      x: Math.random() * w,
      y: -20 - Math.random() * 100,
      vx: (Math.random() - 0.5) * 4,
      vy: 3 + Math.random() * 5,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.15,
      color: colors[Math.floor(Math.random() * colors.length)],
      width: 8 + Math.random() * 6,
      height: 6 + Math.random() * 4,
      alpha: 1.0
    });
  }
}

// -----------------------------------------------------------------------------
// Touch / Mouse Drag & Drop (Ultra-fast, zero lag)
// -----------------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  if (currentState !== STATE.PUZZLE && currentState !== STATE.SOLVED) return;

  const rect = canvas.getBoundingClientRect();
  const tx = e.clientX - rect.left;
  const ty = e.clientY - rect.top;

  // Check topmost piece under touch point (ANY piece can be picked up, even if placed in a slot!)
  const sorted = [...puzzlePieces].sort((a, b) => b.zIndex - a.zIndex);
  for (const p of sorted) {
    if (tx >= p.currentX && tx <= p.currentX + p.width &&
        ty >= p.currentY && ty <= p.currentY + p.height) {
      touchDragPiece = p;
      dragOffset.x = tx - p.currentX;
      dragOffset.y = ty - p.currentY;
      p.zIndex = ++maxZIndex;
      p.scale = 1.05;
      playPopSound();
      canvas.setPointerCapture(e.pointerId);
      break;
    }
  }
}, { passive: false });

canvas.addEventListener('pointermove', (e) => {
  if (!touchDragPiece) return;
  // Direct instantaneous coordinate update
  const rect = canvas.getBoundingClientRect();
  touchDragPiece.currentX = (e.clientX - rect.left) - dragOffset.x;
  touchDragPiece.currentY = (e.clientY - rect.top) - dragOffset.y;
}, { passive: false });

function endTouchDrag(e) {
  if (touchDragPiece) {
    touchDragPiece.scale = 1.0;
    checkDropPiece(touchDragPiece);
    touchDragPiece = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (err) {}
  }
}

canvas.addEventListener('pointerup', endTouchDrag);
canvas.addEventListener('pointercancel', endTouchDrag);

// -----------------------------------------------------------------------------
// Gesture Processing (Hand Pinch Drag & Fist Save)
// -----------------------------------------------------------------------------
function processGestures(now) {
  // 1. Single Pinch: Drag & Drop
  if (currentState === STATE.PUZZLE || currentState === STATE.SOLVED) {
    const pinching = detectedHands.find(h => h.isPinching);
    if (pinching) {
      const pinch = pinching.pinchPos;
      if (!activeDraggedPiece) {
        const sorted = [...puzzlePieces].sort((a, b) => b.zIndex - a.zIndex);
        for (const p of sorted) {
          if (pinch.x >= p.currentX && pinch.x <= p.currentX + p.width &&
              pinch.y >= p.currentY && pinch.y <= p.currentY + p.height) {
            activeDraggedPiece = p;
            dragOffset.x = pinch.x - p.currentX;
            dragOffset.y = pinch.y - p.currentY;
            p.zIndex = ++maxZIndex;
            p.scale = 1.05;
            playPopSound();
            break;
          }
        }
      } else {
        activeDraggedPiece.currentX = pinch.x - dragOffset.x;
        activeDraggedPiece.currentY = pinch.y - dragOffset.y;
      }
    } else {
      if (activeDraggedPiece) {
        activeDraggedPiece.scale = 1.0;
        checkDropPiece(activeDraggedPiece);
        activeDraggedPiece = null;
      }
    }
  }

  // 2. Closed Fist Save — ONLY ENABLED IN SOLVED STATE!
  if (currentState === STATE.SOLVED && now > saveCooldownUntil) {
    const fistHand = detectedHands.find(h => h.isFist);
    if (fistHand) {
      if (fistDetectedTime === 0) fistDetectedTime = now;
      const holdTime = now - fistDetectedTime;
      fistHoldProgress = Math.min(1.0, holdTime / FIST_HOLD_REQUIRED);

      if (fistHoldProgress >= 1.0) {
        triggerSavePhoto();
        fistDetectedTime = 0;
        fistHoldProgress = 0;
      }
    } else {
      fistDetectedTime = 0;
      fistHoldProgress = Math.max(0, fistHoldProgress - 0.05);
    }
  } else {
    fistDetectedTime = 0;
    fistHoldProgress = 0;
  }
}

// -----------------------------------------------------------------------------
// Photo Export & Direct Save to Mobile Phone
// -----------------------------------------------------------------------------
function triggerSavePhoto() {
  if (currentState === STATE.SAVING) return;
  setAppState(STATE.SAVING);

  const exportSize = 1080;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = exportSize;
  outCanvas.height = exportSize;
  const oCtx = outCanvas.getContext('2d');

  const bgGrad = oCtx.createLinearGradient(0, 0, 0, exportSize);
  bgGrad.addColorStop(0, '#bfe4fa');
  bgGrad.addColorStop(0.4, '#e2f2fd');
  bgGrad.addColorStop(1, '#ffffff');
  oCtx.fillStyle = bgGrad;
  oCtx.fillRect(0, 0, exportSize, exportSize);

  if (capturedImage) {
    const pad = 80;
    const imgSize = exportSize - pad * 2;

    oCtx.save();
    oCtx.shadowColor = 'rgba(66, 133, 244, 0.25)';
    oCtx.shadowBlur = 35;
    oCtx.shadowOffsetY = 14;

    oCtx.beginPath();
    oCtx.roundRect(pad, pad, imgSize, imgSize, 28);
    oCtx.clip();
    oCtx.drawImage(capturedImage, pad, pad, imgSize, imgSize);
    oCtx.restore();

    oCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    oCtx.lineWidth = 4;
    oCtx.beginPath();
    oCtx.roundRect(pad, pad, imgSize, imgSize, 28);
    oCtx.stroke();

    oCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    oCtx.lineWidth = 2;
    const N = puzzleGridSize;
    const step = imgSize / N;
    for (let i = 1; i < N; i++) {
      oCtx.beginPath();
      oCtx.moveTo(pad + i * step, pad);
      oCtx.lineTo(pad + i * step, pad + imgSize);
      oCtx.stroke();
      oCtx.beginPath();
      oCtx.moveTo(pad, pad + i * step);
      oCtx.lineTo(pad + imgSize, pad + i * step);
      oCtx.stroke();
    }
  }

  const footerY = exportSize - 70;
  if (isLogoLoaded) {
    oCtx.drawImage(gdgLogo, 80, footerY - 14, 48, 48);
  }

  oCtx.fillStyle = '#202124';
  oCtx.font = 'bold 24px "Google Sans", sans-serif';
  oCtx.textAlign = 'left';
  oCtx.fillText('Google Developer Groups', isLogoLoaded ? 140 : 80, footerY + 10);

  oCtx.fillStyle = '#1a73e8';
  oCtx.font = '600 16px "Google Sans", sans-serif';
  oCtx.fillText('On Campus ENSA Fez • PUZZLE-CAM', isLogoLoaded ? 140 : 80, footerY + 30);

  oCtx.fillStyle = '#5f6368';
  oCtx.font = '14px sans-serif';
  oCtx.textAlign = 'right';
  oCtx.fillText(new Date().toLocaleDateString(), exportSize - 80, footerY + 20);

  outCanvas.toBlob((blob) => {
    if (!blob) return;
    capturedExportBlob = blob;
    if (capturedExportUrl) URL.revokeObjectURL(capturedExportUrl);
    capturedExportUrl = URL.createObjectURL(blob);

    sharePreviewImg.src = capturedExportUrl;
    shareModal.classList.remove('hidden');
  }, 'image/jpeg', 0.95);
}

function saveBlobAsDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// -----------------------------------------------------------------------------
// Canvas Main Render Loop (60FPS Optimized)
// -----------------------------------------------------------------------------
function render() {
  const now = performance.now();
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  ctx.clearRect(0, 0, viewW, viewH);

  // 1. Render Video Feed or Puzzle Board
  if (currentState === STATE.CAMERA || currentState === STATE.COUNTDOWN) {
    if (video.readyState >= 2) {
      ctx.save();
      const vRatio = video.videoWidth / (video.videoHeight || 1);
      const sRatio = viewW / viewH;
      let dw, dh, dx, dy;
      if (sRatio > vRatio) {
        dw = viewW;
        dh = viewW / vRatio;
        dx = 0;
        dy = (viewH - dh) / 2;
      } else {
        dh = viewH;
        dw = viewH * vRatio;
        dx = (viewW - dw) / 2;
        dy = 0;
      }

      if (facingMode === 'user') {
        ctx.translate(viewW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, dx, dy, dw, dh);
      } else {
        ctx.drawImage(video, dx, dy, dw, dh);
      }
      ctx.restore();

      // Countdown Progress Tick
      if (currentState === STATE.COUNTDOWN) {
        const elapsed = now - countdownStartTime;
        const remaining = Math.max(0, COUNTDOWN_DURATION - elapsed);
        const secondsLeft = Math.ceil(remaining / 1000);

        if (secondsLeft !== lastCountdownSecond && secondsLeft > 0) {
          lastCountdownSecond = secondsLeft;
          playCountdownTick(secondsLeft === 1);
        }

        const progress = 1 - (remaining / COUNTDOWN_DURATION);
        const circumference = 339.29;
        countdownMeter.style.strokeDashoffset = circumference * (1 - progress);
        countdownNumber.textContent = secondsLeft > 0 ? secondsLeft : '📸';

        if (remaining <= 0) {
          captureSnapshot();
        }
      }
    }
  } else {
    // Puzzle Board Outline
    drawPuzzleBoardOutline();

    // Puzzle Pieces (sorted by zIndex)
    const sorted = [...puzzlePieces].sort((a, b) => a.zIndex - b.zIndex);
    for (const p of sorted) {
      drawPuzzlePiece(p);
    }
  }

  // 2. Render Fist Progress Meter (during SOLVED)
  if (currentState === STATE.SOLVED && fistHoldProgress > 0) {
    const fistHand = detectedHands.find(h => h.isFist);
    if (fistHand) {
      drawFistMeter(fistHand.fistPos, fistHoldProgress);
    }
  }

  // 3. Update & Draw Confetti
  updateConfetti();

  // 4. Process Gestures
  processGestures(now);

  requestAnimationFrame(render);
}

// -----------------------------------------------------------------------------
// Visual Rendering Helpers
// -----------------------------------------------------------------------------
function drawPuzzleBoardOutline() {
  const b = boardRect;

  // Board background (Fast, crisp, NO heavy blur)
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.size, b.size, 16);
  ctx.fill();
  ctx.stroke();

  // Grid Guideline Slots (N x N)
  const N = puzzleGridSize;
  const pSize = b.size / N;
  ctx.strokeStyle = 'rgba(26, 115, 232, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);

  for (let i = 1; i < N; i++) {
    ctx.beginPath();
    ctx.moveTo(b.x + i * pSize, b.y);
    ctx.lineTo(b.x + i * pSize, b.y + b.size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(b.x, b.y + i * pSize);
    ctx.lineTo(b.x + b.size, b.y + i * pSize);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPuzzlePiece(p) {
  ctx.save();
  const cx = p.currentX + p.width / 2;
  const cy = p.currentY + p.height / 2;

  ctx.translate(cx, cy);
  ctx.rotate(p.rotation);
  ctx.scale(p.scale, p.scale);

  // Fast visual lift when dragging (clean offset, zero CPU blur)
  if (p === touchDragPiece || p === activeDraggedPiece) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(-p.width / 2 + 4, -p.height / 2 + 6, p.width, p.height);
  }

  // Draw piece image
  ctx.drawImage(p.canvas, -p.width / 2, -p.height / 2, p.width, p.height);

  // Piece Border: Clean uniform border with NO HINTS! (No green color anywhere!)
  ctx.strokeStyle = (p === touchDragPiece || p === activeDraggedPiece) ? '#1a73e8' : '#ffffff';
  ctx.lineWidth = (p === touchDragPiece || p === activeDraggedPiece) ? 2.5 : 1.5;
  ctx.strokeRect(-p.width / 2, -p.height / 2, p.width, p.height);

  ctx.restore();
}

function drawFistMeter(pos, progress) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.strokeStyle = '#fbbc05';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#fbbc05';
  ctx.textAlign = 'center';
  ctx.fillText('HOLD TO SAVE', pos.x, pos.y - 50);
  ctx.restore();
}

function updateConfetti() {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.x += c.vx;
    c.y += c.vy;
    c.rotation += c.vRot;
    if (c.y > window.innerHeight + 20) {
      confetti.splice(i, 1);
    } else {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.width / 2, -c.height / 2, c.width, c.height);
      ctx.restore();
    }
  }
}

// -----------------------------------------------------------------------------
// UI Event Handlers
// -----------------------------------------------------------------------------
btnStartCam.addEventListener('click', async () => {
  if (btnStartCam.disabled) return;
  btnStartCam.disabled = true;
  initAudio();
  try {
    await startCamera();
    await initMediaPipe();
  } finally {
    btnStartCam.disabled = false;
  }
  if (!videoProcessingStarted) {
    videoProcessingStarted = true;
    processVideoFrame();
  }
});

btnFlipCam.addEventListener('click', async () => {
  initAudio();
  facingMode = (facingMode === 'user') ? 'environment' : 'user';
  await startCamera();
});

btnSound.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  document.getElementById('soundIconOn').style.display = soundEnabled ? 'block' : 'none';
  document.getElementById('soundIconOff').style.display = soundEnabled ? 'none' : 'block';
});

btnManualSnap.addEventListener('click', () => {
  startCountdown();
});

btnScatter.addEventListener('click', () => {
  initAudio();
  scatterPieces();
});

btnSave.addEventListener('click', () => {
  initAudio();
  triggerSavePhoto();
});

btnResetCam.addEventListener('click', () => {
  initAudio();
  setAppState(STATE.CAMERA);
});

btnHelp.addEventListener('click', () => {
  helpModal.classList.remove('hidden');
});

btnCloseHelp.addEventListener('click', () => {
  helpModal.classList.add('hidden');
});

btnGotIt.addEventListener('click', () => {
  helpModal.classList.add('hidden');
});

// Difficulty Mode Selection
if (btnDiffEasy && btnDiffHard) {
  btnDiffEasy.addEventListener('click', () => {
    initAudio();
    if (puzzleGridSize === 3) return;
    puzzleGridSize = 3;
    btnDiffEasy.classList.add('active');
    btnDiffHard.classList.remove('active');
    if (capturedImage && (currentState === STATE.PUZZLE || currentState === STATE.SOLVED)) {
      buildPuzzlePieces();
    }
    updateInstructionUI();
  });

  btnDiffHard.addEventListener('click', () => {
    initAudio();
    if (puzzleGridSize === 4) return;
    puzzleGridSize = 4;
    btnDiffHard.classList.add('active');
    btnDiffEasy.classList.remove('active');
    if (capturedImage && (currentState === STATE.PUZZLE || currentState === STATE.SOLVED)) {
      buildPuzzlePieces();
    }
    updateInstructionUI();
  });
}

// Instagram Story Share Handlers
function showCopyToast() {
  if (!copyToast) return;
  copyToast.classList.remove('hidden');
  setTimeout(() => copyToast.classList.add('hidden'), 3500);
}

if (btnCopyTag) {
  btnCopyTag.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('@gdg.ensaf');
      showCopyToast();
    } catch (err) {}
  });
}

function downloadExportBlob() {
  if (!capturedExportBlob) return;
  const fileName = `gdg-ensaf-puzzle-${Date.now()}.jpg`;
  const url = URL.createObjectURL(capturedExportBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

if (btnShareInsta) {
  btnShareInsta.addEventListener('click', async () => {
    initAudio();
    if (!capturedExportBlob) return;

    try {
      await navigator.clipboard.writeText('@gdg.ensaf');
      showCopyToast();
    } catch (err) {}

    const fileName = `gdg-ensaf-puzzle-${Date.now()}.jpg`;
    const file = new File([capturedExportBlob], fileName, { type: 'image/jpeg' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'GDG ENSAF Puzzle Cam',
          text: 'Solved my puzzle on @gdg.ensaf Puzzle Cam! #GDGENSAF #PuzzleCam'
        });
      } catch (err) {}
    } else {
      downloadExportBlob();
    }
  });
}

if (btnDownloadPhoto) {
  btnDownloadPhoto.addEventListener('click', () => {
    initAudio();
    downloadExportBlob();
  });
}

if (btnPlayAgain) {
  btnPlayAgain.addEventListener('click', () => {
    initAudio();
    if (shareModal) shareModal.classList.add('hidden');
    setAppState(STATE.CAMERA);
  });
}

if (btnCloseShare) {
  btnCloseShare.addEventListener('click', () => {
    if (shareModal) shareModal.classList.add('hidden');
  });
}

document.addEventListener('pointerdown', initAudio, { once: true });

// Initialize
resizeCanvas();
requestAnimationFrame(render);
