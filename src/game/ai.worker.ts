import { chooseMove } from './ai';
self.onmessage = event => {
  const { state, difficulty, requestId } = event.data;
  self.postMessage({ move: chooseMove(state, difficulty), requestId });
};
