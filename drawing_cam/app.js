/**
 * GDG ENSAF DRAWING CAM
 * ======================
 * Interactive AR Drawing Game for Google Developer Groups On Campus ENSA Fez.
 * - Draw with finger in the air (MediaPipe Hands index tip) or on mobile screen
 * - Google 4-Color Palette: Blue, Red, Yellow, Green & Eraser
 * - GDG Logo Bracket Stencil Guide (< >)
 * - HD Photo Capture with Official GDG ENSAF Watermark
 * - Direct Instagram Story Sharing with @gdg.ensaf auto-tagging
 */

// UI Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');

const btnFlipCam = document.getElementById('btnFlipCam');
const btnSound = document.getElementById('btnSound');
const btnHelp = document.getElementById('btnHelp');
const helpModal = document.getElementById('helpModal');
const btnCloseHelp = document.getElementById('btnCloseHelp');
const btnGotIt = document.getElementById('btnGotIt');

const colorSwatches = document.querySelectorAll('.color-swatch');
const btnBrushSize = document.getElementById('btnBrushSize');
const brushIndicator = document.getElementById('brushIndicator');
const btnTemplate = document.getElementById('btnTemplate');
const btnUndo = document.getElementById('btnUndo');
const btnClear = document.getElementById('btnClear');

const btnSnapPhoto = document.getElementById('btnSnapPhoto');
const screenFlash = document.getElementById('screenFlash');

const shareModal = document.getElementById('shareModal');
const btnCloseShare = document.getElementById('btnCloseShare');
const sharePreviewImg = document.getElementById('sharePreviewImg');
const btnShareInsta = document.getElementById('btnShareInsta');
const btnDownloadPhoto = document.getElementById('btnDownloadPhoto');
const btnDrawAgain = document.getElementById('btnDrawAgain');
const btnCopyTag = document.getElementById('btnCopyTag');
const copyToast = document.getElementById('copyToast');

const startScreen = document.getElementById('startScreen');
const btnStartCam = document.getElementById('btnStartCam');

// Preload Official Logo
const gdgLogo = new Image();
gdgLogo.src = '../logo.png';
let isLogoLoaded = false;
gdgLogo.onload = () => { isLogoLoaded = true; };

// Camera & State
let facingMode = 'user'; // 'user' (front) or 'environment' (rear)
let cameraStream = null;
let soundEnabled = true;

// MediaPipe Hands
let handsDetector = null;
let isHandsReady = false;
let airCursor = null; // { x, y, isDrawing }
let lastHandProcessTime = 0;
let lastProcessedVideoTime = -1;
let videoProcessingStarted = false;

// Drawing State
let currentColor = '#4285f4'; // Google Blue by default
let isEraser = false;
const BRUSH_SIZES = [5, 10, 18];
let currentBrushSizeIndex = 1; // Medium (10px)
let showTemplate = true; // Show GDG logo stencil guide by default

let strokes = []; // Array of completed strokes: { color, width, isEraser, points: [{x,y}] }
let activeTouchStroke = null;
let activeAirStroke = null;

// Reuse the exact vector geometry; keep stroke order and eraser compositing intact.
const strokePaths = new WeakMap();

let capturedExportBlob = null;
let capturedExportUrl = null;

// -----------------------------------------------------------------------------
// Web Audio Synthesizer
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
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    g.gain.setValueAtTime(gain, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function playShutterSound() {
  if (!soundEnabled || !audioCtx) return;
  try {
    const bufSize = audioCtx.sampleRate * 0.1;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.25));
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.3, audioCtx.currentTime);
    noise.connect(g);
    g.connect(audioCtx.destination);
    noise.start();
  } catch (e) {}
}

// -----------------------------------------------------------------------------
// Canvas & Screen Resizing
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
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 200));

// -----------------------------------------------------------------------------
// Camera Setup
// -----------------------------------------------------------------------------
async function startCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
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
    await new Promise(res => {
      video.onloadedmetadata = () => {
        video.play();
        res();
      };
    });

    if (startScreen) startScreen.classList.add('hidden');
  } catch (err) {
    console.error('Camera error:', err);
    alert('Camera permission denied or camera unavailable. Please check settings.');
  }
}

