import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { GTAOPass } from '../vendor/addons/postprocessing/GTAOPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from '../vendor/addons/shaders/FXAAShader.js';
import { RoomEnvironment } from '../vendor/addons/environments/RoomEnvironment.js';

export function createRendering(renderer, scene, camera) {
  // A prefiltered indoor environment supplies broad reflections on brass and
  // polished wood without fetching an HDR image or adding animated lights.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .025, .1, 100);
  scene.environment = environment.texture;
  scene.environmentIntensity = .32;
  room.dispose(); pmrem.dispose();

  const samples = Math.min(4, renderer.capabilities.maxSamples);
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 1, 1, undefined,
    { radius: .48, thickness: .75, distanceFallOff: 1, distanceExponent: 1, samples: 16, screenSpaceRadius: false },
    { radius: 5, rings: 2, samples: 16 });
  ao.blendIntensity = .45;
  const transparentCards = [];
  scene.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (object.isMesh && materials.some(material => material?.transparent)) transparentCards.push(object);
  });
  const drawNormals = ao.renderOverride.bind(ao);
  ao.renderOverride = (...args) => {
    // Soft contact-shadow cards and lamp glows have no opaque physical surface.
    // Including their entire rectangles in the normal buffer creates AO boxes.
    const visibility = transparentCards.map(object => object.visible);
    transparentCards.forEach(object => { object.visible = false; });
    try { drawNormals(...args); }
    finally { transparentCards.forEach((object, i) => { object.visible = visibility[i]; }); }
  };
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  const antialias = new ShaderPass(FXAAShader);
  composer.addPass(antialias);
  renderer.info.autoReset = false;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  return {
    composer, ao, samples,
    resize(width, height, ratio) {
      composer.setPixelRatio(ratio);
      composer.setSize(width, height);
      // Smooth low-frequency contact shading does not require native pixel
      // density. Geometry, painting detail and MSAA stay at full resolution.
      ao.setSize(Math.max(1, Math.round(width * ratio * .65)), Math.max(1, Math.round(height * ratio * .65)));
      antialias.material.uniforms.resolution.value.set(1 / (width * ratio), 1 / (height * ratio));
    },
    render() { renderer.info.reset(); composer.render(); },
    refreshShadows() { renderer.shadowMap.needsUpdate = true; },
    dispose() { ao.dispose(); composer.dispose(); environment.dispose(); }
  };
}
