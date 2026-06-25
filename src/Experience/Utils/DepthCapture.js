import * as THREE from "three";

/**
 * Capture la profondeur de la scène SANS l'eau, dans une DepthTexture.
 * Le fragment shader de l'eau lit cette texture pour calculer le foam de berge.
 * Piloté par Renderer.update() : une passe par frame, avant le render principal.
 */

export default class DepthCapture {
  constructor(renderer, camera, scene) {
    this.renderer = renderer;
    this.camera = camera;
    this.scene = scene;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    this.target = new THREE.WebGLRenderTarget(size.x, size.y);
    this.target.texture.minFilter = THREE.NearestFilter;
    this.target.texture.magFilter = THREE.NearestFilter;

    // This class can be used to automatically save the depth information of a rendering into a texture
    this.target.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.target.depthTexture.type = THREE.UnsignedShortType;
  }

  get depthTexture() {
    return this.target.depthTexture;
  }

  setSize(width, height, pixelRatio) {
    this.target.setSize(width * pixelRatio, height * pixelRatio);
  }

  // rend la scène SANS l'eau dans la depth texture
  capture(waterMeshes) {
    for (const m of waterMeshes) m.visible = false;

    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    for (const m of waterMeshes) m.visible = true;
  }
}
