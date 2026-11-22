// The player character: movement, collision and animation.
// Modes: normal, carrying (arms out, cash stack shown), working (typing, back view).

const SPEED = 240; // world pixels per second at full stick (before speed upgrades)
const MAX_SUBSTEP = 8; // move in small steps so fast walking can't clip through furniture
const SCALE = 2; // sprite sheet frames are 32x52; drawn at 2x
const FEET_ORIGIN_Y = 51 / 52; // feet sit on row 51 of each frame
// Points around the feet that must all be on open floor (keeps the body off walls).
const FEET_PROBES = [[-14, 0], [14, 0], [0, -8], [0, 4]];

// Sprite sheet layout: 4 columns per row (see CLAUDE.md).
const WALK_ROWS = { down: 1, left: 2, right: 3, up: 4 };
const CARRY_ROWS = { down: 5, left: 6, right: 7, up: 8 };
const WORK_ROW = 9;
const IDLE_FRAME = { down: 0, left: 1, right: 2, up: 3 };
// Standing still while carrying: first frame of that direction's carry row.
const CARRY_IDLE_FRAME = Object.fromEntries(Object.entries(CARRY_ROWS).map(([d, r]) => [d, r * 4]));

export function createPlayerAnimations(scene) {
  const row = (r) => [0, 1, 2, 3].map((c) => r * 4 + c);
  const make = (key, r, frameRate = 8) => scene.anims.create({
    key,
    frames: scene.anims.generateFrameNumbers('player', { frames: row(r) }),
    frameRate,
    repeat: -1,
  });
  for (const [dir, r] of Object.entries(WALK_ROWS)) make(`walk-${dir}`, r);
  for (const [dir, r] of Object.entries(CARRY_ROWS)) make(`carry-${dir}`, r);
  make('work', WORK_ROW, 6);
}

export class Player {
  constructor(scene, x, y, isWalkable, facing = 'down') {
    this.scene = scene;
    this.isWalkable = isWalkable;
    this.facing = facing;
    this.moving = false;
    this.working = false;
    this.carrying = false;
    this.speedMultiplier = 1; // the shop's speed upgrade
    this.sprite = scene.add.sprite(x, y, 'player', IDLE_FRAME[facing])
      .setOrigin(0.5, FEET_ORIGIN_Y)
      .setScale(SCALE);
    this.sprite.setDepth(y);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  canStandAt(x, y) {
    return FEET_PROBES.every(([dx, dy]) => this.isWalkable(x + dx, y + dy));
  }

  /** Moves by the input vector (each axis -1..1) for dt seconds. */
  update(dt, input) {
    const strength = Math.min(Math.hypot(input.x, input.y), 1);
    if (strength === 0) {
      this.stop();
      return;
    }
    this.working = false;

    const step = SPEED * this.speedMultiplier * strength * dt;
    const parts = Math.max(1, Math.ceil(step / MAX_SUBSTEP));
    const len = Math.hypot(input.x, input.y);
    const dx = (input.x / len) * (step / parts);
    const dy = (input.y / len) * (step / parts);
    for (let i = 0; i < parts; i++) this.moveWithSliding(dx, dy, step / parts);

    this.facing = this.pickFacing(input.x, input.y);
    this.sprite.anims.timeScale = Math.max(0.5, strength) * this.speedMultiplier;
    this.sprite.anims.play(`${this.carrying ? 'carry' : 'walk'}-${this.facing}`, true);
    this.moving = true;
    // Things lower on screen are closer to the camera, so they draw on top.
    this.sprite.setDepth(this.sprite.y);
  }

  // Try the full move first. If blocked, slide: along one axis, then along the
  // room's diagonal edges (iso walls and furniture are slanted, not square).
  moveWithSliding(dx, dy, step) {
    const { x, y } = this.sprite;
    const half = step * 0.5;
    const candidates = [
      [dx, dy],
      [dx, 0],
      [0, dy],
      [dx, -half], [dx, half],
      [-half, dy], [half, dy],
    ];
    for (const [cx, cy] of candidates) {
      // Only accept moves that still head the way you're pushing (no backing off walls).
      const forward = cx * dx + cy * dy > 0;
      if (forward && this.canStandAt(x + cx, y + cy)) {
        this.sprite.setPosition(x + cx, y + cy);
        return;
      }
    }
  }

  stop() {
    if (!this.moving) return;
    this.moving = false;
    this.showIdle();
  }

  showIdle() {
    if (this.working) return;
    this.sprite.anims.stop();
    this.sprite.setFrame(this.carrying ? CARRY_IDLE_FRAME[this.facing] : IDLE_FRAME[this.facing]);
  }

  /** Typing at a desk (back to the camera). Turning it off returns to idle. */
  setWorking(on) {
    if (on === this.working) return;
    this.working = on;
    if (on) {
      this.facing = 'up';
      this.sprite.anims.timeScale = 1;
      this.sprite.anims.play('work', true);
    } else {
      this.showIdle();
    }
  }

  setCarrying(on) {
    if (on === this.carrying) return;
    this.carrying = on;
    if (!this.moving) this.showIdle();
  }

  // Prefer the current facing on diagonals so the sprite doesn't flicker.
  pickFacing(vx, vy) {
    const ax = Math.abs(vx);
    const ay = Math.abs(vy);
    const bias = 1.25;
    const wasHorizontal = this.facing === 'left' || this.facing === 'right';
    const horizontal = wasHorizontal ? ax * bias >= ay : ax > ay * bias;
    if (horizontal) return vx < 0 ? 'left' : 'right';
    return vy < 0 ? 'up' : 'down';
  }
}
