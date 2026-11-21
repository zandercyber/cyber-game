import * as Phaser from 'phaser';
import { DormScene } from './scenes/DormScene.js';
import { WORLD } from './data/dorm.js';
import { DEBUG } from './systems/debug.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WORLD.width,
  height: WORLD.height,
  backgroundColor: '#0b0e14',
  scale: {
    // Fit the whole room on any screen, keeping its shape.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 2 },
  scene: [DormScene],
});

// In debug mode, expose the game for testing from the browser console.
if (DEBUG) {
  window.__CYBER_GAME__ = game;
}
