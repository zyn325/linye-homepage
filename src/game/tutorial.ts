import { emptyGame, type GameState, type Move, type RayStep } from './rules';

export interface Lesson {
  title: string;
  description: string;
  hint: string;
  success: string;
  moves: Move[];
  target: Move;
  path?: RayStep[];
}

// Walk through every cell so the teaching ray uses the same coordinates as a winning ray.
function ray(points: [number, number][]): RayStep[] {
  const result: RayStep[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [tx, ty] = points[i + 1];
    const dx = Math.sign(tx - x), dy = Math.sign(ty - y);
    const direction = dy > 0 ? 0 : dx > 0 ? 1 : dy < 0 ? 2 : 3;
    if (result.length) Object.assign(result.at(-1)!, { direction, action: 'reflect' });
    else result.push({ x, y, direction });
    for (let cx = x + dx, cy = y + dy; cx !== tx + dx || cy !== ty + dy; cx += dx, cy += dy) {
      result.push({ x: cx, y: cy, direction });
    }
  }
  return result;
}

export const lessons: Lesson[] = [
  {
    title: '让光转弯',
    description: '红光可以向上出发。试着放一面正斜镜，让它向右转弯。斜纹格不能落镜，但光可以经过。',
    hint: '选择高亮格 (5, 11)，使用 / 正斜镜，再确认落子。',
    success: '红光向上遇到 / 镜，转向右方。镜子每次反射都会让光转弯 90°。',
    moves: [], target: { x: 5, y: 11, side: 'red', orientation: '/' },
    path: ray([[5, 9], [5, 11], [8, 11]])
  },
  {
    title: '借用对手的镜子',
    description: '光也会遇到对手的镜子，但必须反射。红光经过蓝色反斜镜会向下；再放一面镜子接住它。',
    hint: '在高亮格 (8, 8) 放置 / 正斜镜。',
    success: '蓝镜把红光从右方转向下方，你的 / 镜又把它转向左方。双方的镜子都会影响局势。',
    moves: [{ x: 5, y: 11, side: 'red', orientation: '/' }, { x: 8, y: 11, side: 'blue', orientation: '\\' }],
    target: { x: 8, y: 8, side: 'red', orientation: '/' },
    path: ray([[5, 9], [5, 11], [8, 11], [8, 8], [6, 8]])
  },
  {
    title: '镜子之间留一点空隙',
    description: '同阵营镜子不能沿镜面首尾相接。试选 (2, 2)：/ 镜会连接 (1, 1) 的红镜；切换到另一种朝向就合法了。不同阵营可以相接。',
    hint: '选择 (2, 2)，先观察 / 镜的提示，再切换为 \\ 反斜镜并确认。',
    success: '两面红镜不再首尾相接。这个限制只禁止对角相邻、同色且同朝向的镜面相接，隔有空格则允许。',
    moves: [{ x: 1, y: 1, side: 'red', orientation: '/' }, { x: 13, y: 1, side: 'blue', orientation: '/' }],
    target: { x: 2, y: 2, side: 'red', orientation: '\\' }
  },
  {
    title: '透过自己的镜子，连通光源',
    description: '己方镜子可以反射，也可以透射。红光透过 (5, 11) 的己方镜子，沿外侧绕行。补上最后一面镜子，从蓝方开放的右侧进入光源。',
    hint: '在 (12, 5) 放置 / 正斜镜，完成红方光路。系统会自动寻找每次反射或透射的组合。',
    success: '连通成功！虚线镜表示光在此透射。若同一手让双方同时连通，会先判对手获胜；每次落镜也要检查对手的路线。',
    moves: [
      { x: 5, y: 11, orientation: '\\', side: 'red' },
      { x: 6, y: 11, orientation: '\\', side: 'blue' },
      { x: 5, y: 13, orientation: '/', side: 'red' },
      { x: 6, y: 3, orientation: '\\', side: 'blue' },
      { x: 12, y: 13, orientation: '\\', side: 'red' },
      { x: 9, y: 3, orientation: '/', side: 'blue' }
    ], target: { x: 12, y: 5, side: 'red', orientation: '/' }
  }
];

export function lessonState(index: number): GameState {
  return { ...emptyGame(), moves: lessons[index].moves.map(move => ({ ...move })) };
}