// -----------------------------------------------------------------------------
// MediaPipe Hands Setup (for In-the-Air Drawing)
// -----------------------------------------------------------------------------
async function initMediaPipe() {
  if (isHandsReady) return;
  if (typeof Hands === 'undefined') {
    console.warn('Hands library not loaded. Retrying...');
    setTimeout(initMediaPipe, 500);
    return;
  }

  let handsBase = '../puzzle_cam/vendor/mediapipe/';
  try {
    const probe = await fetch('../puzzle_cam/vendor/mediapipe/hands.binarypb', { method: 'HEAD' });
    if (!probe.ok) handsBase = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/';
  } catch (e) {
    handsBase = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/';
  }

  try {
    handsDetector = new Hands({
      locateFile: (file) => `${handsBase}${file}`
    });
    handsDetector.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });
    handsDetector.onResults(onHandResults);
    isHandsReady = true;
    console.log('[+] MediaPipe Hands initialized for AR air drawing');
  } catch (err) {
    console.warn('Hands initialization warning:', err);
  }
}

function onHandResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    airCursor = null;
    if (activeAirStroke) {
      strokes.push(activeAirStroke);
      activeAirStroke = null;
    }
    return;
  }

  const rawLandmarks = results.multiHandLandmarks[0];
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const isMirrored = (facingMode === 'user');

  // Index finger tip (Landmark 8)
  const tipLm = rawLandmarks[8];
  const tipX = (isMirrored ? (1.0 - tipLm.x) : tipLm.x) * viewW;
  const tipY = tipLm.y * viewH;

  // Thumb tip (Landmark 4) to detect pinch-to-pause
  const thumbLm = rawLandmarks[4];
  const thumbX = (isMirrored ? (1.0 - thumbLm.x) : thumbLm.x) * viewW;
  const thumbY = thumbLm.y * viewH;

  // Wrist to Middle MCP scale
  const wrist = rawLandmarks[0];
  const middleMcp = rawLandmarks[9];
  const handScale = Math.hypot((wrist.x - middleMcp.x) * viewW, (wrist.y - middleMcp.y) * viewH) || 120;

  // Pinch check: if thumb and index pinch, PAUSE drawing (pen lift)
  const pinchDist = Math.hypot(thumbX - tipX, thumbY - tipY);
  const isPinching = (pinchDist / handScale < 0.38);

  // If pointing (not pinching) -> DRAWING!
  const isAirDrawing = !isPinching;

  airCursor = {
    x: tipX,
    y: tipY,
    isDrawing: isAirDrawing
  };

  // If user is currently touching the screen with their finger, let touch take priority!
  if (activeTouchStroke) return;

  if (isAirDrawing) {
    if (!activeAirStroke) {
      activeAirStroke = {
        color: currentColor,
        width: BRUSH_SIZES[currentBrushSizeIndex],
        isEraser: isEraser,
        points: [{ x: tipX, y: tipY }]
      };
      playTone(480, 'sine', 0.04, 0.08);
    } else {
      activeAirStroke.points.push({ x: tipX, y: tipY });
    }
  } else {
    // Pen lifted
    if (activeAirStroke) {
      strokes.push(activeAirStroke);
      activeAirStroke = null;
    }
  }
}

async function processVideoFrame() {
  if (!document.hidden && video && video.readyState >= 2 && video.currentTime !== lastProcessedVideoTime) {
    const now = performance.now();
    try {
      // Run hands inference if ready, not currently touch-dragging, and throttled to ~25fps
      if (isHandsReady && handsDetector && !activeTouchStroke && (now - lastHandProcessTime > 40)) {
        lastHandProcessTime = now;
        lastProcessedVideoTime = video.currentTime;
        await handsDetector.send({ image: video });
      }
    } catch (e) {}
  }
  requestAnimationFrame(processVideoFrame);
}

// -----------------------------------------------------------------------------
// Touch / Pointer Drawing Engine (Direct on Mobile Screen)
// -----------------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  activeTouchStroke = {
    color: currentColor,
    width: BRUSH_SIZES[currentBrushSizeIndex],
    isEraser: isEraser,
    points: [{ x, y }]
  };
  canvas.setPointerCapture(e.pointerId);
  playTone(500, 'sine', 0.04, 0.08);
});

canvas.addEventListener('pointermove', (e) => {
  if (!activeTouchStroke) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  activeTouchStroke.points.push({ x, y });
});

function endTouchStroke(e) {
  if (activeTouchStroke) {
    if (activeTouchStroke.points.length > 0) {
      strokes.push(activeTouchStroke);
    }
    activeTouchStroke = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (err) {}
  }
}

canvas.addEventListener('pointerup', endTouchStroke);
canvas.addEventListener('pointercancel', endTouchStroke);

