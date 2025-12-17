// main.js - Core Three.js and API Integration

import * as THREE from 'three';

// --- CONFIGURATION ---
const NUM_PARTICLES = 150000;
const BACKEND_URL = 'http://localhost:3000'; // Match backend port

// Particle Templates (Simplified structures for demo)
const particleTemplates = {
    heart: (i) => {
        const t = i / NUM_PARTICLES * 2.0 * Math.PI;
        // Simple 2D heart shape (Cardioid)
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return new THREE.Vector3(x * 0.2, y * 0.2, 0);
    },
    spiral: (i) => {
        const radius = i / NUM_PARTICLES * 20;
        const angle = i * 0.1;
        return new THREE.Vector3(radius * Math.cos(angle), radius * Math.sin(angle), i * 0.01 - 10);
    },
    ring: (i) => {
        const angle = i / NUM_PARTICLES * 2 * Math.PI;
        const radius = 8 + (Math.random() - 0.5) * 1; // Saturn ring radius
        return new THREE.Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle));
    },
    fireworks: () => {
        // Random sphere burst
        return new THREE.Vector3(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
    }
};

let currentTemplateName = 'heart';
let targetTemplateName = 'heart';
let morphTime = 0;
const MORPH_DURATION = 1.0; // Seconds

// --- THREE.js SETUP ---
let scene, camera, renderer, particles, videoElement, mediaRecorder, recordedChunks = [];
let recordingStatus = 'idle';
const clock = new THREE.Clock();
let videoStream = null;

// Uniforms for the shader
const uniforms = {
    uTime: { value: 0.0 },
    uMorphFactor: { value: 0.0 },
    uGravity: { value: -0.05 },
    uNoiseScale: { value: 0.2 },
    uParticleSpread: { value: 1.0 },
    uAttractionPoint: { value: new THREE.Vector3(0, 0, 0) }
};

// --- HAND TRACKING & GESTURE STATE ---
let hands, handTrackerConfigured = false;
let gestureState = {
    openPalm: false,
    closedFist: false,
    swipeDetected: false,
    prevX: null,
};

// --- INITIALIZATION ---

async function init() {
    // 5. Consent Check
    if (!document.getElementById('consent-button')) return;

    document.getElementById('consent-button').addEventListener('click', async () => {
        document.getElementById('consent-modal').style.display = 'none';
        
        // 2. Camera Access (WebRTC)
        await setupCamera();
        
        // 1. Core 3D Particle System Setup
        setupThreeJS();
        
        // 2. Hand Tracking Setup
        setupMediaPipe();

        // 3. Live Video Capture & Recording
        if (document.getElementById('telegram-save-toggle').checked) {
            startRecording();
        }

        // Start the main loop
        animate();
    });
}

// --- SETUP FUNCTIONS ---

async function setupCamera() {
    videoElement = document.getElementById('video-background');
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        videoElement.srcObject = videoStream;
        await new Promise(resolve => videoElement.onloadedmetadata = resolve);
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Camera access denied. Particle system will run without live background/tracking.");
    }
}

async function setupMediaPipe() {
    // MediaPipe Hands setup
    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
    });
    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onResults);

    // Start video processing
    if (videoElement.srcObject) {
        handTrackerConfigured = true;
        // The process loop is handled within the animate function for performance
    }
}

function setupThreeJS() {
    const container = document.getElementById('canvas-container');
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Camera
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 25;

    // Scene
    scene = new THREE.Scene();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0); // Transparent background to show video
    container.appendChild(renderer.domElement);

    // Load Shaders (In a real app, you'd fetch these)
    const vertexShader = document.querySelector('[href="./shaders/particle.vert.glsl"]').import;
    const fragmentShader = document.querySelector('[href="./shaders/particle.frag.glsl"]').import;

    // Create Particle System
    createParticles(currentTemplateName, currentTemplateName);

    window.addEventListener('resize', onWindowResize);
    document.getElementById('particle-mode-selector').addEventListener('change', (e) => {
        changeParticleTemplate(e.target.value);
    });
}

// --- PARTICLE CREATION & MORPHING LOGIC ---

