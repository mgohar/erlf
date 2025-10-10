// src/MyThreeComponent.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Stats from "three/addons/libs/stats.module.js";
import { MeshoptDecoder } from "meshoptimizer";

export let scene,
  camera,
  renderer,
  debug,
  orbit,
  axis,
  grid,
  stats,
  raycaster,
  pointer;

let previouslyHovered = [];

export function createScene(
  webglparams = {},
  cameraparams = { fov: 75, near: 0.1, far: 1000 },
  debuger = true
) {
  debug = debuger;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    cameraparams.fov,
    window.innerWidth / window.innerHeight,
    cameraparams.near,
    cameraparams.far
  );
  renderer = new THREE.WebGLRenderer(webglparams);

  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  axis = new THREE.AxesHelper(100);
  grid = new THREE.GridHelper(5, 50);
  grid.visible = false;
  axis.visible = false;
  scene.add(axis, grid);
  // Orbit Controls

  if (debug) {
    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enabled = false;
    window.addEventListener("keydown", function (event) {
      switch (event.key) {
        case "o":
          orbit.enabled = !orbit.enabled;
          break;

        case "a":
          axis.visible = !axis.visible;
          break;

        case "g":
          grid.visible = !grid.visible;
          break;
      }
    });
  }
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, orbit };
}

export async function Tcontrol(mesh) {
  if (debug) {
    const { TransformControls } = await import(
      "three/addons/controls/TransformControls.js"
    );
    const control = new TransformControls(camera, renderer.domElement);
    const gizmo = control.getHelper();
    scene.add(gizmo);
    control.attach(mesh);
    scene.add(control);
    control.setMode("translate");
    control.addEventListener("change", (e) => {
      switch (control.mode) {
        case "translate":
          console.log(mesh.position);
          break;
        case "rotate":
          console.log(mesh.rotation);
          break;
        case "scale":
          console.log(mesh.scale);
          break;
      }
    });

    window.addEventListener("keydown", function (event) {
      switch (event.key) {
        case "q":
          control.setSpace(control.space === "local" ? "world" : "local");
          break;

        case "Shift":
          control.setTranslationSnap(1);
          control.setRotationSnap(THREE.MathUtils.degToRad(15));
          control.setScaleSnap(0.25);
          break;

        case "w":
          control.setMode("translate");
          break;

        case "e":
          control.setMode("rotate");
          break;

        case "r":
          control.setMode("scale");
          break;

        case "+":
        case "=":
          control.setSize(control.size + 0.1);
          break;

        case "-":
        case "_":
          control.setSize(Math.max(control.size - 0.1, 0.1));
          break;

        case "x":
          control.showX = !control.showX;
          break;

        case "y":
          control.showY = !control.showY;
          break;

        case "z":
          control.showZ = !control.showZ;
          break;

        case " ":
          control.enabled = !control.enabled;
          break;

        case "Escape":
          control.reset();
          break;
      }
    });

    control.addEventListener("dragging-changed", function (event) {
      orbit.enabled = !event.value;
    });
  }
}

export const Model = (path) => {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    // Optional: Provide a DRACOLoader instance to decode compressed mesh data
    loader.setDRACOLoader(new DRACOLoader().setDecoderPath("./"));
    loader.setKTX2Loader(new KTX2Loader().detectSupport(renderer));

    loader.load(
      path,
      function (gltf) {
        resolve(gltf);
      },
      function (xhr) {
        console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
      },
      function (error) {
        console.log("An error happened:", error);
      }
    );
  });
};

export const HDRMap = async (hdr) => {
  const { RGBELoader } = await import(
    "three/examples/jsm/loaders/RGBELoader.js"
  );
  const rgbeLoader = new RGBELoader();
  rgbeLoader.load(hdr, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping; // Set the correct mapping for HDR
    scene.environment = texture;
    scene.background = texture;
  });
};

export const CubeTexture = (path) => {
  // const path = "https://chatpanda.b-cdn.net/testing/assets/";
  const format = ".png";
  const urls = [
    path + "px" + format, // positive X
    path + "nx" + format, // negative X
    path + "py" + format, // positive Y
    path + "ny" + format, // negative Y
    path + "pz" + format, // positive Z
    path + "nz" + format, // negative Z
  ];

  // Load cube map
  const loader = new THREE.CubeTextureLoader();
  const cubeTexture = loader.load(urls);

  // Apply the cube map as the environment map and background
  scene.environment = cubeTexture;
  scene.background = cubeTexture;
};

export const Observer = (sectionClass, cbin, cbout) => {
  const sections = document.querySelectorAll("." + sectionClass);
  console.log("sections", sections);

  // Create a single Intersection Observer
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          console.log(`${entry.target.id} is in view`);
          cbin();
        } else {
          console.log(`${entry.target.id} is out of view`);
          cbout();
        }
      });
    },
    { threshold: 0.0 } // Adjust the threshold as needed
  );
  // Observe each section
  sections.forEach((section) => observer.observe(section));
};

export const Monitor = () => {
  if (debug) {
    stats = new Stats();
    document.body.appendChild(stats.dom);
  }
};

let callback;
export const Raycast = (cb) => {
  callback = cb;
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  window.addEventListener("pointermove", (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  });
  RaycastAnimate();
};

function RaycastAnimate() {
  requestAnimationFrame(RaycastAnimate);

  // Update the raycaster with the camera and pointer
  raycaster.setFromCamera(pointer, camera);

  // Check for intersections
  const intersects = raycaster.intersectObjects(scene.children, true);

  // Handle intersections
  for (let i = 0; i < intersects.length; i++) {
    if (intersects[i].object.name) callback(intersects[i].object);
  }
}