// -----------------------------------------------------------------------------
// GDG Logo Stencil Guide Rendering (< > Brackets)
// -----------------------------------------------------------------------------
function drawGDGTemplate(targetCtx, w, h, opacity = 0.35) {
  targetCtx.save();
  targetCtx.globalAlpha = opacity;
  targetCtx.lineWidth = 14;
  targetCtx.lineCap = 'round';
  targetCtx.lineJoin = 'round';

  const cx = w / 2;
  const cy = h / 2 - 20;
  const size = Math.min(w * 0.38, h * 0.28, 150);

  // Left Bracket: <
  // Top Diagonal: Google Blue
  targetCtx.strokeStyle = '#4285f4';
  targetCtx.beginPath();
  targetCtx.moveTo(cx - 20, cy - size);
  targetCtx.lineTo(cx - 20 - size * 0.85, cy);
  targetCtx.stroke();

  // Bottom Diagonal: Google Red
  targetCtx.strokeStyle = '#ea4335';
  targetCtx.beginPath();
  targetCtx.moveTo(cx - 20 - size * 0.85, cy);
  targetCtx.lineTo(cx - 20, cy + size);
  targetCtx.stroke();

  // Right Bracket: >
  // Top Diagonal: Google Yellow
  targetCtx.strokeStyle = '#fbbc05';
  targetCtx.beginPath();
  targetCtx.moveTo(cx + 20, cy - size);
  targetCtx.lineTo(cx + 20 + size * 0.85, cy);
  targetCtx.stroke();

  // Bottom Diagonal: Google Green
  targetCtx.strokeStyle = '#34a853';
  targetCtx.beginPath();
  targetCtx.moveTo(cx + 20 + size * 0.85, cy);
  targetCtx.lineTo(cx + 20, cy + size);
  targetCtx.stroke();

  // Central Faint Text Guide
  targetCtx.fillStyle = '#ffffff';
  targetCtx.font = 'bold 13px "Google Sans", sans-serif';
  targetCtx.textAlign = 'center';
  targetCtx.fillText('TRACE GDG LOGO', cx, cy + size + 28);

  targetCtx.restore();
}

// -----------------------------------------------------------------------------
// Stroke Drawing Helper
// -----------------------------------------------------------------------------
function renderStroke(targetCtx, stroke) {
  if (!stroke.points || stroke.points.length === 0) return;

  targetCtx.save();
  if (stroke.isEraser) {
    targetCtx.globalCompositeOperation = 'destination-out';
    targetCtx.strokeStyle = 'rgba(0,0,0,1)';
    targetCtx.lineWidth = stroke.width * 2.2;
  } else {
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.strokeStyle = stroke.color;
    targetCtx.lineWidth = stroke.width;
  }

  targetCtx.lineCap = 'round';
  targetCtx.lineJoin = 'round';

  const pts = stroke.points;
  if (pts.length === 1) {
    targetCtx.beginPath();
    targetCtx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
    targetCtx.fillStyle = stroke.isEraser ? 'rgba(0,0,0,1)' : stroke.color;
    targetCtx.fill();
    targetCtx.restore();
    return;
  }

  let cached = strokePaths.get(stroke);
  if (!cached || cached.pointCount !== pts.length) {
    const canAppend = cached && cached.pointCount < pts.length;
    const basePath = canAppend ? cached.basePath : new Path2D();
    if (!canAppend) basePath.moveTo(pts[0].x, pts[0].y);
    // Append only new stable curves while a stroke grows. Its provisional final
    // line is kept separate so it never becomes part of the saved geometry.
    const firstCurve = canAppend ? Math.max(1, cached.pointCount - 1) : 1;
    for (let i = firstCurve; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      basePath.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    const path = new Path2D(basePath);
    path.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    cached = { basePath, path, pointCount: pts.length };
    strokePaths.set(stroke, cached);
  }
  targetCtx.stroke(cached.path);
  targetCtx.restore();
}

// -----------------------------------------------------------------------------
// Main Render Loop (60 FPS)
// -----------------------------------------------------------------------------
function render() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  ctx.clearRect(0, 0, viewW, viewH);

  // 1. Draw Live Camera Feed
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
  }

  // 2. Draw GDG Stencil Guide (if enabled)
  if (showTemplate) {
    drawGDGTemplate(ctx, viewW, viewH, 0.4);
  }

  // 3. Draw Completed Strokes
  for (const s of strokes) {
    renderStroke(ctx, s);
  }

  // 4. Draw Active Strokes (Touch & Air)
  if (activeTouchStroke) {
    renderStroke(ctx, activeTouchStroke);
  }
  if (activeAirStroke) {
    renderStroke(ctx, activeAirStroke);
  }

  // 5. Draw Air Cursor Indicator
  if (airCursor) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(airCursor.x, airCursor.y, isEraser ? 16 : BRUSH_SIZES[currentBrushSizeIndex] + 4, 0, Math.PI * 2);
    ctx.fillStyle = airCursor.isDrawing ? (isEraser ? 'rgba(255,255,255,0.7)' : currentColor) : 'rgba(255,255,255,0.4)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  requestAnimationFrame(render);
}