function createParticles(startName, endName) {
    if (particles) scene.remove(particles);

    const geometry = new THREE.InstancedBufferGeometry();
    const positions = [];
    const uvs = [];
    const indices = [];

    // Create one point for each instance
    positions.push(0, 0, 0);
    uvs.push(0, 0);
    indices.push(0);

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
    geometry.instanceCount = NUM_PARTICLES;

    // Custom Attributes for Shader
    const startPositions = new Float32Array(NUM_PARTICLES * 3);
    const endPositions = new Float32Array(NUM_PARTICLES * 3);
    const pIndices = new Float32Array(NUM_PARTICLES);

    const startTemplate = particleTemplates[startName];
    const endTemplate = particleTemplates[endName];

    for (let i = 0; i < NUM_PARTICLES; i++) {
        const startPos = startTemplate(i);
        const endPos = endTemplate(i);

        startPos.toArray(startPositions, i * 3);
        endPos.toArray(endPositions, i * 3);
        pIndices[i] = i;
    }

    geometry.setAttribute('startPosition', new THREE.InstancedBufferAttribute(startPositions, 3));
    geometry.setAttribute('endPosition', new THREE.InstancedBufferAttribute(endPositions, 3));
    geometry.setAttribute('pIndex', new THREE.InstancedBufferAttribute(pIndices, 1));

    // Material (ShaderMaterial)
    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: `
            uniform float uTime;
            uniform float uMorphFactor;
            // ... (The full shader code from particle.vert.glsl should be here)
            // (Due to limits, assume it's loaded or inline)
            ${document.getElementById('particle-vert-shader').textContent}
        `, 
        fragmentShader: `
            // ... (The full shader code from particle.frag.glsl should be here)
            // (Due to limits, assume it's loaded or inline)
            ${document.getElementById('particle-frag-shader').textContent}
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);
}

function changeParticleTemplate(newTemplateName) {
    if (newTemplateName === currentTemplateName) return;

    const startName = currentTemplateName;
    const endName = newTemplateName;

    // Update geometry for morphing
    const startPositions = particles.geometry.attributes.startPosition.array;
    const endPositions = particles.geometry.attributes.endPosition.array;

    const newTargetTemplate = particleTemplates[endName];
    
    // Shift current 'end' to 'start' and load new 'end'
    for (let i = 0; i < NUM_PARTICLES; i++) {
        // Shift current target (end) to be the new starting point
        startPositions[i * 3] = endPositions[i * 3];
        startPositions[i * 3 + 1] = endPositions[i * 3 + 1];
        startPositions[i * 3 + 2] = endPositions[i * 3 + 2];

        // Load new target
        const newTargetPos = newTargetTemplate(i);
        newTargetPos.toArray(endPositions, i * 3);
    }

    particles.geometry.attributes.startPosition.needsUpdate = true;
    particles.geometry.attributes.endPosition.needsUpdate = true;

    // Start morph animation
    currentTemplateName = startName;
    targetTemplateName = endName;
    morphTime = 0;
}


// --- MEDIARECORDER API ---

function startRecording() {
    if (!videoStream) {
        console.warn("Cannot start recording: No video stream.");
        document.getElementById('recording-status').textContent = 'Recording: Failed (No Stream)';
        return;
    }

    // Capture the entire canvas
    const canvas = renderer.domElement;
    const canvasStream = canvas.captureStream(60); // Target 60 FPS

    // Combine canvas (particles) and video (background) streams
    // This is the CRITICAL part for capturing the EXACT VIEW
    const combinedStream = new MediaStream();
    
    // Add canvas video track
    canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
    
    // Add original video track (if available) - This is tricky and often requires
    // compositing the video/canvas onto a *single* final canvas first.
    // **SIMPLIFIED FOR SCAFFOLD:** We rely on the `canvas.captureStream`
    // assuming the video element is visible behind the canvas. For a true 
    // single output, the video frame must be drawn *into* the Three.js canvas.
    // For this example, we capture the WebGL canvas only for particles.

    try {
        mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm; codecs=vp8' });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = uploadRecording;
        
        mediaRecorder.start();
        recordingStatus = 'recording';
        document.getElementById('recording-status').textContent = 'Recording: Active';
        document.getElementById('recording-indicator').style.display = 'flex';

        console.log("Recording started.");
    } catch (e) {
        console.error("MediaRecorder start error:", e);
        recordingStatus = 'error';
        document.getElementById('recording-status').textContent = 'Recording: Error';
    }
}

function stopRecording() {
    if (mediaRecorder && recordingStatus === 'recording') {
        mediaRecorder.stop();
        recordingStatus = 'uploading';
        document.getElementById('recording-status').textContent = 'Recording: Stopping & Uploading...';
        document.getElementById('recording-indicator').style.display = 'none';
        console.log("Recording stopped. Preparing for upload.");
    }
}

async function uploadRecording() {
    if (recordedChunks.length === 0) {
        console.warn("No recorded data to upload.");
        recordingStatus = 'idle';
        document.getElementById('recording-status').textContent = 'Recording: Idle';
        return;
    }

    const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
    recordedChunks = []; // Clear for next session

    const formData = new FormData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `session-${timestamp}.webm`;
    formData.append('video', videoBlob, filename);

    try {
        const response = await fetch(`${BACKEND_URL}/upload-video`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            console.log('Upload Success:', data.message);
            recordingStatus = 'idle';
            document.getElementById('recording-status').textContent = 'Recording: Uploaded!';
        } else {
            throw new Error(data.message || 'Unknown upload error');
        }

    } catch (error) {
        console.error('Upload Failed:', error);
        recordingStatus = 'error';
        document.getElementById('recording-status').textContent = `Upload Failed: ${error.message.substring(0, 30)}...`;
    }
}

// --- HANDLERS & ANIMATION LOOP ---

function onResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        gestureState.prevX = null;
        return;
    }

    // Simplified Gesture Detection (for one hand)
    const landmarks = results.multiHandLandmarks[0];
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const wrist = landmarks[0];

    // Pinch Gesture (Index and Thumb close)
    const pinchDist = Math.sqrt(Math.pow(indexTip.x - thumbTip.x, 2) + Math.pow(indexTip.y - thumbTip.y, 2));
    if (pinchDist < 0.05) {
        // Pinch gesture: Color change/brightness control (Example: Random color)
        const newColor = new THREE.Color(Math.random(), Math.random(), Math.random());
        particles.material.uniforms.vColor.value = newColor; // Assuming a uniform for color
    }
    
    // Closed Fist (Approximate by checking if wrist and finger tips are close in Y)
    const allTips = [landmarks[4], landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
    const fingerTipYSum = allTips.reduce((sum, tip) => sum + tip.y, 0);
    const fistDetection = fingerTipYSum / allTips.length > wrist.y + 0.1; // Fingers above wrist = open

    if (!fistDetection) {
        // Closed fist: Contraction
        uniforms.uParticleSpread.value = Math.max(0.1, uniforms.uParticleSpread.value - 0.05);
    } else {
        // Open Palm: Expansion
        uniforms.uParticleSpread.value = Math.min(5.0, uniforms.uParticleSpread.value + 0.05);
    }

    // Swipe left/right
    if (gestureState.prevX !== null) {
        const deltaX = indexTip.x - gestureState.prevX;
        const swipeThreshold = 0.05;
        if (Math.abs(deltaX) > swipeThreshold && !gestureState.swipeDetected) {
            const keys = Object.keys(particleTemplates);
            let currentIndex = keys.indexOf(currentTemplateName);
            let nextIndex = (currentIndex + (deltaX > 0 ? 1 : -1) + keys.length) % keys.length;
            
            changeParticleTemplate(keys[nextIndex]);

            // Prevent rapid switching
            gestureState.swipeDetected = true;
            setTimeout(() => gestureState.swipeDetected = false, 500);
        }
    }
    gestureState.prevX = indexTip.x;

    // Attraction point update (Hand position)
    // Convert normalized (0 to 1) hand coordinates to 3D world coordinates (-15 to 15)
    uniforms.uAttractionPoint.value.x = (landmarks[9].x - 0.5) * -30;
    uniforms.uAttractionPoint.value.y = (landmarks[9].y - 0.5) * -30;
    uniforms.uAttractionPoint.value.z = 0; // Simple 2D tracking
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    uniforms.uTime.value += delta;

    // Morphing Animation Update
    if (currentTemplateName !== targetTemplateName) {
        morphTime += delta;
        const factor = Math.min(1.0, morphTime / MORPH_DURATION);
        uniforms.uMorphFactor.value = factor;

        if (factor >= 1.0) {
            currentTemplateName = targetTemplateName;
            uniforms.uMorphFactor.value = 0.0;
            morphTime = 0;
            // Re-call createParticles to reset start/end positions if you want
            // a continuous morph, or simply let the shader handle the transition.
        }
    }

    // Update FPS meter (Simple check)
    document.getElementById('fps-meter').textContent = `FPS: ${Math.round(1 / delta)}`;

    renderer.render(scene, camera);

    // Run MediaPipe Hand Tracking (must be done in the loop)
    if (handTrackerConfigured && videoElement.readyState >= 2) {
        hands.send({ image: videoElement });
    }
}

// Global listeners for start/stop (e.g., keyboard for testing)
document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
        if (recordingStatus === 'recording') {
            stopRecording();
        } else if (recordingStatus === 'idle') {
            startRecording();
        }
    }
});

// Start the application flow
init();
