(() => {
  const canvas = document.querySelector("#terrain-canvas");
  const errorMessage = document.querySelector("#webgl-error");
  const heightControl = document.querySelector("#height-control");
  const frequencyControl = document.querySelector("#frequency-control");
  const octavesControl = document.querySelector("#octaves-control");
  const seedOutput = document.querySelector("#seed-value");
  const coordinateSeed = document.querySelector("#coordinate-seed");
  const rotateControl = document.querySelector("#rotate-control");
  const generateButton = document.querySelector("#generate-button");

  if (!window.THREE?.OrbitControls || !window.Noise || !canvas) {
    errorMessage.hidden = false;
    return;
  }

  const THREE = window.THREE;
  const terrainSize = 34;
  const segments = 150;
  const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
  const positions = terrainGeometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  terrainGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.02,
    flatShading: false,
  });
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.rotation.x = -Math.PI / 2;
  terrain.castShadow = true;
  terrain.receiveShadow = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#111c2a");
  scene.fog = new THREE.Fog("#111c2a", 48, 105);
  scene.add(terrain);

  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 220);
  camera.position.set(29, 24, 34);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (error) {
    errorMessage.hidden = false;
    console.error("Unable to initialize the terrain WebGL renderer.", error);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const hemisphere = new THREE.HemisphereLight("#c9e2f2", "#27382f", 0.28);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight("#ffe6bd", 1.15);
  sun.position.set(-17, 27, 13);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 25;
  sun.shadow.camera.bottom = -25;
  sun.shadow.bias = -0.00035;
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(sun.target);

  const fillLight = new THREE.DirectionalLight("#86b8e8", 0.16);
  fillLight.position.set(19, 12, -18);
  scene.add(fillLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({ color: "#111a23", roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(140, 70, "#30424b", "#263640");
  grid.position.y = -9;
  grid.material.transparent = true;
  grid.material.opacity = 0.31;
  scene.add(grid);

  const orbit = new THREE.OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0.1, 0);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.055;
  orbit.minDistance = 15;
  orbit.maxDistance = 78;
  orbit.maxPolarAngle = Math.PI * 0.48;
  orbit.autoRotate = rotateControl.checked;
  orbit.autoRotateSpeed = 0.42;
  orbit.update();

  const colorStops = [
    [0.00, new THREE.Color("#285c75")],
    [0.27, new THREE.Color("#347c91")],
    [0.35, new THREE.Color("#c6bb88")],
    [0.41, new THREE.Color("#759660")],
    [0.69, new THREE.Color("#507b53")],
    [0.80, new THREE.Color("#858b7e")],
    [0.91, new THREE.Color("#c7c9bb")],
    [1.00, new THREE.Color("#f1eee2")],
  ];

  // Blend the biome colors gently so height bands read as a natural landscape.
  function colorAtHeight(height) {
    for (let index = 0; index < colorStops.length - 1; index += 1) {
      const [start, startColor] = colorStops[index];
      const [end, endColor] = colorStops[index + 1];
      if (height <= end) {
        const blend = THREE.MathUtils.smoothstep(height, start, end);
        return startColor.clone().lerp(endColor, blend);
      }
    }
    return colorStops[colorStops.length - 1][1];
  }

  let currentSeed = 842;
  const noiseGenerator = new window.Noise(currentSeed);
  let frame = 0;
  let pendingUpdate = 0;

  // Sample layered Perlin noise at each vertex, then use the result as height.
  function rebuildTerrain() {
    pendingUpdate = 0;
    const amplitude = Number(heightControl.value);
    const baseFrequency = Number(frequencyControl.value);
    const octaveCount = Number(octavesControl.value);
    noiseGenerator.seed(currentSeed);

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getY(index);
      let heightSum = 0;
      let amplitudeSum = 0;
      let octaveAmplitude = 1;
      let octaveFrequency = 1;

      for (let octave = 0; octave < octaveCount; octave += 1) {
        const sample = noiseGenerator.perlin2(
          (x + currentSeed * 0.013) * baseFrequency * octaveFrequency,
          (z - currentSeed * 0.009) * baseFrequency * octaveFrequency,
        );
        heightSum += sample * octaveAmplitude;
        amplitudeSum += octaveAmplitude;
        octaveAmplitude *= 0.5;
        octaveFrequency *= 2;
      }

      const normalizedHeight = heightSum / amplitudeSum;
      const shapedHeight = Math.sign(normalizedHeight) * Math.pow(Math.abs(normalizedHeight), 0.88);
      const elevation = shapedHeight * amplitude;
      positions.setZ(index, elevation);

      const biomeHeight = THREE.MathUtils.clamp(0.5 + normalizedHeight * 1.7, 0, 1);
      const color = colorAtHeight(biomeHeight);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    positions.needsUpdate = true;
    terrainGeometry.attributes.color.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    terrainGeometry.computeBoundingSphere();
    ground.position.y = -amplitude - 1.65;
    grid.position.y = -amplitude - 1.62;
    sun.target.position.y = -amplitude * 0.25;
    document.querySelector("#height-value").value = amplitude.toFixed(1);
    document.querySelector("#frequency-value").value = baseFrequency.toFixed(3);
    document.querySelector("#octaves-value").value = String(octaveCount);
    const formattedSeed = String(currentSeed).padStart(4, "0");
    seedOutput.value = formattedSeed;
    coordinateSeed.textContent = formattedSeed;
    updateSliderTrack(heightControl);
    updateSliderTrack(frequencyControl);
    updateSliderTrack(octavesControl);
  }

  function updateSliderTrack(input) {
    const range = Number(input.max) - Number(input.min);
    const progress = range === 0 ? 0 : ((Number(input.value) - Number(input.min)) / range) * 100;
    input.style.setProperty("--progress", `${progress}%`);
  }

  function queueTerrainUpdate() {
    if (!pendingUpdate) pendingUpdate = window.requestAnimationFrame(rebuildTerrain);
  }

  for (const input of [heightControl, frequencyControl, octavesControl]) {
    input.addEventListener("input", queueTerrainUpdate);
  }

  generateButton.addEventListener("click", () => {
    let nextSeed = currentSeed;
    while (nextSeed === currentSeed) {
      nextSeed = Math.floor(Math.random() * 65535) + 1;
    }
    currentSeed = nextSeed;
    queueTerrainUpdate();
  });

  rotateControl.addEventListener("change", () => {
    orbit.autoRotate = rotateControl.checked;
  });

  function resizeRenderer() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resizeRenderer, { passive: true });
  resizeRenderer();
  rebuildTerrain();

  function animate() {
    window.requestAnimationFrame(animate);
    orbit.update();
    renderer.render(scene, camera);
    frame += 1;
  }
  animate();
})();
