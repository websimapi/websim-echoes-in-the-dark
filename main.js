import { VisionSystem } from './vision.js';
import { AudioManager } from './audio.js';
import { Narrator } from './ai.js';

const appState = {
    WAITING_START: 0,
    INITIALIZING: 1,
    PLAYING: 2,
    PAUSED_EYES_OPEN: 3,
    PROCESSING_TURN: 4
};

let currentState = appState.WAITING_START;
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
    console.log("Game Started. Waiting for eyes to close...");
}

// --- Vision Callbacks ---

function handleEyeStatus(isClosed) {
    if (currentState === appState.WAITING_START || currentState === appState.INITIALIZING) return;

    if (isClosed) {
        document.body.classList.add('eyes-closed');
        document.body.classList.remove('eyes-open');
        
        if (currentState === appState.PAUSED_EYES_OPEN) {
            // Resume
            currentState = appState.PLAYING;
            audio.resumeAmbience();
            audio.resumeSpeech(); // Resume TTS if it was playing
            
            // If we haven't started the story yet, start it now
            if (narrator.history.length === 0) {
                advanceStory(null);
            }
        }
    } else {
        // Eyes Opened
        document.body.classList.remove('eyes-closed');
        document.body.classList.add('eyes-open');
        
        if (currentState === appState.PLAYING || currentState === appState.PROCESSING_TURN) {
            currentState = appState.PAUSED_EYES_OPEN;
            audio.playGlitch();
            audio.pauseAmbience();
            audio.pauseSpeech(); // Pause TTS cleanly to resume later
        }
    }
}

function handleGesture(gestureName) {
    // Only accept gestures if playing and not currently speaking/processing
    if (currentState !== appState.PLAYING) return;
    if (audio.isSpeaking) return; // Don't interrupt narrator

    // Visual feedback (briefly visible if user peeks, but mostly for debug)
    showFeedback(`Action: ${gestureName}`);
    audio.playConfirm();

    // Send to AI
    advanceStory(`I perform the action: ${gestureName}`);
}

// --- Game Logic ---

async function advanceStory(userAction) {
    currentState = appState.PROCESSING_TURN;
    
    // Slight delay for effect
    showFeedback("Listening...");
    
    // Get AI response
    const text = await narrator.generateResponse(userAction);
    
    // Check if eyes are still closed before speaking
    if (vision.eyesClosed) {
        currentState = appState.PLAYING;
        await audio.speak(text);
        showFeedback("Waiting for action...");
    }
}

function showFeedback(text) {
    ui.gesture.innerText = text;
    ui.gesture.style.opacity = 1;
    setTimeout(() => {
        ui.gesture.style.opacity = 0;
    }, 2000);
}

// Start
init();