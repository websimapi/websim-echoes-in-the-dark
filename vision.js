export class VisionSystem {
    constructor(videoElement, canvasElement, onEyeStatusChange, onGestureDetected) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        
        this.onEyeStatusChange = onEyeStatusChange;
        this.onGestureDetected = onGestureDetected;

        this.eyesClosed = false;
        this.lastEyeState = false; // false = open
        this.faceDetected = false;
        
        // Cooldowns
        this.lastGestureTime = 0;
        this.GESTURE_COOLDOWN = 1500;
        
        // Thresholds
        this.EAR_THRESHOLD = 0.25; 
        this.TURN_THRESHOLD = 0.15;
        this.NOD_THRESHOLD = 0.08; 
    }

    async init() {
        if (!window.FaceMesh) {
            console.error("MediaPipe FaceMesh not loaded");
            return;
        }

        this.faceMesh = new window.FaceMesh({locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }});

        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.faceMesh.onResults(this.onResults.bind(this));

        this.camera = new window.Camera(this.video, {
            onFrame: async () => {
                await this.faceMesh.send({image: this.video});
            },
            width: 640,
            height: 480
        });

        await this.camera.start();
    }

    onResults(results) {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Check if face is present
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            this.faceDetected = true;
            const landmarks = results.multiFaceLandmarks[0];
            
            this.drawDebug(landmarks);
            this.processEyes(landmarks);
            this.processGestures(landmarks);
        } else {
            this.faceDetected = false;
            // If face lost, assume eyes open (pauses game)
            if (this.eyesClosed) {
                this.eyesClosed = false;
                this.onEyeStatusChange(false);
            }
        }
    }

    processEyes(landmarks) {
        // Simple EAR (Eye Aspect Ratio) approximation
        // Left Eye indices
        const leftEyeTop = landmarks[159];
        const leftEyeBottom = landmarks[145];
        const leftEyeInner = landmarks[133];
        const leftEyeOuter = landmarks[33];
        
        // Right Eye indices
        const rightEyeTop = landmarks[386];
        const rightEyeBottom = landmarks[374];
        const rightEyeInner = landmarks[362];
        const rightEyeOuter = landmarks[263];

        const leftOpen = this.getDistance(leftEyeTop, leftEyeBottom) / this.getDistance(leftEyeInner, leftEyeOuter);
        const rightOpen = this.getDistance(rightEyeTop, rightEyeBottom) / this.getDistance(rightEyeInner, rightEyeOuter);

        const avgOpen = (leftOpen + rightOpen) / 2;
        const isClosed = avgOpen < this.EAR_THRESHOLD;

        if (isClosed !== this.eyesClosed) {
            this.eyesClosed = isClosed;
            this.onEyeStatusChange(isClosed);
        }
    }

    processGestures(landmarks) {
        const now = Date.now();
        if (now - this.lastGestureTime < this.GESTURE_COOLDOWN) return;

        // Use nose tip (1) relative to face center
        const nose = landmarks[1];
        const leftCheek = landmarks[234];
        const rightCheek = landmarks[454];
        const forehead = landmarks[10];
        const chin = landmarks[152];

        // Horizontal Turn (Yaw)
        // Check nose X position relative to cheek midpoints
        const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
        const yaw = nose.x - faceCenterX; // + is Left (mirrored), - is Right

        // Vertical Nod (Pitch)
        const faceCenterY = (forehead.y + chin.y) / 2;
        const pitch = nose.y - faceCenterY; // Relative shift

        // Note: Camera input is typically unmirrored raw frames
        // Turning head LEFT -> Nose x decreases -> Yaw negative
        if (yaw < -this.TURN_THRESHOLD) {
            this.triggerGesture("Turn Head Left");
        } else if (yaw > this.TURN_THRESHOLD) {
            this.triggerGesture("Turn Head Right");
        } else if (nose.y < (forehead.y + chin.y)/2 - this.NOD_THRESHOLD) {
             // Look Up
             this.triggerGesture("Look Up");
        } else if (nose.y > (forehead.y + chin.y)/2 + this.NOD_THRESHOLD) {
            // Look Down/Nod
            this.triggerGesture("Nod");
        }
    }

    triggerGesture(name) {
        this.lastGestureTime = Date.now();
        this.onGestureDetected(name);
    }

    drawDebug(landmarks) {
        this.ctx.fillStyle = '#00ff88';
        this.ctx.strokeStyle = '#00ff88';
        this.ctx.lineWidth = 1;

        // Draw basic face mesh points (sparse)
        const indices = [1, 33, 263, 133, 362, 10, 152]; // Key points
        
        for (let i of indices) {
            const pt = landmarks[i];
            const x = pt.x * this.canvas.width;
            const y = pt.y * this.canvas.height;
            
            this.ctx.beginPath();
            this.ctx.arc(x, y, 2, 0, 2 * Math.PI);
            this.ctx.fill();
        }
        
        // Draw Eyes outline roughly
        this.drawEye(landmarks, [33, 160, 158, 133, 153, 144]);
        this.drawEye(landmarks, [362, 385, 387, 263, 373, 380]);
    }

    drawEye(landmarks, indices) {
        this.ctx.beginPath();
        const first = landmarks[indices[0]];
        this.ctx.moveTo(first.x * this.canvas.width, first.y * this.canvas.height);
        
        for (let i = 1; i < indices.length; i++) {
            const pt = landmarks[indices[i]];
            this.ctx.lineTo(pt.x * this.canvas.width, pt.y * this.canvas.height);
        }
        this.ctx.closePath();
        this.ctx.stroke();
    }

    getDistance(p1, p2) {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    }
}