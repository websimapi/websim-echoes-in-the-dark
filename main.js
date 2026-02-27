import { VisionSystem } from './vision.js';
import { AudioManager } from './audio.js';
import { Narrator } from './ai.js';

const appState = {
    WAITING_START: 0,
    INITIALIZING: 1,
    PLAYING_NARRATION: 2, // Audio speaking, input blocked
    PLAYING_LISTENING: 3, // Waiting for gesture
    PAUSED_EYES_OPEN: 4,
    PROCESSING_AI: 5
};

let currentState = appState.WAITING_START;
let previousState = appState.WAITING_START; // To restore after pause
let listeningTimer = null;
let detectedGestures = new Set(); // Accumulate gestures during listening phase
let vision, audio, narrator;

const ui = {
    intro: document.getElementById('intro-screen'),
    game: document.getElementById('game-screen'),
    loading: document.getElementById('loading'),
    status: document.getElementById('status-overlay'),
    gesture: document.getElementById('gesture-feedback'),
    btn: document.getElementById('start-btn')
};

async function init() {
    ui.btn.addEventListener('click', async () => {
        ui.btn.classList.add('hidden');
        ui.loading.classList.remove('hidden');
        currentState = appState.INITIALIZING;

        // Initialize Systems
        audio = new AudioManager();
        narrator = new Narrator();
        
        const video = document.getElementById('input_video');
        const canvas = document.getElementById('output_canvas');

        vision = new VisionSystem(
            video, 
            canvas, 
            handleEyeStatus, 
            handleGesture
        );

        await vision.init();

        // Wait for face detection loop
        checkFaceDetection();
    });
}

function checkFaceDetection() {
    if (vision.faceDetected) {
        ui.loading.innerHTML = "Face Detected.<br>Calibrating...";
        setTimeout(startGame, 1000);
    } else {
        ui.loading.innerHTML = "Looking for face...<br>Please look at the camera.";
        requestAnimationFrame(checkFaceDetection);
    }
}

function startGame() {
    ui.intro.classList.remove('active');
    ui.intro.classList.add('hidden');
    ui.game.classList.remove('hidden');
    ui.game.classList.add('active');
    
    // Start Game Loop logic
    audio.startAmbience();
    ui.status.innerText = "CLOSE YOUR EYES TO BEGIN";
    ui.status.style.display = 'block';

    // Set state to PAUSED so that closing eyes triggers the start
    currentState = appState.PAUSED_EYES_OPEN;
    previousState = appState.PLAYING_NARRATION; 
    console.log("Game Started. Waiting for eyes to close...");
}

// --- Vision Callbacks ---

function handleEyeStatus(isClosed) {
    if (currentState === appState.WAITING_START || currentState === appState.INITIALIZING) return;

    if (isClosed) {
        document.body.classList.add('eyes-closed');
        document.body.classList.remove('eyes-open');
        
        if (currentState === appState.PAUSED_EYES_OPEN) {
            // Resume based on where we left off
            // If we were listening, restart the listening phase
            // If we were processing or narrating, resume that
            audio.resumeAmbience();
            audio.resumeSpeech();
            
            if (narrator.history.length === 0) {
                // First run
                processTurn(null);
            } else if (previousState === appState.PLAYING_LISTENING) {
                startListeningPhase();
            } else {
                currentState = previousState;
            }
        }
    } else {
        // Eyes Opened - PAUSE EVERYTHING
        document.body.classList.remove('eyes-closed');
        document.body.classList.add('eyes-open');
        
        if (currentState !== appState.PAUSED_EYES_OPEN) {
            previousState = currentState;
            currentState = appState.PAUSED_EYES_OPEN;
            
            // Stop timers
            if (listeningTimer) {
                clearTimeout(listeningTimer);
                listeningTimer = null;
            }

            audio.playGlitch();
            audio.pauseAmbience();
            audio.pauseSpeech();
        }
    }
}

function handleGesture(gestureName) {
    // Only accept gestures if we are strictly in the listening phase
    if (currentState !== appState.PLAYING_LISTENING) return;

    // Split compound gestures if comma separated
    const parts = gestureName.split(', ');
    let newData = false;
    
    parts.forEach(g => {
        if (!detectedGestures.has(g)) {
            detectedGestures.add(g);
            newData = true;
        }
    });

    if (newData) {
        // Visual feedback
        const allGestures = Array.from(detectedGestures).join(', ');
        showFeedback(`${allGestures}`);
        audio.playConfirm();
    }
}

// --- Game Logic ---

async function processTurn(userAction) {
    currentState = appState.PROCESSING_AI;
    showFeedback("Thinking...");
    
    // Get AI response
    const text = await narrator.generateResponse(userAction);
    
    // We only proceed if eyes are still closed (or if we handle pause checks inside)
    // But since generateResponse is async, state might have changed to PAUSED.
    if (currentState === appState.PAUSED_EYES_OPEN) {
        // If paused while thinking, we just wait. The resume logic handles the rest? 
        // No, we need to handle the output.
        // We'll update the previousState so when they resume, it speaks.
        previousState = appState.PLAYING_NARRATION;
        // Queue the speech logic? Simplest is to just wait for resume.
        // However, we have the text now.
        // Let's force state to narration if closed, else let handleEyeStatus pick it up.
        if (vision.eyesClosed) {
             currentState = appState.PLAYING_NARRATION;
             playNarrative(text);
        }
    } else {
        currentState = appState.PLAYING_NARRATION;
        playNarrative(text);
    }
}

async function playNarrative(text) {
    showFeedback("Speaking...");
    await audio.speak(text);
    
    // After speaking, check if we should listen (and eyes still closed)
    if (currentState === appState.PLAYING_NARRATION && vision.eyesClosed) {
        startListeningPhase();
    }
}

function startListeningPhase() {
    currentState = appState.PLAYING_LISTENING;
    detectedGestures.clear(); // Reset gestures for this turn
    showFeedback("Listening (3s)...");
    
    // Allow fresh gestures
    vision.resetGestureCooldown();
    audio.playCue(); // Sound indicating "Your turn"

    if (listeningTimer) clearTimeout(listeningTimer);
    
    listeningTimer = setTimeout(() => {
        if (currentState === appState.PLAYING_LISTENING) {
            
            const actions = Array.from(detectedGestures);
            if (actions.length > 0) {
                const actionString = actions.join(" and ");
                console.log("Turn processed with actions:", actionString);
                processTurn(`I perform the action(s): ${actionString}`);
            } else {
                console.log("Listening timeout - Silence detected");
                processTurn("I stay silent and do nothing.");
            }
        }
    }, 4000); // 4 seconds listening window
}

let feedbackTimer = null;
function showFeedback(text) {
    ui.gesture.innerText = text;
    ui.gesture.style.opacity = 1;
    
    if (feedbackTimer) clearTimeout(feedbackTimer);
    
    feedbackTimer = setTimeout(() => {
        ui.gesture.style.opacity = 0;
    }, 2000);
}

// Start
init();