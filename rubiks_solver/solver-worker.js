// Run the unchanged Kociemba engine away from the UI and animation thread.
'use strict';
importScripts('min2phase.js');

self.onmessage = ({ data: { id, facelet } }) => {
  try {
    self.postMessage({ id, solution: min2phase.solve(facelet) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