// -----------------------------------------------------------------------------
// Photo Capture & Watermark Compositing
// -----------------------------------------------------------------------------
function captureDrawingPhoto() {
  playShutterSound();

  // Screen Flash
  screenFlash.classList.add('flash-active');
  setTimeout(() => screenFlash.classList.remove('flash-active'), 250);

  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  // 1080x1080 High-Resolution Square Export
  const exportSize = 1080;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = exportSize;
  outCanvas.height = exportSize;
  const oCtx = outCanvas.getContext('2d');

  // Background gradient fill
  const bgGrad = oCtx.createLinearGradient(0, 0, 0, exportSize);
  bgGrad.addColorStop(0, '#bfe4fa');
  bgGrad.addColorStop(0.4, '#e2f2fd');
  bgGrad.addColorStop(1, '#ffffff');
  oCtx.fillStyle = bgGrad;
  oCtx.fillRect(0, 0, exportSize, exportSize);

  // Crop camera feed to square
  const squareSize = Math.min(viewW, viewH) * 0.84;
  const cropX = (viewW - squareSize) / 2;
  const cropY = (viewH - squareSize) / 2;

  const pad = 80;
  const imgSize = exportSize - pad * 2;

  // Draw Camera Frame
  const tempVCanvas = document.createElement('canvas');
  tempVCanvas.width = viewW;
  tempVCanvas.height = viewH;
  const tvCtx = tempVCanvas.getContext('2d');

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
    tvCtx.translate(viewW, 0);
    tvCtx.scale(-1, 1);
    tvCtx.drawImage(video, dx, dy, dw, dh);
  } else {
    tvCtx.drawImage(video, dx, dy, dw, dh);
  }

  // Draw Drawings onto temp canvas
  for (const s of strokes) {
    renderStroke(tvCtx, s);
  }

  // Draw Cropped Photo + Drawings into HD Canvas with rounded corners & shadow
  oCtx.save();
  oCtx.shadowColor = 'rgba(66, 133, 244, 0.25)';
  oCtx.shadowBlur = 35;
  oCtx.shadowOffsetY = 14;

  oCtx.beginPath();
  oCtx.roundRect(pad, pad, imgSize, imgSize, 28);
  oCtx.clip();
  oCtx.drawImage(tempVCanvas, cropX, cropY, squareSize, squareSize, pad, pad, imgSize, imgSize);
  oCtx.restore();

  // Photo Border
  oCtx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  oCtx.lineWidth = 4;
  oCtx.beginPath();
  oCtx.roundRect(pad, pad, imgSize, imgSize, 28);
  oCtx.stroke();

  // Header Pill Watermark on Photo
  if (isLogoLoaded) {
    const badgeW = 160;
    const badgeH = 46;
    const badgeX = pad + imgSize - badgeW - 18;
    const badgeY = pad + 18;

    oCtx.save();
    oCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    oCtx.beginPath();
    oCtx.roundRect(badgeX, badgeY, badgeW, badgeH, 23);
    oCtx.fill();
    oCtx.restore();

    oCtx.drawImage(gdgLogo, badgeX + 8, badgeY + 6, 34, 34);

    oCtx.fillStyle = '#202124';
    oCtx.font = 'bold 12px "Google Sans", sans-serif';
    oCtx.fillText('GDG ENSAF', badgeX + 46, badgeY + 20);

    oCtx.fillStyle = '#1a73e8';
    oCtx.font = 'bold 9.5px "Google Sans", sans-serif';
    oCtx.fillText('ON CAMPUS', badgeX + 46, badgeY + 34);
  }

  // Footer Branding with @gdg.ensaf Tag
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
  oCtx.fillText('On Campus Fez • @gdg.ensaf', isLogoLoaded ? 140 : 80, footerY + 30);

  oCtx.fillStyle = '#5f6368';
  oCtx.font = '14px sans-serif';
  oCtx.textAlign = 'right';
  oCtx.fillText(new Date().toLocaleDateString(), exportSize - 80, footerY + 20);

  // Convert to Blob and show modal
  outCanvas.toBlob((blob) => {
    if (!blob) return;
    capturedExportBlob = blob;
    if (capturedExportUrl) URL.revokeObjectURL(capturedExportUrl);
    capturedExportUrl = URL.createObjectURL(blob);

    sharePreviewImg.src = capturedExportUrl;
    shareModal.classList.remove('hidden');
  }, 'image/jpeg', 0.95);
}

