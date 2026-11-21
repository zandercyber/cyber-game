// The player character: movement, collision and animation.

const SPEED = 240; // world pixels per second at full stick
const SCALE = 2; // sprite sheet frames are 32x52; drawn at 2x
const FEET_ORIGIN_Y = 51 / 52; // feet sit on row 51 of each frame
// Points around the feet that must all be on open floor (keeps the body off walls).
const FEET_PROBES = [[-14, 0], [14, 0], [0, -8], [0, 4]];

// Sprite sheet layout: 4 columns per row. See docs in the project spec.
const ROWS = { idle: 0, walkDown: 1, walkLeft: 2, walkRight: 3, walkUp: 4 };
const IDLE_FRAME = { down: 0, left: 1, right: 2, up: 3 };

export function createPlayerAnimations(scene) {
  const row = (r) => [0, 1, 2, 3].map((c) => r * 4 + c);
  const walks = { down: ROWS.walkDown, left: ROWS.walkLeft, right: ROWS.walkRight, up: ROWS.walkUp };
  for (const [dir, r] of Object.entries(walks)) {
    scene.anims.create({
      key: `walk-${dir}`,
      frames: scene.anims.generateFrameNumbers('player', { frames: row(r) }),
      frameRate: 8,
      repeat: -1,
    });
  }
}

export class Player {
  constructor(scene, x, y, isWalkable, facing = 'down') {
    this.scene = scene;
    this.isWalkable = isWalkable;
    this.facing = facing;
    this.moving = false;
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

    const step = SPEED * strength * dt;
    const dx = (input.x / Math.hypot(input.x, input.y)) * step;
    const dy = (input.y / Math.hypot(input.x, input.y)) * step;

    this.moveWithSliding(dx, dy, step);

    this.facing = this.pickFacing(input.x, input.y);
    this.sprite.anims.timeScale = Math.max(0.5, strength);
    this.sprite.anims.play(`walk-${this.facing}`, true);
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
    this.sprite.anims.stop();
    this.sprite.setFrame(IDLE_FRAME[this.facing]);
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
