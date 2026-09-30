import { Engine } from './core/engine.js';
import { SkySystem } from './systems/sky.js';
import { TerrainSystem } from './systems/terrain.js';
import { WaterSystem } from './systems/water.js';
import { CameraSystem } from './systems/camera.js';
import { PostSystem } from './systems/post.js';
import { AudioSystem } from './systems/audio.js';
import { HudSystem } from './systems/hud.js';

// Register systems here. Order is resolved from each class's static deps.
const engine = new Engine([SkySystem, TerrainSystem, WaterSystem, CameraSystem, PostSystem, AudioSystem, HudSystem]);
engine.start().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f66;position:fixed;inset:0;padding:16px">${err.stack}</pre>`);
});
