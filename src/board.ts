import Phaser from 'phaser';
import { SOURCES, isForbidden, legalCell, type GameState, type Orientation, type Side } from './game/rules';

const GRID = 40;
const PAD = 30;
const DIM = GRID * 13 + PAD * 2;
const COLORS = { red: 0xf07867, blue: 0x79b6ed, grid: 0x354245, muted: 0x748486, cream: 0xf1eadc };
export interface BoardView {
  state: GameState;
  selected: { x: number; y: number } | null;
  orientation: Orientation;
  side: Side;
  interactive: boolean;
  showRays: boolean;
}
export function createBoard(parent: HTMLElement, onSelect: (x: number, y: number) => void) {
  let view: BoardView = { state: { moves: [], turn: 'red', outcome: null }, selected: null, orientation: '/', side: 'red', interactive: false, showRays: true };
  let scene: BoardScene;
  let hover: { x: number; y: number } | null = null;
  class BoardScene extends Phaser.Scene {
    graphics!: Phaser.GameObjects.Graphics;
    create() {
      scene = this;
      this.graphics = this.add.graphics();
      for (let index = 1; index <= 13; index++) {
        const position = PAD + (index - 0.5) * GRID;
        this.add.text(position, DIM - 12, String(index), { fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#819092' }).setOrigin(0.5);
        this.add.text(11, DIM - position, String(index), { fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#819092' }).setOrigin(0.5);
      }
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        hover = { x: Math.floor((pointer.x - PAD) / GRID) + 1, y: 13 - Math.floor((pointer.y - PAD) / GRID) };
        this.paint();
      });
      this.input.on('pointerout', () => { hover = null; this.paint(); });
      this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const x = Math.floor((pointer.x - PAD) / GRID) + 1;
        const y = 13 - Math.floor((pointer.y - PAD) / GRID);
        if (view.interactive && legalCell(view.state.moves, x, y)) onSelect(x, y);
      });
      this.paint();
    }
    center(x: number, y: number) { return { x: PAD + (x - 0.5) * GRID, y: PAD + (13.5 - y) * GRID }; }
    mirror(x: number, y: number, orientation: Orientation, color: number, alpha = 1, dashed = false) {
      const g = this.graphics;
      const p = this.center(x, y);
      const start = orientation === '/' ? 1 : -1;
      g.lineStyle(4, color, alpha);
      if (dashed) {
        for (let i = 0; i < 5; i++) {
          const a = -13 + i * 5.6;
          g.lineBetween(p.x + a, p.y - start * a, p.x + a + 3, p.y - start * (a + 3));
        }
      } else g.lineBetween(p.x - 13, p.y + start * 13, p.x + 13, p.y - start * 13);
      g.fillStyle(color, alpha * 0.8);
      g.fillCircle(p.x - 13, p.y + start * 13, 2);
      g.fillCircle(p.x + 13, p.y - start * 13, 2);
    }
    paint() {
      const g = this.graphics;
      if (!g) return;
      g.clear();
      g.fillStyle(0x162124);
      g.fillRoundedRect(PAD, PAD, GRID * 13, GRID * 13, 3);
      for (let x = 1; x <= 13; x++) for (let y = 1; y <= 13; y++) {
        const p = this.center(x, y);
        if (isForbidden(x, y)) {
          g.fillStyle(0x263335, 0.7);
          g.fillRect(p.x - 19, p.y - 19, 38, 38);
          g.lineStyle(1, 0x607173, 0.45);
          for (let offset = -14; offset <= 14; offset += 7) g.lineBetween(p.x + offset - 3, p.y + 3, p.x + offset + 3, p.y - 3);
        }
      }
      g.lineStyle(1, COLORS.grid, 0.8);
      for (let i = 0; i <= 13; i++) {
        g.lineBetween(PAD + i * GRID, PAD, PAD + i * GRID, PAD + 13 * GRID);
        g.lineBetween(PAD, PAD + i * GRID, PAD + 13 * GRID, PAD + i * GRID);
      }
      const last = view.state.moves.at(-1);
      if (last) {
        const p = this.center(last.x, last.y);
        g.fillStyle(COLORS[last.side], 0.09);
        g.fillRect(p.x - 19, p.y - 19, 38, 38);
        g.fillStyle(COLORS[last.side], 0.85);
        g.fillCircle(p.x + 14, p.y + 14, 2);
      }
      const path = view.state.outcome?.path;
      if (view.showRays && path?.length) {
        const color = COLORS[view.state.outcome!.winner as Side];
        for (const [width, alpha] of [[10, 0.06], [5, 0.12], [2, 0.95]]) {
          g.lineStyle(width, color, alpha);
          g.beginPath();
          path.forEach((step, index) => {
            const p = this.center(step.x, step.y);
            if (index === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
          });
          g.strokePath();
        }
        for (let i = 2; i < path.length - 1; i += 3) {
          const p = this.center(path[i].x, path[i].y);
          const previous = this.center(path[i - 1].x, path[i - 1].y);
          const angle = Math.atan2(p.y - previous.y, p.x - previous.x);
          g.lineStyle(1.5, color);
          g.lineBetween(p.x, p.y, p.x - 6 * Math.cos(angle - 0.6), p.y - 6 * Math.sin(angle - 0.6));
          g.lineBetween(p.x, p.y, p.x - 6 * Math.cos(angle + 0.6), p.y - 6 * Math.sin(angle + 0.6));
        }
      }
      for (const move of view.state.moves) {
        const transmitted = view.showRays && path?.some(step => step.x === move.x && step.y === move.y && step.action === 'transmit');
        this.mirror(move.x, move.y, move.orientation, COLORS[move.side], 1, transmitted);
      }
      for (const side of ['red', 'blue'] as Side[]) {
        const p = this.center(SOURCES[side].x, SOURCES[side].y);
        const color = COLORS[side];
        g.fillStyle(color, 0.15);
        g.fillRect(p.x - 19, p.y - 19, 38, 38);
        g.lineStyle(2, color);
        g.strokeCircle(p.x, p.y, 6);
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4;
          g.lineBetween(p.x + Math.cos(angle) * 10, p.y + Math.sin(angle) * 10, p.x + Math.cos(angle) * 14, p.y + Math.sin(angle) * 14);
        }
        g.lineStyle(5, 0xb9c3bc);
        if (side === 'red') {
          g.lineBetween(p.x + 20, p.y - 20, p.x + 20, p.y + 20);
          g.lineBetween(p.x - 20, p.y + 20, p.x + 20, p.y + 20);
        } else {
          g.lineBetween(p.x - 20, p.y - 20, p.x - 20, p.y + 20);
          g.lineBetween(p.x - 20, p.y - 20, p.x + 20, p.y - 20);
        }
      }
      const ghost = view.selected || hover;
      if (view.interactive && ghost && legalCell(view.state.moves, ghost.x, ghost.y)) {
        const p = this.center(ghost.x, ghost.y);
        g.fillStyle(COLORS[view.side], 0.12);
        g.fillRect(p.x - 19, p.y - 19, 38, 38);
        g.lineStyle(1.5, COLORS[view.side], view.selected ? 0.9 : 0.4);
        g.strokeRect(p.x - 18, p.y - 18, 36, 36);
        this.mirror(ghost.x, ghost.y, view.orientation, COLORS[view.side], view.selected ? 0.85 : 0.35);
      }
    }
  }
  const game = new Phaser.Game({ type: Phaser.CANVAS, parent, width: DIM, height: DIM, transparent: true,
    scene: BoardScene, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true }, banner: false, audio: { noAudio: true } });
  return { update(next: BoardView) { view = next; scene?.paint(); }, destroy() { game.destroy(true); } };
}