// -----------------------------------------------------------------------------
// Instagram Story Sharing & Saving
// -----------------------------------------------------------------------------
function showCopyToast() {
  copyToast.classList.remove('hidden');
  setTimeout(() => copyToast.classList.add('hidden'), 3500);
}

btnCopyTag.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('@gdg.ensaf');
    showCopyToast();
  } catch (err) {}
});

btnShareInsta.addEventListener('click', async () => {
  initAudio();
  if (!capturedExportBlob) return;

  // 1. Auto-copy @gdg.ensaf to clipboard so user can paste it in their Story!
  try {
    await navigator.clipboard.writeText('@gdg.ensaf');
    showCopyToast();
  } catch (err) {}

  const fileName = `gdg-drawing-${Date.now()}.jpg`;
  const file = new File([capturedExportBlob], fileName, { type: 'image/jpeg' });

  // 2. Invoke Web Share API (which triggers native Instagram Stories share sheet on mobile!)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'GDG ENSAF Drawing',
        text: 'Drawn with @gdg.ensaf Drawing Cam! #GDGENSAF #GoogleDeveloperGroups'
      });
    } catch (err) {
      // User cancelled share sheet -> fallback to download
    }
  } else {
    // Desktop fallback: download photo and notify
    downloadExportBlob();
  }
});

function downloadExportBlob() {
  if (!capturedExportBlob) return;
  const fileName = `gdg-drawing-${Date.now()}.jpg`;
  const url = URL.createObjectURL(capturedExportBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

btnDownloadPhoto.addEventListener('click', () => {
  initAudio();
  downloadExportBlob();
});

btnDrawAgain.addEventListener('click', () => {
  initAudio();
  shareModal.classList.add('hidden');
});

btnCloseShare.addEventListener('click', () => {
  shareModal.classList.add('hidden');
});

// -----------------------------------------------------------------------------
// UI Control Event Handlers
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

btnSnapPhoto.addEventListener('click', () => {
  captureDrawingPhoto();
});

// Color Swatches
colorSwatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    initAudio();
    colorSwatches.forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');

    const col = swatch.getAttribute('data-color');
    if (col === 'eraser') {
      isEraser = true;
      brushIndicator.style.background = '#80868b';
    } else {
      isEraser = false;
      currentColor = col;
      brushIndicator.style.background = col;
    }
    playTone(550, 'sine', 0.05, 0.1);
  });
});

// Brush Size Toggle
btnBrushSize.addEventListener('click', () => {
  initAudio();
  currentBrushSizeIndex = (currentBrushSizeIndex + 1) % BRUSH_SIZES.length;
  const size = BRUSH_SIZES[currentBrushSizeIndex];
  const indSize = size === 5 ? 6 : (size === 10 ? 10 : 16);
  brushIndicator.style.width = indSize + 'px';
  brushIndicator.style.height = indSize + 'px';
  playTone(600, 'sine', 0.05, 0.1);
});

// Toggle Template Stencil Guide
btnTemplate.addEventListener('click', () => {
  initAudio();
  showTemplate = !showTemplate;
  btnTemplate.classList.toggle('active-tool', showTemplate);
  playTone(showTemplate ? 650 : 450, 'sine', 0.05, 0.1);
});

// Undo Stroke
btnUndo.addEventListener('click', () => {
  initAudio();
  if (strokes.length > 0) {
    strokes.pop();
    playTone(380, 'sine', 0.06, 0.1);
  }
});

// Clear All
btnClear.addEventListener('click', () => {
  initAudio();
  if (strokes.length > 0) {
    strokes = [];
    playTone(300, 'sine', 0.08, 0.12);
  }
});

// Help Modal
btnHelp.addEventListener('click', () => {
  helpModal.classList.remove('hidden');
});
btnCloseHelp.addEventListener('click', () => {
  helpModal.classList.add('hidden');
});
btnGotIt.addEventListener('click', () => {
  helpModal.classList.add('hidden');
});

document.addEventListener('pointerdown', initAudio, { once: true });

// Initialize Canvas
resizeCanvas();
requestAnimationFrame(render);

