// particle.frag.glsl
precision highp float;

varying vec3 vColor;
varying float vAlpha;

void main() {
    // Particle disk shape with smooth alpha falloff
    float r = 0.0, strength = 0.0;
    r = distance(gl_PointCoord, vec2(0.5));
    strength = 1.0 - smoothstep(0.4, 0.5, r); // Smooth circular falloff

    // Final color and transparency
    gl_FragColor = vec4(vColor, strength * vAlpha); 
    // Note: vColor is currently a placeholder; HSL conversion needed in vert shader
}
