export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.ambience = new Audio('ambience.mp3');
        this.ambience.loop = true;
        this.ambience.volume = 0.3;

        this.sfxGlitch = new Audio('glitch.mp3');
        this.sfxConfirm = new Audio('confirm.mp3');
        
        this.currentSpeech = null; // Holds the TTS audio object
        this.isSpeaking = false;
        this.speechPaused = false; // Tracks if speech is temporarily halted
        this.playbackAllowed = true; // Gate for new speech
    }

    startAmbience() {
        this.ctx.resume();
        this.ambience.play().catch(e => console.log("Audio play failed", e));
    }

    pauseAmbience() {
        this.ambience.pause();
    }

    resumeAmbience() {
        this.ambience.play();
    }

    playGlitch() {
        this.sfxGlitch.currentTime = 0;
        this.sfxGlitch.play();
    }

    playConfirm() {
        this.sfxConfirm.currentTime = 0;
        this.sfxConfirm.play();
    }

    async speak(text) {
        // Stop any previous speech completely
        if (this.currentSpeech) {
            this.currentSpeech.pause();
            this.currentSpeech = null;
        }

        this.isSpeaking = true;
        this.speechPaused = false;
        
        try {
            // Using a mysterious voice ID for the "Guide"
            const result = await websim.textToSpeech({
                text: text,
                voice: "pNInz6obpgDQGcFmaJgB" // Deep male voice
            });

            this.currentSpeech = new Audio(result.url);
            
            return new Promise((resolve) => {
                this.currentSpeech.onended = () => {
                    this.isSpeaking = false;
                    this.speechPaused = false;
                    this.currentSpeech = null;
                    resolve();
                };
                
                // Only play if we are still allowed to (didn't pause while fetching)
                if (this.playbackAllowed) {
                    this.currentSpeech.play();
                } else {
                    this.speechPaused = true;
                }
            });
        } catch (e) {
            console.error("TTS Error", e);
            this.isSpeaking = false;
            return Promise.resolve();
        }
    }

    // Temporary pause (resumeable)
    pauseSpeech() {
        this.playbackAllowed = false;
        if (this.currentSpeech && !this.currentSpeech.paused) {
            this.currentSpeech.pause();
            this.speechPaused = true;
        }
    }

    // Resume from where left off
    resumeSpeech() {
        this.playbackAllowed = true;
        if (this.currentSpeech && this.speechPaused) {
            this.currentSpeech.play();
            this.speechPaused = false;
        }
    }

    // Hard stop
    stopSpeech() {
        if (this.currentSpeech) {
            this.currentSpeech.pause();
            this.currentSpeech = null;
        }
        this.isSpeaking = false;
        this.speechPaused = false;
    }
}