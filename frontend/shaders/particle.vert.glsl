// particle.vert.glsl
precision highp float;

uniform float uTime;
uniform float uMorphFactor;
uniform float uGravity;
uniform float uNoiseScale;
uniform float uParticleSpread;
uniform vec3 uAttractionPoint;

attribute float pIndex; // Particle ID
attribute vec3 startPosition; // Base position for one shape
attribute vec3 endPosition;   // Base position for the target shape (for morphing)
attribute vec2 velocity; // Stored particle velocity (for physics)

varying vec3 vColor;
varying float vAlpha;

// Standard 3D noise function (Simplex or Perlin)
// (Implementation of a standard snoise function omitted for brevity, but required)
float snoise(vec3 v); 

void main() {
    // 1. Morphing Logic
    // Smoothly interpolate between two template positions
    vec3 morphedPosition = mix(startPosition, endPosition, uMorphFactor);

    // 2. Physics & Noise
    vec3 newPos = morphedPosition;

    // Gravity (simple downward acceleration)
    newPos.y += uGravity * uTime;

    // Noise-based motion
    vec3 noise = vec3(
        snoise(vec3(morphedPosition.x * uNoiseScale, morphedPosition.y * uNoiseScale, uTime * 0.1 + pIndex)),
        snoise(vec3(morphedPosition.y * uNoiseScale, morphedPosition.z * uNoiseScale, uTime * 0.1 + pIndex + 1.0)),
        snoise(vec3(morphedPosition.z * uNoiseScale, morphedPosition.x * uNoiseScale, uTime * 0.1 + pIndex + 2.0))
    ) * uParticleSpread;

    newPos += noise;

    // Attraction / Repulsion (Attraction to uAttractionPoint)
    vec3 directionToAttractor = uAttractionPoint - newPos;
    float distSq = dot(directionToAttractor, directionToAttractor);
    float force = 1.0 / (distSq + 1.0); // Simple inverse square-like force
    newPos += normalize(directionToAttractor) * force * 0.5; // Scale the attraction force

    // Final transformed position
    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // 3. Color Transition (Rainbow mode example)
    float hue = mod(uTime * 0.1 + pIndex * 0.001, 1.0); // Time-based gradient flow
    // (A Hue-to-RGB conversion function is required here for a true rainbow)
    vColor = vec3(hue, 1.0, 1.0); // Placeholder color until HSL/HSV conversion is added
    
    gl_PointSize = 2.0 * (1.0 + sin(uTime * 2.0 + pIndex * 0.1)); // Pulse size
}
