// Shared game state (cash, power). Scenes listen for its events to update.
import * as Phaser from 'phaser';
import { POWER_TIERS } from '../data/catalog.js';

class GameState extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.cash = 0; // only cash stashed in the hamper counts
    this.powerTier = 0;
    this.powerUsed = 0;
  }

  get power() {
    const tier = POWER_TIERS[this.powerTier];
    return { used: this.powerUsed, capacity: tier.capacity, tierName: tier.name };
  }

  addCash(amount) {
    this.cash += amount;
    this.emit('cash', this.cash, amount);
  }

  /** Spends cash if there's enough. Returns true on success. */
  spend(amount) {
    if (this.cash < amount) return false;
    this.cash -= amount;
    this.emit('cash', this.cash, -amount);
    return true;
  }

  setPowerUsed(watts) {
    this.powerUsed = watts;
    this.emit('power', this.power);
  }

  setPowerTier(index) {
    this.powerTier = Math.max(0, Math.min(POWER_TIERS.length - 1, index));
    this.emit('power', this.power);
  }
}

export const gameState = new GameState();
