// @ts-nocheck
import * as THREE from "three";
import { Pane } from "tweakpane";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import {
  EffectComposer,
  RenderPass,
  OutputPass,
  UnrealBloomPass,
  ShaderPass,
} from "three/examples/jsm/Addons.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

// ========================================================
// Globals
// ========================================================
let enablemousemove = false;

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function main() {
  const stats = new Stats();
  document.body.appendChild(stats.dom);

  const params = {
    exposure: 3,
    environmentIntensity: 0.05,
  };

  const snoise = await fetch(
    "https://abc-xyz.b-cdn.net/ERLF/noise/snoise.glsl"
  ).then((res) => res.text());

  // Canvas / Scene / Camera
  const cnvs = document.getElementById("c") as HTMLCanvasElement;
  const scene = new THREE.Scene();
  scene.background = null; // Transparent background

  const cam = new THREE.PerspectiveCamera(
    12,
    cnvs.clientWidth / cnvs.clientHeight,
    0.1,
    1000
  );
  if (window.innerWidth < 600) {
    cam.position.set(0, 1, 120);
  } else {
    cam.position.set(0, 1, 80);
  }

  // Renderer (MSAA off; we’re post-processing)
  const re = new THREE.WebGLRenderer({
    canvas: cnvs,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  });

  const scale = isMobileDevice() ? 0.7 : 1.0;
  let DPRCap = window.innerWidth < 600 ? 0.8 : 1.2;
  const DPR = Math.min(window.devicePixelRatio || 1, DPRCap);
  re.setPixelRatio(DPR);
  re.setSize(cnvs.clientWidth * scale, cnvs.clientHeight * scale, false);
  re.toneMapping = THREE.ACESFilmicToneMapping;
  re.toneMappingExposure = params.exposure;
  re.outputColorSpace = THREE.SRGBColorSpace;
  re.setClearColor(0x000000, 0); // Clear to transparent

  // Scene lighting intensity (global)
  scene.environmentIntensity = params.environmentIntensity;

  // Controls (disabled by default)
  const orbCtrls = new OrbitControls(cam, cnvs);
  orbCtrls.enabled = false;

  // ========================================================
  // Effect chain — single composer (no double scene render)
  // ========================================================
  const composer = new EffectComposer(re, new THREE.WebGLRenderTarget(
    cnvs.clientWidth * scale,
    cnvs.clientHeight * scale,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    }
  ));
  const renderPass = new RenderPass(scene, cam);
  renderPass.clearColor = new THREE.Color(0, 0, 0);
  renderPass.clearAlpha = 0;
  composer.addPass(renderPass);

  const bloomRadius = isMobileDevice() ? 0.1 : 0.25;
  const bloomResScale = isMobileDevice() ? 0.5 : 1.0;
  const adaptive = { bloomScale: bloomResScale };
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(
      cnvs.clientWidth * scale * adaptive.bloomScale,
      cnvs.clientHeight * scale * adaptive.bloomScale
    ),
    isMobileDevice() ? 0.3 : 0.5,
    bloomRadius,
    0.2
  );
  bloomPass.renderToScreen = false;
  composer.addPass(bloomPass);

  // Combine base + bloom (alpha-aware)
  const combinePass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, // previous pass
        uBloomTexture: {
          // internal RT from bloom; this is stable after first init
          // @ts-ignore (UnrealBloom internals)
          value: bloomPass.renderTargetsHorizontal[0].texture,
        },
        uStrength: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D uBloomTexture;
        uniform float uStrength;
        varying vec2 vUv;
        void main(){
          vec4 base = texture2D(tDiffuse, vUv);
          vec3 bloom = texture2D(uBloomTexture, vUv).rgb;
          float a = base.a;
          vec3 color = base.rgb + bloom * uStrength * step(0.01, a);
          gl_FragColor = vec4(color, a);
        }`,
      transparent: false,
      depthTest: false,
      depthWrite: false,
    })
  );
  composer.addPass(combinePass);

  const outPass = new OutputPass();
  outPass.renderToScreen = true;
  composer.addPass(outPass);

  // Minimal GPU timer (WebGL2 EXT_disjoint_timer_query_webgl2)
  const USE_GPU_TIMERS = true;
  const gl = re.getContext();
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const gpuQueue: Array<{ q: WebGLQuery; label: string }> = [];
  function pollGpu() {
    if (!USE_GPU_TIMERS || !ext || gpuQueue.length === 0) return;
    const { q, label } = gpuQueue[0];
    const available = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (available && !disjoint) {
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      console.log(`${label}: ${(ns / 1e6).toFixed(3)} ms GPU`);
      gl.deleteQuery(q);
      gpuQueue.shift();
    }
  }
  function beginGpu(label: string) {
    if (!USE_GPU_TIMERS || !ext) return;
    const q = gl.createQuery() as WebGLQuery;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    gpuQueue.push({ q, label });
  }
  function endGpu() {
    if (!USE_GPU_TIMERS || !ext) return;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
  }

  // ========================================================
  // Load models
  // ========================================================
  const loader = new GLTFLoader();
  const erlfgro = new THREE.Group();
  const lightgrp = new THREE.Group();
  scene.add(erlfgro, lightgrp);

  const { geometry, material } = await loadGLTFModel(
    re,
    "https://abc-xyz.b-cdn.net/ERLF/Model/step-resize1.glb"
  );
  const { geometry: blindfoldGeometry, material: blindfoldMaterial } =
    await loadGLTFModel(
      re,
      "https://abc-xyz.b-cdn.net/ERLF/Model/blindfold.glb"
    );
  const blindfoldMesh = new THREE.Mesh(blindfoldGeometry, blindfoldMaterial);

  // Make blindfold transparent (no new materials per frame)
  if (Array.isArray(blindfoldMesh.material)) {
    blindfoldMesh.material.forEach((m) => (m.transparent = true));
  } else {
    blindfoldMesh.material.transparent = true;
  }

  erlfgro.add(blindfoldMesh);
  blindfoldMesh.position.set(-0.1, 0.7, 6);
  blindfoldMesh.scale.set(0.18, 0.18, 0.18);

  // Overlay plane (alpha aware combine will respect alpha)
  const bfTextGeo = new THREE.PlaneGeometry(10, 10);
  const bfTextTex = new THREE.TextureLoader().load(
    "https://abc-xyz.b-cdn.net/ERLF/textures/navigating_legal_clarity1.png"
  );
  bfTextTex.generateMipmaps = false;
  bfTextTex.minFilter = THREE.LinearFilter;
  bfTextTex.magFilter = THREE.LinearFilter;
  bfTextTex.anisotropy = Math.min(4, re.capabilities.getMaxAnisotropy());
  // Debug handle for runtime inspection
  (scene as any).__debugOverlay = bfTextTex;
  const bfTextMat = new THREE.MeshBasicMaterial({
    map: bfTextTex,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const bfTextMesh = new THREE.Mesh(bfTextGeo, bfTextMat);
  bfTextMesh.position.set(-0.1, 0.4, 9.99);
  bfTextMesh.scale.set(0.353, 0.051, 0.22);
  erlfgro.add(bfTextMesh);

  // Primary mesh
  const phyMat = material as THREE.MeshStandardMaterial;
  const meshGeo = geometry as THREE.BufferGeometry;

  // Cap anisotropy on GLTF-derived materials
  function capMatAniso(mat: any, cap = 4) {
    const maxA = Math.min(cap, re.capabilities.getMaxAnisotropy());
    const set = (t: THREE.Texture | null | undefined) => {
      if (t) t.anisotropy = maxA;
    };
    if (Array.isArray(mat)) {
      mat.forEach((m) => {
        set(m.map);
        set(m.normalMap);
        set(m.roughnessMap);
        set(m.metalnessMap);
        set(m.specularMap);
        set(m.emissiveMap);
        set(m.aoMap);
      });
    } else if (mat) {
      set(mat.map);
      set(mat.normalMap);
      set(mat.roughnessMap);
      set(mat.metalnessMap);
      set(mat.specularMap);
      set(mat.emissiveMap);
      set(mat.aoMap);
    }
  }
  capMatAniso(material, 4);

  // Dissolve (shader patch)
  const dissolveUniformData = {
    uEdgeColor: { value: new THREE.Color(0xbfbfbf) },
    uFreq: { value: 1.0 },
    uAmp: { value: 16.0 },
    uProgress: { value: -20.0 },
    uEdge: { value: 0.8 },
  };

  (material as THREE.MeshStandardMaterial).onBeforeCompile = (shader) => {
    // inject uniforms
    Object.keys(dissolveUniformData).forEach((k) => {
      shader.uniforms[k] = dissolveUniformData[k];
    });

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vPos;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vPos = position;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vPos;
         uniform float uFreq;
         uniform float uAmp;
         uniform float uProgress;
         uniform float uEdge;
         uniform vec3 uEdgeColor;
         ${snoise}`
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
         float noise = snoise(vPos * uFreq) * uAmp;
         if(noise < uProgress) discard;
         float edgeWidth = uProgress + uEdge;
         if(!(noise > uProgress && noise < edgeWidth)){
            gl_FragColor = vec4(gl_FragColor.xyz,1.0);
         }`
      );
  };

  const mesh = new THREE.Mesh(meshGeo, phyMat);
  mesh.position.set(0, -7.3, -7.3);
  mesh.scale.set(1.6, 1.6, 1.6);
  erlfgro.add(mesh);
  erlfgro.position.set(0, 0, 30);

  // ========================================================
  // Particles (no per-frame attribute re-creation)
  // ========================================================
  const particleTexture = new THREE.TextureLoader().load(
    "https://abc-xyz.b-cdn.net/ERLF/textures/particle.png"
  );
  particleTexture.generateMipmaps = false;
  particleTexture.minFilter = THREE.LinearFilter;
  particleTexture.magFilter = THREE.LinearFilter;
  particleTexture.anisotropy = Math.min(2, re.capabilities.getMaxAnisotropy());
  // Debug handle for runtime inspection
  (scene as any).__debugParticle = particleTexture;

  let particleCount = meshGeo.attributes.position.count;
  // Typed arrays (single allocation)
  const particleMaxOffsetArr = new Float32Array(particleCount);
  const particleInitPosArr = new Float32Array(
    meshGeo.getAttribute("position").array
  );
  const particleCurrPosArr = new Float32Array(
    meshGeo.getAttribute("position").array
  );
  const particleVelocityArr = new Float32Array(particleCount * 3);
  const particleDistArr = new Float32Array(particleCount);
  const particleRotationArr = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    const x = i * 3;
    const y = x + 1;
    const z = x + 2;

    particleMaxOffsetArr[i] = Math.random() * 5.5 + 1.5;

    particleVelocityArr[x] = Math.random() * 5.0 + 5.0;
    particleVelocityArr[y] = Math.random() * 5.0 + 5.0;
    particleVelocityArr[z] = Math.random() * 0.1;

    particleDistArr[i] = 0.1;
    particleRotationArr[i] = Math.random() * Math.PI * 2;
  }

  // Create attributes ONCE and keep refs
  const aOffset = new THREE.BufferAttribute(particleMaxOffsetArr, 1);
  const aCurrentPos = new THREE.BufferAttribute(particleCurrPosArr, 3).setUsage(
    THREE.DynamicDrawUsage
  );
  const aVelocity = new THREE.BufferAttribute(particleVelocityArr, 3);
  const aDistAttr = new THREE.BufferAttribute(particleDistArr, 1).setUsage(
    THREE.DynamicDrawUsage
  );
  const aAngleAttr = new THREE.BufferAttribute(particleRotationArr, 1).setUsage(
    THREE.DynamicDrawUsage
  );

  meshGeo.setAttribute("aOffset", aOffset);
  meshGeo.setAttribute("aCurrentPos", aCurrentPos);
  meshGeo.setAttribute("aVelocity", aVelocity);
  meshGeo.setAttribute("aDist", aDistAttr);
  meshGeo.setAttribute("aAngle", aAngleAttr);

  const particleMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTexture: { value: particleTexture },
      uPixelDensity: { value: re.getPixelRatio() },
      uProgress: dissolveUniformData.uProgress,
      uEdge: dissolveUniformData.uEdge,
      uAmp: dissolveUniformData.uAmp,
      uFreq: dissolveUniformData.uFreq,
      uBaseSize: { value: isMobileDevice() ? 700 : 700 },
      uColor: { value: new THREE.Color(0xbfbfbf) },
    },
    vertexShader: `
      ${snoise}
      uniform float uPixelDensity;
      uniform float uBaseSize;
      uniform float uFreq;
      uniform float uAmp;
      uniform float uEdge;
      uniform float uProgress;
      varying float vNoise;
      varying float vAngle;
      attribute vec3 aCurrentPos;
      attribute float aDist;
      attribute float aAngle;
      void main() {
        vec3 pos = position;
        float noise = snoise(pos * uFreq) * uAmp;
        vNoise = noise;
        vAngle = aAngle;
        if (vNoise > uProgress-2.0 && vNoise < uProgress + uEdge + 2.0){
          pos = aCurrentPos;
        }
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = (uBaseSize * uPixelDensity) / (aDist + 1.0);
        gl_PointSize = size / -mv.z;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uEdge;
      uniform float uProgress;
      uniform sampler2D uTexture;
      varying float vNoise;
      varying float vAngle;
      void main(){
        if (vNoise < uProgress) discard;
        if (vNoise > uProgress + uEdge) discard;
        vec2 coord = gl_PointCoord - 0.5;
        float c = cos(vAngle), s = sin(vAngle);
        coord = mat2(c, s, -s, c) * coord + 0.5;
        vec4 tex = texture2D(uTexture, coord);
        gl_FragColor = vec4(uColor * tex.rgb, 1.0);
      }`,
  });

  const particleMesh = new THREE.Points(meshGeo, particleMat);
  scene.add(particleMesh);

  // Random particles (cheap)
  const randomParticleCount = 200;
  const randomParticleGeometry = new THREE.BufferGeometry();
  const randomParticlePositions = new Float32Array(randomParticleCount * 3);
  const randomParticleVelocities = new Float32Array(randomParticleCount * 3);
  for (let i = 0; i < randomParticleCount; i++) {
    randomParticlePositions[i * 3 + 0] = (Math.random() - 0.5) * 40;
    randomParticlePositions[i * 3 + 1] = (Math.random() - 0.5) * 40;
    randomParticlePositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    randomParticleVelocities[i * 3 + 0] = (Math.random() - 0.5) * 0.05;
    randomParticleVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
    randomParticleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
  }
  randomParticleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(randomParticlePositions, 3).setUsage(
      THREE.DynamicDrawUsage
    )
  );
  const randomParticleMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.5,
    transparent: true,
    opacity: 0.0,
    alphaMap: particleTexture,
  });
  const randomParticles = new THREE.Points(
    randomParticleGeometry,
    randomParticleMaterial
  );
  scene.add(randomParticles);

  // ========================================================
  // UI (hidden by default)
  // ========================================================
  const pane = new Pane();
  (pane.element as HTMLElement).style.display = "none";
  const controller = pane.addFolder({ title: "Controls", expanded: false });
  const dissolveFolder = controller.addFolder({
    title: "Dissolve Effect",
    expanded: false,
  });

  const tweaks = {
    autoDissolve: false,
    dissolveProgress: dissolveUniformData.uProgress.value,
    edgeWidth: dissolveUniformData.uEdge.value,
    amplitude: dissolveUniformData.uAmp.value,
    frequency: dissolveUniformData.uFreq.value,
    meshVisible: true,
    meshColor: "#" + phyMat.color.getHexString(),
    edgeColor: "#" + dissolveUniformData.uEdgeColor.value.getHexString(),
    particleVisible: true,
    particleBaseSize: particleMat.uniforms.uBaseSize.value,
    particleColor:
      "#" + particleMat.uniforms.uColor.value.getHexString?.() ?? "#bfbfbf",
    particleSpeedFactor: 0.02,
    velocityFactor: { x: 0.2, y: 0.2 },
    waveAmplitude: 0,
    bloomStrength: combinePass.material.uniforms.uStrength.value,
    blindfoldOpacity: Array.isArray(blindfoldMesh.material)
      ? blindfoldMesh.material[0].opacity
      : blindfoldMesh.material.opacity,
  };

  dissolveFolder
    .addBinding(tweaks, "meshVisible", { label: "Visible" })
    .on("change", (obj) => (mesh.visible = obj.value));
  const progressBinding = dissolveFolder
    .addBinding(tweaks, "dissolveProgress", {
      min: -20,
      max: 20,
      step: 0.0001,
      label: "Progress",
    })
    .on("change", (obj) => (dissolveUniformData.uProgress.value = obj.value));
  dissolveFolder
    .addBinding(tweaks, "autoDissolve", { label: "Auto Animate" })
    .on("change", (obj) => (tweaks.autoDissolve = obj.value));
  dissolveFolder
    .addBinding(tweaks, "edgeWidth", { min: 0.1, max: 8, step: 0.001 })
    .on("change", (obj) => (dissolveUniformData.uEdge.value = obj.value));
  dissolveFolder
    .addBinding(tweaks, "frequency", { min: 0.001, max: 2, step: 0.001 })
    .on("change", (obj) => (dissolveUniformData.uFreq.value = obj.value));
  dissolveFolder
    .addBinding(tweaks, "amplitude", { min: 0.1, max: 20, step: 0.001 })
    .on("change", (obj) => (dissolveUniformData.uAmp.value = obj.value));
  dissolveFolder
    .addBinding(tweaks, "meshColor", { label: "Mesh Color" })
    .on("change", (obj) => phyMat.color.set(obj.value));
  dissolveFolder
    .addBinding(tweaks, "edgeColor", { label: "Edge Color" })
    .on("change", (obj) => dissolveUniformData.uEdgeColor.value.set(obj.value));

  const blindfoldFolder = controller.addFolder({
    title: "Blindfold",
    expanded: false,
  });
  blindfoldFolder
    .addBinding(tweaks, "blindfoldOpacity", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Opacity",
    })
    .on("change", (obj) => {
      if (Array.isArray(blindfoldMesh.material)) {
        blindfoldMesh.material.forEach((m) => (m.opacity = obj.value));
      } else {
        blindfoldMesh.material.opacity = obj.value;
      }
    });

  const particleFolder = controller.addFolder({
    title: "Particle",
    expanded: false,
  });
  particleFolder
    .addBinding(tweaks, "particleVisible", { label: "Visible" })
    .on("change", (obj) => (particleMesh.visible = obj.value));
  particleFolder
    .addBinding(tweaks, "particleBaseSize", {
      min: 10.0,
      max: 700,
      step: 0.01,
      label: "Base size",
    })
    .on("change", (obj) => (particleMat.uniforms.uBaseSize.value = obj.value));
  particleFolder
    .addBinding(tweaks, "particleColor", { label: "Color" })
    .on("change", (obj) => particleMat.uniforms.uColor.value.set(obj.value));
  particleFolder
    .addBinding(tweaks, "bloomStrength", {
      min: 0,
      max: 4,
      step: 0.01,
      label: "Bloom Strength",
    })
    .on(
      "change",
      (obj) => (combinePass.material.uniforms.uStrength.value = obj.value)
    );

  // ========================================================
  // Animation helpers
  // ========================================================
  let dissolving = true;
  // FPS smoothing state for bloom auto-clamp
  let fpsEMA = 60;
  let lastT = performance.now();
  function animateDissolve() {
    if (!tweaks.autoDissolve) return;
    const pg = dissolveUniformData.uProgress;
    if (dissolving) pg.value += 0.08;
    if (pg.value > 14 && dissolving) {
      dissolving = false;
    }
    if (pg.value < -17 && !dissolving) dissolving = true;
    progressBinding.controller.value.setRawValue(pg.value);
  }

  // Particle update helpers (no allocation)
  const particleData = {
    particleSpeedFactor: 0.02,
    velocityFactor: { x: 0.2, y: 0.2 },
    waveAmplitude: 0,
  };
  function calculateWaveOffset(px: number, py: number) {
    const s = Math.sin;
    const xwave =
      s(py * 2) * (0.8 + particleData.waveAmplitude) +
      s(py * 5) * (0.2 + particleData.waveAmplitude) +
      s(py * 8) * (0.8 + particleData.waveAmplitude) +
      s(py * 3) * (0.8 + particleData.waveAmplitude);
    const ywave =
      s(px * 2) * (0.6 + particleData.waveAmplitude) +
      s(px * 1) * (0.9 + particleData.waveAmplitude) +
      s(px * 5) * (0.6 + particleData.waveAmplitude) +
      s(px * 7) * (0.6 + particleData.waveAmplitude);
    return { xwave, ywave };
  }
  function updateVelocity(idx: number) {
    const x = idx * 3;
    const y = x + 1;
    const z = x + 2;
    let vx = particleVelocityArr[x] * particleData.velocityFactor.x;
    let vy = particleVelocityArr[y] * particleData.velocityFactor.y;
    let vz = particleVelocityArr[z];

    const posx = particleCurrPosArr[x];
    const posy = particleCurrPosArr[y];
    const { xwave, ywave } = calculateWaveOffset(posx, posy);

    vx = (vx + xwave) * Math.abs(particleData.particleSpeedFactor);
    vy = (vy + ywave) * Math.abs(particleData.particleSpeedFactor);
    vz = vz * Math.abs(particleData.particleSpeedFactor);
    return { vx, vy, vz };
  }
  function updateParticleAttributes() {
    for (let i = 0; i < particleCount; i++) {
      const x = i * 3;
      const y = x + 1;
      const z = x + 2;

      const v = updateVelocity(i);
      particleCurrPosArr[x] += v.vx;
      particleCurrPosArr[y] += v.vy;
      particleCurrPosArr[z] += v.vz;

      const dx = particleCurrPosArr[x] - particleInitPosArr[x];
      const dy = particleCurrPosArr[y] - particleInitPosArr[y];
      const dz = particleCurrPosArr[z] - particleInitPosArr[z];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      particleDistArr[i] = dist;
      particleRotationArr[i] += 0.01;

      if (dist > particleMaxOffsetArr[i]) {
        particleCurrPosArr[x] = particleInitPosArr[x];
        particleCurrPosArr[y] = particleInitPosArr[y];
        particleCurrPosArr[z] = particleInitPosArr[z];
        particleDistArr[i] = 0.0;
      }
    }
    aCurrentPos.needsUpdate = true;
    aDistAttr.needsUpdate = true;
    aAngleAttr.needsUpdate = true;
  }

  // Mouse look (only near footer)
  let mouseX = 0,
    mouseY = 0;
  window.addEventListener("mousemove", (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  // Debounced + thresholded resize using ResizeObserver (no per-frame resize)
  let lastW = 0,
    lastH = 0;
  const RESIZE_THRESHOLD = 2; // px tolerance
  let resizeRAF: number | null = null;
  let pendingAdaptiveResize = false;

  function resizeAll() {
    const w = Math.round(cnvs.clientWidth * scale);
    const h = Math.round(cnvs.clientHeight * scale);
    if (
      Math.abs(w - lastW) < RESIZE_THRESHOLD &&
      Math.abs(h - lastH) < RESIZE_THRESHOLD
    ) {
      return;
    }
    lastW = w;
    lastH = h;

    re.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    
    // Manually recreate composer render target with alpha support
    const newRT = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    composer.renderTarget1 = newRT;
    composer.renderTarget2 = newRT.clone();
    
    const s = adaptive.bloomScale;
    bloomPass.setSize(
      Math.max(1, Math.floor(w * s)),
      Math.max(1, Math.floor(h * s))
    );
  }

  function scheduleResize() {
    if (resizeRAF !== null) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      resizeRAF = null;
      resizeAll();
    });
  }

  function applyAdaptiveChange() {
    if (pendingAdaptiveResize) return;
    pendingAdaptiveResize = true;
    requestAnimationFrame(() => {
      pendingAdaptiveResize = false;
      resizeAll();
    });
  }

  const ro = new ResizeObserver(() => {
    scheduleResize();
  });
  ro.observe(cnvs);

  // GSAP timeline (unchanged, but no page reloads)
  gsapanimation(scene, erlfgro, blindfoldMesh, bfTextMesh, dissolveUniformData);

  // HDR env (smaller map is cheaper)
  hdr(scene, "studio_small_08_1k.hdr");

  // ========================================================
  // Render loop
  // ========================================================
  let frame = 0;
  function animate() {
    requestAnimationFrame(animate);
    stats.update();
    orbCtrls.update();

    // FPS monitor and bloom auto-clamp
    const nowT = performance.now();
    const dt = nowT - lastT;
    lastT = nowT;
    const instFPS = 1000 / Math.max(1, dt);
    fpsEMA = fpsEMA * 0.9 + instFPS * 0.1;
    const strengthRef = (combinePass.material as THREE.ShaderMaterial).uniforms
      .uStrength;
    if (fpsEMA < 50) {
      strengthRef.value = Math.max(0.2, strengthRef.value * 0.95);
    } else if (fpsEMA > 58) {
      strengthRef.value = Math.min(1.5, strengthRef.value * 1.01);
    }

    // Throttle particle updates on mobile
    const skip = isMobileDevice() ? 2 : 1;
    if (frame++ % skip === 0) updateParticleAttributes();

    // Random particles update (cheap)
    const rp = randomParticleGeometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    for (let i = 0; i < randomParticleCount; i++) {
      rp.array[i * 3 + 0] += randomParticleVelocities[i * 3 + 0];
      rp.array[i * 3 + 1] += randomParticleVelocities[i * 3 + 1];
      rp.array[i * 3 + 2] += randomParticleVelocities[i * 3 + 2];
      for (let j = 0; j < 3; j++) {
        const idx = i * 3 + j;
        if (rp.array[idx] > 10 || rp.array[idx] < -10) {
          randomParticleVelocities[idx] *= -1;
        }
      }
    }
    rp.needsUpdate = true;

    // Reveal random particles after progress > 5
    const progress = dissolveUniformData.uProgress.value;
    if (progress > 5) {
      const t = Math.min((progress - 5) / 10, 1);
      randomParticleMaterial.opacity = t * 0.5;
      randomParticles.visible = true;
    } else {
      randomParticleMaterial.opacity = 0;
      randomParticles.visible = false;
    }

    animateDissolve();
    // No per-frame resize; handled by ResizeObserver + debounce

    // one render only (with GPU timing)
    pollGpu();
    beginGpu("frame");
    composer.render();
    endGpu();

    if (enablemousemove) {
      erlfgro.rotation.y = mouseX * 0.4;
      erlfgro.rotation.x = mouseY * 0.05;
    }
  }
  animate();

  // Footer watcher (keeps mouse move gated)
  setupFooterScrollWatcher();
}

// ========================================================
// Helpers
// ========================================================
async function loadGLTFModel(
  re: THREE.WebGLRenderer,
  url: string
): Promise<{
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}> {
  const loader = new GLTFLoader();
  const ktx2 = new KTX2Loader()
    .setTranscoderPath(
      "https://unpkg.com/three@0.172.0/examples/jsm/libs/basis/"
    )
    .detectSupport(re);
  loader.setKTX2Loader(ktx2);
  const gltf = await loader.loadAsync(url);
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.Material | THREE.Material[] | null = null;
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh && !geometry) {
      geometry = child.geometry;
      material = child.material;
    }
  });
  if (!geometry || !material) throw new Error("No geometry/material in GLTF");
  return { geometry, material };
}

function gsapanimation(
  scene,
  erlfgro,
  blindfoldMesh,
  bfTextMesh,
  dissolveUniformData
) {
  // assumes gsap + ScrollTrigger are globally available (same as your code)
  // baseline
  gsap.set(scene, { environmentIntensity: 0.02 });
  gsap.set(erlfgro.position, { x: 0, y: 0, z: 30 });
  gsap.set(erlfgro.rotation, { y: 0 });
  gsap.set(erlfgro.scale, { x: 1, y: 1, z: 1 });
  gsap.set([blindfoldMesh.material, bfTextMesh.material], { opacity: 1 });

  const tl = gsap.timeline({ defaults: { ease: "none" } });
  tl.to(scene, { environmentIntensity: 0.07 }, 0)
    .to(erlfgro.position, { z: 0 }, 0)
    .to(blindfoldMesh.material, { opacity: 0 }, 0.5)
    .to(bfTextMesh.material, { opacity: 0 }, 0.5)
    .to(erlfgro.position, { x: 5 }, 1)
    .to(erlfgro.rotation, { y: -Math.PI / 5 }, 1)
    .to(erlfgro.position, { x: -5 }, 2)
    .to(erlfgro.rotation, { y: Math.PI / 5 }, 2)
    .to(erlfgro.scale, { x: 1.4, y: 1.4, z: 1.4 }, 3)
    .to(erlfgro.position, { x: -8, y: 2 }, 3)
    .to(erlfgro.rotation, { y: Math.PI / 7 }, 3)
    .to(erlfgro.position, { x: 0, y: 0 }, 4)
    .to(erlfgro.scale, { x: 1, y: 1, z: 1 }, 4)
    .to(erlfgro.rotation, { y: 0 }, 4);

  if (window.innerWidth > 600) {
    tl.to(dissolveUniformData.uProgress, { value: 20 }, 5);
  }

  ScrollTrigger.create({
    animation: tl,
    start: "top top",
    end: "+=700%",
    scrub: 1,
    invalidateOnRefresh: true,
  });
}

function hdr(scene, hdrpath: string) {
  const rgbeLoader = new RGBELoader();
  // rgbeLoader.setPath("https://abc-xyz.b-cdn.net/ERLF/cubeMap2/studio_small_08_1k.hdr");
  rgbeLoader.load(
    "https://abc-xyz.b-cdn.net/ERLF/cubeMap2/studio_small_08_1k.hdr",
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      // smaller env map helps reflection sampling cost
      // Consider PMREM if needed
      scene.environment = texture;
    }
  );
}

// Keep mouse rotation active only near footer
function setupFooterScrollWatcher() {
  const drawfooter = document.getElementById("drawfooter");
  if (!drawfooter) return;
  function checkFooterInView() {
    const rect = drawfooter.getBoundingClientRect();
    const nearFooter = rect.top < window.innerHeight && rect.bottom > 0;
    enablemousemove = nearFooter;
  }
  window.addEventListener("scroll", checkFooterInView, { passive: true });
  checkFooterInView();
}

main();
