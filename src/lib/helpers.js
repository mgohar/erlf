export async function Tcontrol(mesh, scene, camera, renderer, orbit) {
  const { TransformControls } = await import(
    "three/examples/jsm/controls/TransformControls.js"
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
