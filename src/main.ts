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
import { Tcontrol } from "./lib/helpers";
import { BladeApi } from "tweakpane";
import { RectAreaLightHelper } from "three/examples/jsm/helpers/RectAreaLightHelper.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import * as dat from "dat.gui";

var enablemousemove = false;
async function main() {
  const stats = new Stats();
  let animationFlat = true;

  document.body.appendChild(stats.dom);
  // const gui = new dat.GUI();
  const params = {
    exposure: 3,
    environmentIntensity: 0.05,
    hdr: "studio_small_08_4k.hdr", // Default HDR
  };

  // Define HDR options
  const hdrOptions = [
    "hospital_room_2_4k.hdr",
    "studio_small_08_4k.hdr",
    "blue_photo_studio_4k.hdr",
    // Add more HDR files here
  ];

  // Add HDR dropdown to GUI
  // gui.add(params, 'hdr', hdrOptions).name('HDR Map').onChange((value) => {
  //   hdr(value); // Call the hdr function with the selected value
  // });

  const snoise = await fetch(
    "https://abc-xyz.b-cdn.net/ERLF/noise/snoise.glsl"
  ).then((res) => res.text());
  let scale = 1.0;
  function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }
  if (isMobileDevice()) scale = 0.7;

  const cnvs = document.getElementById("c") as HTMLCanvasElement;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(
    12, // FOV for 140mm lens
    cnvs.clientWidth / cnvs.clientHeight,
    0.1, // near plane
    1000 // far plane
  );

  // Move the camera back!

  if (window.innerWidth < 600) {
    cam.position.set(0, 1, 120);
  } else {
    cam.position.set(0, 1, 80);
  }

  const re = new THREE.WebGLRenderer({
    canvas: cnvs,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  let DPRCap = 1.2;
  if (window.innerWidth < 600) {
    DPRCap = 0.8;
  }
  console.log("DPRCap:", DPRCap);

  const DPR = Math.min(window.devicePixelRatio, DPRCap);
  re.setPixelRatio(DPR);
  re.setSize(cnvs.clientWidth * scale, cnvs.clientHeight * scale, false);
  re.toneMapping = THREE.ACESFilmicToneMapping;
  re.outputColorSpace = THREE.SRGBColorSpace;
  // re.shadowMap.enabled = true;
  // re.shadowMap.type = THREE.PCFSoftShadowMap;
  re.toneMappingExposure = params.exposure;
  scene.environmentIntensity = params.environmentIntensity;

  // gui.add(params, "exposure", 0, 10).onChange((value) => {
  //   re.toneMappingExposure = value; // Rotate the scene around the Y-axis
  //   console.log(value);
  // });
  // gui.add(params, "environmentIntensity", 0, 1).onChange((value) => {
  //   scene.environmentIntensity = value; // Rotate the scene around the Y-axis
  //   console.log(value);
  // });

  const effectComposer1 = new EffectComposer(re);
  const renderPass = new RenderPass(scene, cam);
  let radius = isMobileDevice() ? 0.1 : 0.25;
  const unrealBloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerHeight * scale, window.innerWidth * scale),
    0.5,
    radius,
    0.2
  );
  const outPass = new OutputPass();

  const effectComposer2 = new EffectComposer(re);
  const shaderPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uBloomTexture: {
          value: effectComposer1.renderTarget2.texture,
        },
        uStrength: {
          value: isMobileDevice() ? 1.0 : 1.0,
        },
      },

      vertexShader: `
        varying vec2 vUv;
        void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
    `,

      fragmentShader: `
       uniform sampler2D tDiffuse;
        uniform sampler2D uBloomTexture;
        uniform float uStrength;
        varying vec2 vUv;
        void main(){
            vec4 baseEffect = texture2D(tDiffuse,vUv);
            vec4 bloomEffect = texture2D(uBloomTexture,vUv);
            
            // Preserve alpha from base effect
            float alpha = baseEffect.a;
            
            // Only apply bloom where there is content (alpha > 0)
            vec3 finalColor = baseEffect.rgb + bloomEffect.rgb * uStrength * step(0.01, alpha);
            
            gl_FragColor = vec4(finalColor, alpha);
        }
    `,
    })
  );

  effectComposer1.addPass(renderPass);
  effectComposer1.addPass(unrealBloomPass);
  effectComposer1.renderToScreen = false;

  effectComposer2.addPass(renderPass);
  effectComposer2.addPass(shaderPass);
  effectComposer2.addPass(outPass);

  //const stat = new Stats();
  const orbCtrls = new OrbitControls(cam, cnvs);
  orbCtrls.enabled = false;
  //document.body.appendChild(stat.dom);

  const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
  const cubeCamera = new THREE.CubeCamera(0.1, 500, cubeRenderTarget);
  //let lightProbe = new THREE.LightProbe();
  let cubeTextureUrls: string[];
  let cubeTexture: THREE.CubeTexture;

  // function generateCubeUrls(prefix: string, postfix: string) {
  //   return [
  //     prefix + "px" + postfix,
  //     prefix + "nx" + postfix,
  //     prefix + "py" + postfix,
  //     prefix + "ny" + postfix,
  //     prefix + "pz" + postfix,
  //     prefix + "nz" + postfix,
  //   ];
  // }

  // cubeTextureUrls = generateCubeUrls("./cubemap3/", ".png");

  const erlfgro = new THREE.Group();
  const lightgrp = new THREE.Group();
  scene.add(erlfgro, lightgrp);
  const loader = new GLTFLoader();
  const { geometry, material } = await loadGLTFModel(
    // "https://abc-xyz.b-cdn.net/ERLF/Model/Karolin_Rehfues_Bust_11.glb"
    // "https://abc-xyz.b-cdn.net/ERLF/Model/New_ERFL-2.glb"
    "https://abc-xyz.b-cdn.net/ERLF/Model/step-resize1.glb"
  );
  const { geometry: blindfoldGeometry, material: blindfoldMaterial } =
    await loadGLTFModel("https://abc-xyz.b-cdn.net/ERLF/Model/blindfold.glb");
  const blindfoldMesh = new THREE.Mesh(blindfoldGeometry, blindfoldMaterial);

  // Make the blindfold material transparent and set opacity
  if (Array.isArray(blindfoldMesh.material)) {
    blindfoldMesh.material.forEach((mat) => {
      mat.transparent = true;
      // mat.opacity = 0.5; // Set to your desired opacity (0.0 - 1.0)
    });
  } else {
    blindfoldMesh.material.transparent = true;
    // blindfoldMesh.material.opacity = 0.5; // Set to your desired opacity (0.0 - 1.0)
  }

  erlfgro.add(blindfoldMesh);
  blindfoldMesh.position.z = 6;
  blindfoldMesh.position.x = -0.1;
  blindfoldMesh.position.y = 0.7;
  blindfoldMesh.scale.set(0.18, 0.18, 0.18);

  const bfTextGeo = new THREE.PlaneGeometry(10, 10);
  const bfTextMat = new THREE.MeshBasicMaterial({
    map: new THREE.TextureLoader().load(
      "https://abc-xyz.b-cdn.net/ERLF/textures/navigating_legal_clarity1.png"
    ),
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

  const phyMat = material as THREE.MeshStandardMaterial;
  const meshGeo = geometry as THREE.BufferGeometry;
  let geoNames = ["boxGeometry"];
  // let geometries = [boxGeometry];

  let particleTexture: THREE.Texture;
  particleTexture = new THREE.TextureLoader().load(
    "https://abc-xyz.b-cdn.net/ERLF/textures/particle.png"
  );

  let mesh: THREE.Object3D;

  const dissolveUniformData = {
    uEdgeColor: {
      value: new THREE.Color(0xbfbfbf),
    },
    uFreq: {
      value: 1.0,
    },
    uAmp: {
      value: 16.0,
    },
    uProgress: {
      value: -20.0,
    },
    uEdge: {
      value: 0.8,
    },
  };

  function setupUniforms(
    shader: THREE.WebGLProgramParametersWithUniforms,
    uniforms: { [uniform: string]: THREE.IUniform<any> }
  ) {
    const keys = Object.keys(uniforms);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      shader.uniforms[key] = uniforms[key];
    }
  }

  function setupDissolveShader(
    shader: THREE.WebGLProgramParametersWithUniforms
  ) {
    // vertex shader snippet outside main
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
        varying vec3 vPos;
    `
    );

    // vertex shader snippet inside main
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
        vPos = position;
    `
    );

    // fragment shader snippet outside main
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
        varying vec3 vPos;

        uniform float uFreq;
        uniform float uAmp;
        uniform float uProgress;
        uniform float uEdge;
        uniform vec3 uEdgeColor;

        ${snoise}
    `
    );

    // fragment shader snippet inside main
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>

        float noise = snoise(vPos * uFreq) * uAmp; // calculate snoise in fragment shader for smooth dissolve edges

        if(noise < uProgress) discard; // discard any fragment where noise is lower than progress

        float edgeWidth = uProgress + uEdge;

        if(noise > uProgress && noise < edgeWidth){
            // gl_FragColor = vec4(vec3(uEdgeColor),noise); // colors the edge
        }else{
            gl_FragColor = vec4(gl_FragColor.xyz,1.0);
        }
    `
    );
  }

  (material as THREE.MeshStandardMaterial).onBeforeCompile = (shader) => {
    setupUniforms(shader, dissolveUniformData);
    setupDissolveShader(shader);
  };

  mesh = new THREE.Mesh(meshGeo, phyMat);
  mesh.position.y = -7.3;
  mesh.position.z = -7.3;
  mesh.scale.set(1.6, 1.6, 1.6);
  // mesh.castShadow = true;
  // mesh.receiveShadow = true;
  erlfgro.add(mesh);
  erlfgro.position.z = 30;
  erlfgro.position.y = 0;

  let particleMesh: THREE.Points;
  let particleMat = new THREE.ShaderMaterial();
  particleMat.transparent = true;
  particleMat.blending = THREE.AdditiveBlending;
  let particleCount = meshGeo.attributes.position.count;
  let particleMaxOffsetArr: Float32Array; // -- how far a particle can go from its initial position
  let particleInitPosArr: Float32Array; // store the initial position of the particles -- particle position will reset here if it exceed maxoffset
  let particleCurrPosArr: Float32Array; // use to update he position of the particle
  let particleVelocityArr: Float32Array; // velocity of each particle
  let particleDistArr: Float32Array;
  let particleRotationArr: Float32Array;
  let particleData = {
    particleSpeedFactor: 0.02, // for tweaking velocity
    velocityFactor: { x: 0.2, y: 0.2 },
    waveAmplitude: 0,
  };

  function initParticleAttributes(meshGeo: THREE.BufferGeometry) {
    particleCount = meshGeo.attributes.position.count;
    particleMaxOffsetArr = new Float32Array(particleCount);
    particleInitPosArr = new Float32Array(
      meshGeo.getAttribute("position").array
    );
    particleCurrPosArr = new Float32Array(
      meshGeo.getAttribute("position").array
    );
    particleVelocityArr = new Float32Array(particleCount * 3);
    particleDistArr = new Float32Array(particleCount);
    particleRotationArr = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      let x = i * 3 + 0;
      let y = i * 3 + 1;
      let z = i * 3 + 2;

      particleMaxOffsetArr[i] = Math.random() * 5.5 + 1.5;

      particleVelocityArr[x] = Math.random() * 5.0 + 5.0;
      particleVelocityArr[y] = Math.random() * 5.0 + 5.0;
      particleVelocityArr[z] = Math.random() * 0.1;

      particleDistArr[i] = 0.1;
      particleRotationArr[i] = Math.random() * Math.PI * 2;
    }

    meshGeo.setAttribute(
      "aOffset",
      new THREE.BufferAttribute(particleMaxOffsetArr, 1)
    );
    meshGeo.setAttribute(
      "aCurrentPos",
      new THREE.BufferAttribute(particleCurrPosArr, 3)
    );
    meshGeo.setAttribute(
      "aVelocity",
      new THREE.BufferAttribute(particleVelocityArr, 3)
    );
    meshGeo.setAttribute(
      "aDist",
      new THREE.BufferAttribute(particleDistArr, 1)
    );
    meshGeo.setAttribute(
      "aAngle",
      new THREE.BufferAttribute(particleRotationArr, 1)
    );
  }

  function calculateWaveOffset(idx: number) {
    const posx = particleCurrPosArr[idx * 3 + 0];
    const posy = particleCurrPosArr[idx * 3 + 1];

    let xwave1 = Math.sin(posy * 2) * (0.8 + particleData.waveAmplitude);
    let ywave1 = Math.sin(posx * 2) * (0.6 + particleData.waveAmplitude);

    let xwave2 = Math.sin(posy * 5) * (0.2 + particleData.waveAmplitude);
    let ywave2 = Math.sin(posx * 1) * (0.9 + particleData.waveAmplitude);

    let xwave3 = Math.sin(posy * 8) * (0.8 + particleData.waveAmplitude);
    let ywave3 = Math.sin(posx * 5) * (0.6 + particleData.waveAmplitude);

    let xwave4 = Math.sin(posy * 3) * (0.8 + particleData.waveAmplitude);
    let ywave4 = Math.sin(posx * 7) * (0.6 + particleData.waveAmplitude);

    let xwave = xwave1 + xwave2 + xwave3 + xwave4;
    let ywave = ywave1 + ywave2 + ywave3 + ywave4;

    return { xwave, ywave };
  }

  function updateVelocity(idx: number) {
    let vx = particleVelocityArr[idx * 3 + 0];
    let vy = particleVelocityArr[idx * 3 + 1];
    let vz = particleVelocityArr[idx * 3 + 2];

    vx *= particleData.velocityFactor.x;
    vy *= particleData.velocityFactor.y;

    let { xwave, ywave } = calculateWaveOffset(idx);

    vx += xwave;
    vy += ywave;

    vx *= Math.abs(particleData.particleSpeedFactor);
    vy *= Math.abs(particleData.particleSpeedFactor);
    vz *= Math.abs(particleData.particleSpeedFactor);

    return { vx, vy, vz };
  }

  function updateParticleAttriutes() {
    for (let i = 0; i < particleCount; i++) {
      let x = i * 3 + 0;
      let y = i * 3 + 1;
      let z = i * 3 + 2;

      let { vx, vy, vz } = updateVelocity(i);

      particleCurrPosArr[x] += vx;
      particleCurrPosArr[y] += vy;
      particleCurrPosArr[z] += vz;

      const vec1 = new THREE.Vector3(
        particleInitPosArr[x],
        particleInitPosArr[y],
        particleInitPosArr[z]
      );
      const vec2 = new THREE.Vector3(
        particleCurrPosArr[x],
        particleCurrPosArr[y],
        particleCurrPosArr[z]
      );
      const dist = vec1.distanceTo(vec2);

      particleDistArr[i] = dist;
      particleRotationArr[i] += 0.01;

      if (dist > particleMaxOffsetArr[i]) {
        particleCurrPosArr[x] = particleInitPosArr[x];
        particleCurrPosArr[y] = particleInitPosArr[y];
        particleCurrPosArr[z] = particleInitPosArr[z];
      }
    }

    meshGeo.setAttribute(
      "aOffset",
      new THREE.BufferAttribute(particleMaxOffsetArr, 1)
    );
    meshGeo.setAttribute(
      "aCurrentPos",
      new THREE.BufferAttribute(particleCurrPosArr, 3)
    );
    meshGeo.setAttribute(
      "aVelocity",
      new THREE.BufferAttribute(particleVelocityArr, 3)
    );
    meshGeo.setAttribute(
      "aDist",
      new THREE.BufferAttribute(particleDistArr, 1)
    );
    meshGeo.setAttribute(
      "aAngle",
      new THREE.BufferAttribute(particleRotationArr, 1)
    );
  }

  initParticleAttributes(meshGeo);

  const particlesUniformData = {
    uTexture: {
      value: particleTexture,
    },
    uPixelDensity: {
      value: re.getPixelRatio(),
    },
    uProgress: dissolveUniformData.uProgress,
    uEdge: dissolveUniformData.uEdge,
    uAmp: dissolveUniformData.uAmp,
    uFreq: dissolveUniformData.uFreq,
    uBaseSize: {
      value: isMobileDevice() ? 700 : 700,
    },
    uColor: {
      value: new THREE.Color(0xbfbfbf),
    },
  };

  particleMat.uniforms = particlesUniformData;

  particleMat.vertexShader = `

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
        vNoise =noise;

        vAngle = aAngle;

        if( vNoise > uProgress-2.0 && vNoise < uProgress + uEdge+2.0){
            pos = aCurrentPos;
        }

        vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectedPosition = projectionMatrix * viewPosition;
        gl_Position = projectedPosition;

        float size = uBaseSize * uPixelDensity;
        size = size  / (aDist + 1.0);
        gl_PointSize = size / -viewPosition.z;
}
`;

  particleMat.fragmentShader = `
    uniform vec3 uColor;
    uniform float uEdge;
    uniform float uProgress;
    uniform sampler2D uTexture;

    varying float vNoise;
    varying float vAngle;

    void main(){
        if( vNoise < uProgress ) discard;
        if( vNoise > uProgress + uEdge) discard;

        vec2 coord = gl_PointCoord;
        coord = coord - 0.5; // get the coordinate from 0-1 ot -0.5 to 0.5
        coord = coord * mat2(cos(vAngle),sin(vAngle) , -sin(vAngle), cos(vAngle)); // apply the rotation transformaion
        coord = coord +  0.5; // reset the coordinate to 0-1  

        vec4 texture = texture2D(uTexture,coord);

        gl_FragColor = vec4(vec3(uColor.xyz * texture.xyz),1.0);
    }
`;

  particleMesh = new THREE.Points(meshGeo, particleMat);
  scene.add(particleMesh);

  // === RANDOM PARTICLE SYSTEM ===
  const randomParticleCount = 200;
  const randomParticleGeometry = new THREE.BufferGeometry();
  const randomParticlePositions = new Float32Array(randomParticleCount * 3);
  const randomParticleVelocities = new Float32Array(randomParticleCount * 3);

  for (let i = 0; i < randomParticleCount; i++) {
    // Random position in a cube of size 20 centered at origin
    randomParticlePositions[i * 3 + 0] = (Math.random() - 0.5) * 40;
    randomParticlePositions[i * 3 + 1] = (Math.random() - 0.5) * 40;
    randomParticlePositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    // Random velocity
    randomParticleVelocities[i * 3 + 0] = (Math.random() - 0.5) * 0.05;
    randomParticleVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
    randomParticleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
  }

  randomParticleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(randomParticlePositions, 3)
  );

  const randomParticleMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.5,
    transparent: true,
    opacity: 0.5,
    alphaMap: particleTexture,
  });

  const randomParticles = new THREE.Points(
    randomParticleGeometry,
    randomParticleMaterial
  );
  scene.add(randomParticles);

  function resizeRendererToDisplaySize() {
    const width = cnvs.clientWidth * scale;
    const height = cnvs.clientHeight * scale;
    const needResize = cnvs.width !== width || cnvs.height !== height;
    if (needResize) {
      re.setSize(width, height, false);

      renderPass.setSize(width, height);
      outPass.setSize(width, height);
      unrealBloomPass.setSize(width, height);

      effectComposer1.setSize(width, height);
      effectComposer2.setSize(width, height);
    }

    return needResize;
  }

  let tweaks = {
    x: 0,
    z: 0,

    dissolveProgress: dissolveUniformData.uProgress.value,
    edgeWidth: dissolveUniformData.uEdge.value,
    amplitude: dissolveUniformData.uAmp.value,
    frequency: dissolveUniformData.uFreq.value,
    meshVisible: true,
    meshColor: "#" + phyMat.color.getHexString(),
    edgeColor: "#" + dissolveUniformData.uEdgeColor.value.getHexString(),
    autoDissolve: false,
    blindfoldOpacity: Array.isArray(blindfoldMesh.material)
      ? blindfoldMesh.material[0].opacity
      : blindfoldMesh.material.opacity,

    particleVisible: true,
    particleBaseSize: particlesUniformData.uBaseSize.value,
    particleColor: "#" + particlesUniformData.uColor.value.getHexString(),
    particleSpeedFactor: particleData.particleSpeedFactor,
    velocityFactor: particleData.velocityFactor,
    waveAmplitude: particleData.waveAmplitude,

    bloomStrength: shaderPass.uniforms.uStrength.value,
  };

  function createTweakList(
    name: string,
    keys: string[],
    vals: any[]
  ): BladeApi {
    const opts = [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = vals[i];
      opts.push({ text: k, value: v });
    }

    return pane.addBlade({
      view: "list",
      label: name,
      options: opts,
      value: vals[0],
    });
  }

  function handleMeshChange(geo: any) {
    scene.remove(mesh);
    scene.remove(particleMesh);

    // meshGeo = geo;
    mesh = new THREE.Mesh(geo, phyMat);

    initParticleAttributes(geo);
    particleMesh = new THREE.Points(geo, particleMat);

    scene.add(mesh);
    scene.add(particleMesh);
  }

  const pane = new Pane();
  (pane.element as HTMLElement).style.display = "none";

  const controller = pane.addFolder({ title: "Controls", expanded: false });

  const meshFolder = controller.addFolder({ title: "Mesh", expanded: false });
  let meshBlade = createTweakList("Mesh", geoNames, [meshGeo.clone()]);
  //@ts-ignore
  meshBlade.on("change", (val) => {
    handleMeshChange(val.value);
  });
  meshFolder.add(meshBlade);
  meshFolder
    .addBinding(tweaks, "bloomStrength", {
      min: 1,
      max: 20,
      step: 0.01,
      label: "Bloom Strength",
    })
    .on("change", (obj) => {
      shaderPass.uniforms.uStrength.value = obj.value;
    });

  const dissolveFolder = controller.addFolder({
    title: "Dissolve Effect",
    expanded: false,
  });
  dissolveFolder
    .addBinding(tweaks, "meshVisible", { label: "Visible" })
    .on("change", (obj) => {
      mesh.visible = obj.value;
    });
  let progressBinding = dissolveFolder
    .addBinding(tweaks, "dissolveProgress", {
      min: -20,
      max: 20,
      step: 0.0001,
      label: "Progress",
    })
    .on("change", (obj) => {
      dissolveUniformData.uProgress.value = obj.value;
    });
  dissolveFolder
    .addBinding(tweaks, "autoDissolve", { label: "Auto Animate" })
    .on("change", (obj) => {
      tweaks.autoDissolve = obj.value;
    });
  dissolveFolder
    .addBinding(tweaks, "edgeWidth", {
      min: 0.1,
      max: 8,
      step: 0.001,
      label: "Edge Width",
    })
    .on("change", (obj) => {
      dissolveUniformData.uEdge.value = obj.value;
    });
  dissolveFolder
    .addBinding(tweaks, "frequency", {
      min: 0.001,
      max: 2,
      step: 0.001,
      label: "Frequency",
    })
    .on("change", (obj) => {
      dissolveUniformData.uFreq.value = obj.value;
    });
  dissolveFolder
    .addBinding(tweaks, "amplitude", {
      min: 0.1,
      max: 20,
      step: 0.001,
      label: "Amplitude",
    })
    .on("change", (obj) => {
      dissolveUniformData.uAmp.value = obj.value;
    });
  dissolveFolder
    .addBinding(tweaks, "meshColor", { label: "Mesh Color" })
    .on("change", (obj) => {
      phyMat.color.set(obj.value);
    });
  dissolveFolder
    .addBinding(tweaks, "edgeColor", { label: "Edge Color" })
    .on("change", (obj) => {
      dissolveUniformData.uEdgeColor.value.set(obj.value);
    });

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
        blindfoldMesh.material.forEach((mat) => {
          mat.opacity = obj.value;
        });
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
    .on("change", (obj) => {
      particleMesh.visible = obj.value;
    });
  particleFolder
    .addBinding(tweaks, "particleBaseSize", {
      min: 10.0,
      max: 700,
      step: 0.01,
      label: "Base size",
    })
    .on("change", (obj) => {
      particlesUniformData.uBaseSize.value = obj.value;
    });
  particleFolder
    .addBinding(tweaks, "particleColor", { label: "Color" })
    .on("change", (obj) => {
      particlesUniformData.uColor.value.set(obj.value);
    });
  particleFolder
    .addBinding(tweaks, "particleSpeedFactor", {
      min: 0.001,
      max: 0.1,
      step: 0.001,
      label: "Speed",
    })
    .on("change", (obj) => {
      particleData.particleSpeedFactor = obj.value;
    });
  particleFolder
    .addBinding(tweaks, "waveAmplitude", {
      min: 0,
      max: 5,
      step: 0.01,
      label: "Wave Amp",
    })
    .on("change", (obj) => {
      particleData.waveAmplitude = obj.value;
    });
  particleFolder
    .addBinding(tweaks, "velocityFactor", {
      expanded: true,
      picker: "inline",
      label: "Velocity Factor",
    })
    .on("change", (obj) => {
      particleData.velocityFactor = obj.value;
    });
  let dissolving = true;
  let geoIdx = 0;

  function animateDissolve() {
    if (!tweaks.autoDissolve) return;
    let progress = dissolveUniformData.uProgress;
    if (dissolving) {
      progress.value += 0.08;
    }
    if (progress.value > 14 && dissolving) {
      dissolving = false;
      geoIdx++;
      handleMeshChange(meshGeo.clone());
      //@ts-ignore
      meshBlade.value = meshGeo;
    }
    if (progress.value < -17 && !dissolving) dissolving = true;

    progressBinding.controller.value.setRawValue(progress.value);
  }

  let mouseX = 0;
  let mouseY = 0;

  window.addEventListener("mousemove", (event) => {
    mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  });

  function animate() {
    // if (animationFlat) {
    requestAnimationFrame(animate);
    // }
    if (stats) {
      stats.update();
    }
    orbCtrls.update();

    updateParticleAttriutes();

    // floatMeshes(time);

    animateDissolve();

    // === UPDATE RANDOM PARTICLES ===
    const positions = randomParticleGeometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    for (let i = 0; i < randomParticleCount; i++) {
      positions.array[i * 3 + 0] += randomParticleVelocities[i * 3 + 0];
      positions.array[i * 3 + 1] += randomParticleVelocities[i * 3 + 1];
      positions.array[i * 3 + 2] += randomParticleVelocities[i * 3 + 2];

      // Simple bounds check to keep particles in a box
      for (let j = 0; j < 3; j++) {
        if (
          positions.array[i * 3 + j] > 10 ||
          positions.array[i * 3 + j] < -10
        ) {
          randomParticleVelocities[i * 3 + j] *= -1;
        }
      }
    }
    positions.needsUpdate = true;

    // === REVEAL PARTICLES BASED ON PROGRESS ===
    const progress = dissolveUniformData.uProgress.value;
    if (progress > 5) {
      const t = Math.min((progress - 5) / 10, 1);
      randomParticleMaterial.opacity = t * 0.5;
      randomParticles.visible = true;
    } else {
      randomParticleMaterial.opacity = 0;
      randomParticles.visible = false;
    }

    if (resizeRendererToDisplaySize()) {
      const canvas = re.domElement;
      cam.aspect = canvas.clientWidth / canvas.clientHeight;
      cam.updateProjectionMatrix();
    }

    // scene.background = blackColor;
    effectComposer1.render();

    // scene.background = cubeTexture;
    effectComposer2.render();
    if (enablemousemove) {
      erlfgro.rotation.y = mouseX * 0.4;
      erlfgro.rotation.x = mouseY * 0.05;
    }
  }
  animate();

  gsapanimation();

  window.addEventListener("orientationchange", () => {
    location.reload();
  });

  // ##############################################################
  // LOAD GLTF MODEL
  // ##############################################################
  async function loadGLTFModel(url: string): Promise<{
    geometry: THREE.BufferGeometry;
    material: THREE.Material | THREE.Material[];
  }> {
    try {
      const gltf = await loader.loadAsync(url);
      let model = gltf.scene;
      // scene.add(model);

      // Extract the geometry and material from the first mesh in the model
      let geometry: THREE.BufferGeometry | null = null;
      let material: THREE.Material | THREE.Material[] | null = null;
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && !geometry) {
          geometry = child.geometry;
          material = child.material;
        }
      });

      if (!geometry || !material) {
        throw new Error("No geometry or material found in the model");
      }

      return { geometry, material };
    } catch (error) {
      console.error("Error loading model:", error);
      throw error;
    }
  }

  // ##############################################################
  // Animate dissolveUniformData.uProgress.value from current to 14 over 2 seconds

  function gsapanimation() {
    // One-time baseline
    gsap.set(scene, { environmentIntensity: 0.02 });
    gsap.set(erlfgro.position, { x: 0, y: 0, z: 30 });
    gsap.set(erlfgro.rotation, { y: 0 });
    gsap.set(erlfgro.scale, { x: 1, y: 1, z: 1 });
    gsap.set([blindfoldMesh.material, bfTextMesh.material], { opacity: 1 });

    const tl = gsap.timeline({ defaults: { ease: "none" } });

    // We'll treat each section as "1 unit" of timeline time:
    tl.to(scene, { environmentIntensity: 0.07 }, 0)
      .to(erlfgro.position, { z: 0 }, 0) // S1

      .to(blindfoldMesh.material, { opacity: 0 }, 0.5)
      .to(bfTextMesh.material, { opacity: 0 }, 0.5) // S2

      .to(erlfgro.position, { x: 5 }, 1)
      .to(erlfgro.rotation, { y: -Math.PI / 5 }, 1) // S3

      .to(erlfgro.position, { x: -5 }, 2)
      .to(erlfgro.rotation, { y: Math.PI / 5 }, 2) // S4

      .to(erlfgro.scale, { x: 1.4, y: 1.4, z: 1.4 }, 3)
      .to(erlfgro.position, { x: -8, y: 2 }, 3)
      .to(erlfgro.rotation, { y: Math.PI / 7 }, 3) // S5

      .to(erlfgro.position, { x: 0, y: 0 }, 4)
      .to(erlfgro.scale, { x: 1, y: 1, z: 1 }, 4)
      .to(erlfgro.rotation, { y: 0 }, 4); // S6

    if (window.innerWidth > 600) {
      tl.to(dissolveUniformData.uProgress, { value: 20 }, 5); // S7
    }

    ScrollTrigger.create({
      animation: tl,
      start: "top top",
      end: "+=700%", // 7 sections × 100vh ⇒ adjust if your sections differ
      scrub: 1,
      invalidateOnRefresh: true,
      // pin: true // if you want a pinned scrollytelling wrapper
    });
  }
  function hdr(hdrpath) {
    const rgbeLoader = new RGBELoader();
    rgbeLoader.setPath("https://abc-xyz.b-cdn.net/ERLF/cubeMap2/"); // relative to public/
    rgbeLoader.load(hdrpath, (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
    });
  }
  hdr("studio_small_08_1k.hdr");
}

// Add this inside your main() function, after DOM is ready
function setupFooterScrollWatcher() {
  const drawfooter = document.getElementById("drawfooter");
  if (!drawfooter) return;

  function checkFooterInView() {
    const rect = drawfooter.getBoundingClientRect();
    // You can adjust the threshold as needed
    const nearFooter = rect.top < window.innerHeight && rect.bottom > 0;
    enablemousemove = nearFooter;
  }

  window.addEventListener("scroll", checkFooterInView, { passive: true });
  // Also check on load in case already in view
  checkFooterInView();
}

// Call this in main()
setupFooterScrollWatcher();

main();
