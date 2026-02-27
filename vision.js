export class VisionSystem {
    constructor(videoElement, canvasElement, onEyeStatusChange, onGestureDetected) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        
        this.onEyeStatusChange = onEyeStatusChange;
        this.onGestureDetected = onGestureDetected;

        this.eyesClosed = false;
        this.faceDetected = false;
        
        // Tracking persistence (to prevent interruptions during shaking/moving)
        this.lastFaceDetectTime = 0;
        this.FACE_LOSS_GRACE_PERIOD = 2000; // 2 seconds of memory
        
        // Cooldowns
        this.lastGestureTime = 0;
        this.GESTURE_COOLDOWN = 600; // Reduced cooldown for fluid gesture streams
        
        // Eye Stability
        this.eyesClosedCounter = 0;
        this.EYES_CLOSED_FRAMES = 5; 
        this.EAR_THRESHOLD = 0.32; 

        // Gesture Thresholds
        this.TURN_THRESHOLD = 0.12; // More sensitive
        this.NOD_THRESHOLD = 0.06;
        
        this.currentEAR = 0;
        this.debugData = "";
    }

    async init() {
        if (!window.Holistic) {
            console.error("MediaPipe Holistic not loaded");
            return;
        }

        this.holistic = new window.Holistic({locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }});

        this.holistic.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.holistic.onResults(this.onResults.bind(this));

        this.camera = new window.Camera(this.video, {
            onFrame: async () => {
                await this.holistic.send({image: this.video});
            },
            width: 640,
            height: 480
        });

        await this.camera.start();
        
        // Ensure canvas matches video resolution once loaded
        this.video.addEventListener('loadeddata', () => {
             this.canvas.width = this.video.videoWidth;
             this.canvas.height = this.video.videoHeight;
        });
    }

    onResults(results) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const now = Date.now();
        const face = results.faceLandmarks;
        const pose = results.poseLandmarks;
        const leftHand = results.leftHandLandmarks;
        const rightHand = results.rightHandLandmarks;

        if (face) {
            this.faceDetected = true;
            this.lastFaceDetectTime = now;
            
            // Draw Feedback
            this.drawDebug(face, pose, leftHand, rightHand);
            
            // Process Logic
            this.processEyes(face);
            
            // Only process gestures if we are stable
            this.processGestures(face, pose, leftHand, rightHand);
        } else {
            // Face lost logic
            if (now - this.lastFaceDetectTime > this.FACE_LOSS_GRACE_PERIOD) {
                this.faceDetected = false;
                // If we've lost the face for too long, enforce eyes open (pause)
                if (this.eyesClosed) {
                    this.eyesClosed = false;
                    this.onEyeStatusChange(false);
                }
            } else {
                // Grace period: Assume previous state holds (don't pause during head shake)
                this.faceDetected = true; 
            }
        }
    }

    processEyes(landmarks) {
        // Simple EAR (Eye Aspect Ratio)
        const leftEAR = this.getEAR(landmarks, 159, 145, 133, 33);
        const rightEAR = this.getEAR(landmarks, 386, 374, 362, 263);

        this.currentEAR = (leftEAR + rightEAR) / 2;
        const rawClosed = this.currentEAR < this.EAR_THRESHOLD;

        if (rawClosed) this.eyesClosedCounter++;
        else this.eyesClosedCounter = 0;

        const stableClosed = rawClosed && (this.eyesClosedCounter > this.EYES_CLOSED_FRAMES);

        if (stableClosed !== this.eyesClosed) {
            this.eyesClosed = stableClosed;
            this.onEyeStatusChange(stableClosed);
        }
    }

    processGestures(face, pose, leftHand, rightHand) {
        const now = Date.now();
        if (now - this.lastGestureTime < this.GESTURE_COOLDOWN) return;

        let detectedActions = [];

        // 1. Head Gestures
        const headGesture = this.detectHeadGesture(face);
        if (headGesture) detectedActions.push(headGesture);

        // 2. Expressions
        const expression = this.detectExpression(face);
        if (expression) detectedActions.push(expression);

        // 3. Hands
        const handsInfo = this.detectHands(leftHand, rightHand);
        if (handsInfo) detectedActions.push(handsInfo);

        // 4. Body Dodge
        const dodge = this.detectDodge(pose);
        if (dodge) detectedActions.push(dodge);

        if (detectedActions.length > 0) {
            this.lastGestureTime = now;
            // Join all simultaneous actions
            this.onGestureDetected(detectedActions.join(", "));
        }
    }

    detectHeadGesture(face) {
        const nose = face[1];
        const leftCheek = face[234];
        const rightCheek = face[454];
        const forehead = face[10];
        const chin = face[152];

        const yaw = nose.x - (leftCheek.x + rightCheek.x) / 2;
        const pitch = nose.y - (forehead.y + chin.y) / 2;

        if (yaw < -this.TURN_THRESHOLD) return "Turn Head Left";
        if (yaw > this.TURN_THRESHOLD) return "Turn Head Right";
        if (pitch < -this.NOD_THRESHOLD) return "Look Up";
        if (pitch > this.NOD_THRESHOLD) return "Nod Down"; // Usually "Yes"
        return null;
    }

    detectExpression(face) {
        // Smile: Mouth corners (61, 291) relative to lips center (0/17)
        // Or simpler: distance between corners vs distance between eyes
        const mouthLeft = face[61];
        const mouthRight = face[291];
        const lipTop = face[13];
        const lipBot = face[14];

        const mouthWidth = this.getDistance(mouthLeft, mouthRight);
        const mouthHeight = this.getDistance(lipTop, lipBot);
        
        // Eye distance as scale reference
        const eyeDist = this.getDistance(face[33], face[263]); 
        
        const smileRatio = mouthWidth / eyeDist; // > 0.55 usually smile
        
        // Frown is harder, usually corners go down relative to center.
        // Using lip corners Y vs lip center Y
        const centerMouthY = (lipTop.y + lipBot.y) / 2;
        const cornersY = (mouthLeft.y + mouthRight.y) / 2;
        
        if (smileRatio > 0.65) return "Smiling";
        if ((cornersY - centerMouthY) > 0.03) return "Frowning"; // Corners lower than center
        return null;
    }

    detectHands(left, right) {
        let gestures = [];
        
        if (left) {
            const fingers = this.countFingers(left);
            gestures.push(`Left Hand: ${fingers} Fingers`);
            if (this.isPointingUp(left)) gestures.push("Left Pointing Up");
        }
        
        if (right) {
            const fingers = this.countFingers(right);
            gestures.push(`Right Hand: ${fingers} Fingers`);
            if (this.isPointingUp(right)) gestures.push("Right Pointing Up");
        }

        if (gestures.length > 0) return gestures.join(", ");
        return null;
    }

    countFingers(landmarks) {
        // Tips: 4, 8, 12, 16, 20
        // PIPs: 2, 6, 10, 14, 18 (Knuckles closer to palm)
        const tips = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky
        const pips = [6, 10, 14, 18];
        
        let count = 0;
        
        // Thumb (4) is special, compare X to IP(3) depending on hand side... 
        // Simplifying: just do 4 fingers for reliability or basic thumb check
        // Check thumb: if Tip(4) is farther from palm base(0) than IP(3)
        // Actually, simple Y check works for 'Hand Up' scenarios.
        
        // Let's assume hand is roughly upright for counting.
        tips.forEach((tipIdx, i) => {
            if (landmarks[tipIdx].y < landmarks[pips[i]].y) count++;
        });

        // Thumb: Check X distance from pinky base
        if (Math.abs(landmarks[4].x - landmarks[17].x) > Math.abs(landmarks[3].x - landmarks[17].x)) {
            count++;
        }

        return count;
    }

    isPointingUp(landmarks) {
        // Index extended, others closed
        const indexUp = landmarks[8].y < landmarks[6].y;
        const middleDown = landmarks[12].y > landmarks[10].y;
        return indexUp && middleDown;
    }

    detectDodge(pose) {
        if (!pose) return null;
        // Nose is index 0
        const nose = pose[0];
        // 0.5 is center. 
        if (nose.x < 0.35) return "Dodge Right"; // Camera mirrored
        if (nose.x > 0.65) return "Dodge Left";
        return null;
    }

    getEAR(landmarks, top, bot, inner, outer) {
        const h = this.getDistance(landmarks[top], landmarks[bot]);
        const w = this.getDistance(landmarks[inner], landmarks[outer]);
        return h / w;
    }

    getDistance(p1, p2) {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    }

    resetGestureCooldown() {
        this.lastGestureTime = 0;
    }

    drawDebug(face, pose, left, right) {
        this.ctx.fillStyle = this.eyesClosed ? '#00ff88' : '#ff3333';
        this.ctx.strokeStyle = '#00ff88';
        this.ctx.lineWidth = 2;

        if (face) {
            // Eyes
            const lx = face[159].x * this.canvas.width;
            const ly = face[159].y * this.canvas.height;
            this.ctx.fillText(this.eyesClosed ? "CLOSED" : "OPEN", lx, ly - 20);
        }

        if (left) this.drawHand(left);
        if (right) this.drawHand(right);
        
        // Stats
        this.ctx.font = "14px monospace";
        this.ctx.fillText(`EAR: ${this.currentEAR.toFixed(2)}`, 10, 20);
    }
    
    drawHand(landmarks) {
        for (let pt of landmarks) {
            this.ctx.beginPath();
            this.ctx.arc(pt.x * this.canvas.width, pt.y * this.canvas.height, 3, 0, 2*Math.PI);
            this.ctx.fill();
        }
    }
}