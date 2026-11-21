// Touch/mouse controls:
// - Drag anywhere: a floating joystick appears under your finger (like Monkey Mart).
// - Quick tap: reports a tap so the player can walk to that spot (tap-to-move).
//   Taps also work inside apps that grab sideways swipes for their own gestures.

const BASE_COLOR = 0xffffff;
const ACCENT = 0x5ff0ff;
const TAP_MAX_MOVE = 14; // world px the finger can wander and still count as a tap
const TAP_MAX_MS = 350;

export class Joystick {
  constructor(scene, { radius = 90, deadZone = 0.15, onTap = null } = {}) {
    this.scene = scene;
    this.radius = radius;
    this.deadZone = deadZone;
    this.onTap = onTap;
    this.pointerId = null;
    this.vector = { x: 0, y: 0 };

    this.base = scene.add.circle(0, 0, radius, BASE_COLOR, 0.1)
      .setStrokeStyle(3, ACCENT, 0.6)
      .setDepth(10000)
      .setVisible(false);
    this.knob = scene.add.circle(0, 0, radius * 0.42, ACCENT, 0.55)
      .setDepth(10001)
      .setVisible(false);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.input.on('gameout', () => this.reset());
  }

  get active() {
    return this.pointerId !== null;
  }

  onDown(pointer, currentlyOver) {
    // Ignore taps on buttons (anything interactive under the pointer).
    if (this.active || (currentlyOver && currentlyOver.length > 0)) return;
    this.pointerId = pointer.id;
    this.downAt = this.scene.time.now;
    this.maxDrag = 0;
    this.base.setPosition(pointer.x, pointer.y);
    this.knob.setPosition(pointer.x, pointer.y);
    this.vector = { x: 0, y: 0 };
  }

  onMove(pointer) {
    if (pointer.id !== this.pointerId) return;
    let dx = pointer.x - this.base.x;
    let dy = pointer.y - this.base.y;
    const dist = Math.hypot(dx, dy);
    this.maxDrag = Math.max(this.maxDrag, dist);
    // Only show the stick once it's clearly a drag, so taps don't flash it.
    if (this.maxDrag > TAP_MAX_MOVE) {
      this.base.setVisible(true);
      this.knob.setVisible(true);
    }
    if (dist > this.radius) {
      dx = (dx / dist) * this.radius;
      dy = (dy / dist) * this.radius;
    }
    this.knob.setPosition(this.base.x + dx, this.base.y + dy);

    const strength = Math.min(dist / this.radius, 1);
    if (strength < this.deadZone) {
      this.vector = { x: 0, y: 0 };
    } else {
      this.vector = { x: dx / this.radius, y: dy / this.radius };
    }
  }

  onUp(pointer) {
    if (pointer.id !== this.pointerId) return;
    const quick = this.scene.time.now - this.downAt <= TAP_MAX_MS;
    const isTap = !pointer.wasCanceled && quick && this.maxDrag <= TAP_MAX_MOVE;
    const { x, y } = this.base;
    this.reset();
    if (isTap && this.onTap) this.onTap(x, y);
  }

  reset() {
    this.pointerId = null;
    this.vector = { x: 0, y: 0 };
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }
}
