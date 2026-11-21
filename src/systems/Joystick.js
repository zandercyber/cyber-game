// Floating on-screen joystick: touch (or click) anywhere and drag to move.
// The stick appears where your finger lands, like in Monkey Mart.

const BASE_COLOR = 0xffffff;
const ACCENT = 0x5ff0ff;

export class Joystick {
  constructor(scene, { radius = 90, deadZone = 0.15 } = {}) {
    this.scene = scene;
    this.radius = radius;
    this.deadZone = deadZone;
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
    this.base.setPosition(pointer.x, pointer.y).setVisible(true);
    this.knob.setPosition(pointer.x, pointer.y).setVisible(true);
    this.vector = { x: 0, y: 0 };
  }

  onMove(pointer) {
    if (pointer.id !== this.pointerId) return;
    let dx = pointer.x - this.base.x;
    let dy = pointer.y - this.base.y;
    const dist = Math.hypot(dx, dy);
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
    if (pointer.id === this.pointerId) this.reset();
  }

  reset() {
    this.pointerId = null;
    this.vector = { x: 0, y: 0 };
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }
}
